import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Keep the native SQLite module outside the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
  async headers() {
    return [{ source: "/aro-sw.js", headers: [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Service-Worker-Allowed", value: "/" },
    ] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withWorkflow(nextConfig);
