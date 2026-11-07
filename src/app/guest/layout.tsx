import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You are invited · Private wedding invitation",
  description: "Open your private link to see your invitation and reply.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function GuestPortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="guest-portal-shell">{children}</div>;
}
