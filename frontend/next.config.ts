import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
