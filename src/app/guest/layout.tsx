import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wedding invitation",
  description: "This invitation link has changed.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function RetiredGuestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
