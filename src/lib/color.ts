/** Colour contrast helpers (WCAG), used for the couple's chosen accent colour. */

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Darkens a colour step by step (towards black) until it reaches 4.5:1 on `background`. */
export function darkenToContrast(hex: string, background = "#ffffff", target = 4.5): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let step = 0; step <= 20; step += 1) {
    const factor = 1 - step * 0.05;
    const color = `#${rgb.map((v) => Math.round(v * factor).toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(color, background) >= target) return color;
  }
  return "#000000";
}
