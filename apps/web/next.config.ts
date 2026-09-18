import type { NextConfig } from "next";

const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4322";

const nextConfig: NextConfig = {
  // Preview and local browsers hit 127.0.0.1, not localhost. Without this, Next 16
  // blocks /_next chunks and the app never hydrates (forms do a native GET, /app
  // stays on the SSR loading label forever).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      { source: "/backend/:path*", destination: `${api}/:path*` },
      { source: "/api/:path*", destination: `${api}/:path*` },
    ];
  },
};

export default nextConfig;
