import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Static export: `npm run build` writes ./out, which any static host can serve.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // the repository root has its own package-lock.json; the site is its own workspace
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};
export default config;
