import type { NextConfig } from "next";

const backendUrl = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Each app manages its own lockfile; without this, Turbopack infers the
  // monorepo root from the top-level package-lock.json.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Allow images from any host since product images are admin-uploaded
    // and can reference any CDN or storage URL.
    // Restrict to specific domains once image hosting is finalized.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
