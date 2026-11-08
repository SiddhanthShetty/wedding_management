import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";

// Absolute URLs for link previews. Set NEXT_PUBLIC_SITE_URL to your domain (e.g. https://our-wedding.in);
// on Vercel the deployment URL is used when it is not set.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "Wedding Desk — Planning workspace",
  description: "A private workspace for wedding planning.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React loads. This
          ignores attribute differences on this one element only; children are still checked. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
