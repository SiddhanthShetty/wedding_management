import type { Metadata, Viewport } from "next";
import { coupleNames } from "@/config/invitation";
import { inviteCormorant, inviteMarcellus } from "@/app/invite-fonts";

export const metadata: Metadata = {
  title: `Preview · ${coupleNames} | Wedding Invitation`,
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: "#F5E5D1", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/** The couple's preview of a family's invitation. Signed-in members only; shown inside Guests → Invitation. */
export default function InvitationPreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`invite-site ${inviteCormorant.variable} ${inviteMarcellus.variable}`}>{children}</div>;
}
