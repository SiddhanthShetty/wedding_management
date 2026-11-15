import localFont from "next/font/local";

// The invitation site's own fonts (SIL Open Font License), self-hosted. Used by the family links
// (/i/<code>) and the couple's preview (/invitation-preview).
export const inviteCormorant = localFont({
  variable: "--font-inv-cormorant",
  display: "swap",
  src: [
    { path: "../fonts/invite/cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/invite/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/invite/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/invite/cormorant-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/invite/cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
  ],
});
export const inviteMarcellus = localFont({ variable: "--font-inv-marcellus", display: "swap", src: [{ path: "../fonts/invite/marcellus-latin-400-normal.woff2", weight: "400", style: "normal" }] });
