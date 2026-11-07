import { Cormorant_Garamond, Inter, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Serif_Devanagari, Noto_Serif_Kannada } from "next/font/google";

// Self-hosted by next/font: no request to Google at runtime, and every device gets the same
// fonts. Indic fonts are not preloaded; the browser downloads them only when that script appears.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
export const notoSansKannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-noto-sans-kannada", display: "swap", preload: false });
export const notoSerifKannada = Noto_Serif_Kannada({ subsets: ["kannada"], variable: "--font-noto-serif-kannada", display: "swap", preload: false });
export const notoSansDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-sans-devanagari", display: "swap", preload: false });
export const notoSerifDevanagari = Noto_Serif_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-serif-devanagari", display: "swap", preload: false });

export const fontVariables = [inter, cormorant, notoSansKannada, notoSerifKannada, notoSansDevanagari, notoSerifDevanagari].map((font) => font.variable).join(" ");
