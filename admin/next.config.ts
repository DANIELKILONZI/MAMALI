import type { NextConfig } from "next";

const backendUrl = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // Each app manages its own lockfile; without this, Turbopack infers the
  // monorepo root from the top-level package-lock.json.
  turbopack: {
    root: __dirname,
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
