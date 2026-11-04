import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next dev` is started on localhost while some browsers and local test
  // tools open the same server as 127.0.0.1. Allow that dev origin so the
  // client bundle/HMR and Server Actions remain usable from either address.
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: ["127.0.0.1"],
        experimental: {
          serverActions: { allowedOrigins: ["127.0.0.1:3000"] },
        },
      }
    : {}),
};

export default nextConfig;
