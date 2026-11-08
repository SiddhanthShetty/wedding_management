
/** Font family names from a computed `font-family` value, without quotes or generic families. */
export function familyNames(fontFamily: string): string[] {
  const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "-apple-system"]);
  return fontFamily.split(",").map((name) => name.trim().replace(/^["']|["']$/g, "")).filter((name) => name && !generic.has(name));
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("A font could not be loaded.");
  const blob = await response.blob();
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("A font could not be read.")); reader.readAsDataURL(blob); });
}

/**
 * @font-face rules (with fonts inlined as data URLs) for the given families, read from this page's
 * own same-origin stylesheets (next/font). An exported SVG image cannot load web fonts any other way.
 */
async function embeddedFontCss(families: Set<string>): Promise<string> {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try { cssRules = sheet.cssRules; } catch { continue; } // cross-origin sheets are not readable; ours are same-origin
    for (const rule of Array.from(cssRules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "");
      if (!families.has(family)) continue;
      const match = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue("src"));
      if (!match) continue;
      const source = new URL(match[1]!, sheet.href ?? window.location.href).toString();
      if (new URL(source).origin !== window.location.origin) continue;
      const css = rule.cssText.replace(match[0], `url("${await toDataUrl(source)}")`);
      rules.push(css);
    }
  }
  return rules.join("\n");
}

/**
 * Converts the on-screen SVG card to a PNG on the planner's device. The card's fonts are embedded,
 * so Kannada, Tulu and Hindi look the same on every phone. Nothing is uploaded.
 */
export async function svgElementToPng(svg: SVGSVGElement): Promise<Blob> {
  return svgElementToImage(svg, "image/png");
}

/** Like svgElementToPng, as PNG or JPEG (JPEG pages keep the PDF card small enough for WhatsApp). */
export async function svgElementToImage(svg: SVGSVGElement, type: "image/png" | "image/jpeg", quality = 0.88): Promise<Blob> {
  // Every format declares its pixel size in its viewBox (e.g. 1080×1920 for Story, 1748×2480 for print).
  const box = svg.viewBox.baseVal;
  const width = Math.round(box?.width || 1080); const height = Math.round(box?.height || 1350);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  // Resolve var(--font-…) to real family names, make sure those fonts are loaded, then embed them.
  const originals = Array.from(svg.querySelectorAll("text"));
  const copies = Array.from(clone.querySelectorAll("text"));
  const families = new Set<string>();
  await Promise.all(originals.map(async (text, index) => {
    const computed = getComputedStyle(text);
    copies[index]?.style.setProperty("font-family", computed.fontFamily);
    familyNames(computed.fontFamily).forEach((name) => families.add(name));
    try { await document.fonts.load(`${computed.fontStyle} ${computed.fontWeight} 32px ${computed.fontFamily}`, text.textContent ?? ""); } catch { /* fall back to what is loaded */ }
  }));
  try {
    const css = await embeddedFontCss(families);
    if (css) {
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  } catch { /* The card still exports with device fonts if embedding fails. */ }
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The card could not be drawn.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create images.");
    if (type === "image/jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); }
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The card could not be saved as an image.")), type, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cardFileName(name: string) {
  return `invitation-${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest"}.png`;
}
