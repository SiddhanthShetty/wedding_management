import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { coupleNames } from "@/config/invitation";

// The invitation site's own fonts (SIL Open Font License), self-hosted.
const cormorant = localFont({
  variable: "--font-inv-cormorant",
  display: "swap",
  src: [
    { path: "../../fonts/invite/cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/invite/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/invite/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/invite/cormorant-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../fonts/invite/cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
  ],
});
const marcellus = localFont({ variable: "--font-inv-marcellus", display: "swap", src: [{ path: "../../fonts/invite/marcellus-latin-400-normal.woff2", weight: "400", style: "normal" }] });

export const metadata: Metadata = {
  title: `${coupleNames} | Wedding Invitation`,
  description: "Your invitation, with the events, directions and a place to reply.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#F5E5D1", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/** Family invitation links: the couple's invitation site, inside the planning app. */
export default function InvitationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`invite-site ${cormorant.variable} ${marcellus.variable}`}>{children}</div>;
}
