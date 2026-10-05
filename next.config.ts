import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standard output. `next build` fails on TypeScript errors (by design —
  // `npm run qa` and the build gate share the same type contract).
  reactStrictMode: false,
};

export default nextConfig;
