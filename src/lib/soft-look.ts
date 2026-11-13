/**
 * The "soft look" for the planning workspace: a warm tint from the couple's theme with raised and
 * pressed surfaces, while text, inputs and buttons keep readable contrast (see the tests).
 */
import { contrastRatio, darkenToContrast } from "@/lib/invitations/content";

export const LOOK_COOKIE = "wedding-look";
/** Sent by Settings → Appearance so the open page switches look straight away. */
export const LOOK_EVENT = "wedding-desk:look";
export type Look = "classic" | "soft";

function mix(a: string, b: string, amount: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - amount) + channel(b, i) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function softPalette(accent = "#a67c3b") {
  const bg = mix("#f1eee7", accent, 0.07);
  const surface = mix(bg, "#ffffff", 0.5);
  const inset = mix(surface, "#6b5f45", 0.07);
  // Text and control edges are measured against the darkest surface they can sit on, which
  // depends on the accent (a saturated accent can make the page tint darker than the inputs).
  const darkest = [bg, surface, inset].sort((x, y) => contrastRatio(y, "#ffffff") - contrastRatio(x, "#ffffff"))[0]!;
  return {
    bg, surface, inset,
    shadow: mix(bg, "#5c5240", 0.2),
    line: mix(bg, "#5c5240", 0.16),
    muted: darkenToContrast("#6a6e63", darkest, 4.5),
    border: darkenToContrast("#8a8578", darkest, 3),
  };
}

export function softStyleVars(accent?: string | null) {
  const p = softPalette(accent ?? undefined);
  return { "--soft-bg": p.bg, "--soft-surface": p.surface, "--soft-inset": p.inset, "--soft-shadow": p.shadow, "--soft-line": p.line, "--soft-muted": p.muted, "--soft-border": p.border };
}
