import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence monorepo lockfile warning on Vercel
  turbopack: {
    root: "..",
  },
};

export default nextConfig;
