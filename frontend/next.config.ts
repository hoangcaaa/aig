import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Resolve monorepo root for Turbopack (must be absolute on Vercel)
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
