import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/lib/color";
import { softPalette } from "../src/lib/soft-look";

// The invitation's gold and maroon, older theme accents, and extremes.
const accents = ["#b9853a", "#5e0b12", "#e2b45a", "#e98b1d", "#d9a23a", "#000000", "#ffffff", "#ff0000", "#0000ff", undefined];

describe("soft look stays readable for every theme and custom accent", () => {
  for (const accent of accents) it(`accent ${accent ?? "default"}`, () => {
    const p = softPalette(accent);
    for (const surface of [p.bg, p.surface, p.inset]) {
      expect(contrastRatio(p.muted, surface), "helper text").toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#262923", surface), "main text").toBeGreaterThanOrEqual(7);
    }
    for (const surface of [p.surface, p.inset]) expect(contrastRatio(p.border, surface), "input and button edges").toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#ffffff", "#526b58"), "primary button text").toBeGreaterThanOrEqual(4.5);
  });
  it("is tinted by the theme and stays light", () => {
    const gold = softPalette("#e2b45a"); const orange = softPalette("#e98b1d");
    expect(gold.bg).not.toBe(orange.bg);
    for (const accent of accents) expect(contrastRatio(softPalette(accent).bg, "#000000")).toBeGreaterThan(14);
  });
});
