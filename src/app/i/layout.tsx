import type { Metadata, Viewport } from "next";
import { coupleNames } from "@/config/invitation";
import { inviteCormorant as cormorant, inviteMarcellus as marcellus } from "@/app/invite-fonts";

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
