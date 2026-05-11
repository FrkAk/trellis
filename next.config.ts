import type { NextConfig } from "next";
import { headerRules } from "./lib/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return headerRules(process.env.NODE_ENV === "production");
  },
};

export default nextConfig;
