import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy without nonces (see node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md, "Without Nonces"). The browser only talks to this site: Supabase is
 * called from the server, and external links (maps, WhatsApp, Instagram) are plain navigation.
 * blob:/data: images and media are the card export, PDF pages and the video made on the device.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Development only: the Next.js route badge covered the sidebar in every corner. Build and
  // runtime errors are still shown when they happen.
  devIndicators: false,
  async headers() {
    // Referrer-Policy is set per area: the guest portal sends none at all (see the Supabase proxy).
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // `next dev` is started on localhost while some browsers and local test
  // tools open the same server as 127.0.0.1. Allow that dev origin so the
  // client bundle/HMR and Server Actions remain usable from either address.
  ...(isDev
    ? {
        allowedDevOrigins: ["127.0.0.1"],
        experimental: {
          serverActions: { allowedOrigins: ["127.0.0.1:3000"] },
        },
      }
    : {}),
};

export default nextConfig;
