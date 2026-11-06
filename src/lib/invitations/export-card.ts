import { CARD_HEIGHT, CARD_WIDTH } from "@/components/invitation-card";

/**
 * Converts the on-screen SVG card to a PNG on the planner's device. Device fonts are used, so
 * Kannada and Devanagari render with the system's script fonts; nothing is uploaded.
 */
export async function svgElementToPng(svg: SVGSVGElement): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(CARD_WIDTH));
  clone.setAttribute("height", String(CARD_HEIGHT));
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The card could not be drawn.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create images.");
    context.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The card could not be saved as an image.")), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cardFileName(name: string) {
  return `invitation-${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest"}.png`;
}
