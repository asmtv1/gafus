import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@gafus/prisma"],
  eslint: {
    // ESLint проверки включены для качества кода
    ignoreDuringBuilds: false,
    dirs: ["src"],
  },
  typescript: {
    // TypeScript проверки включены для качества кода
    ignoreBuildErrors: false,
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
  // Настройки для поддомена
  assetPrefix: undefined,
  basePath: "",
  trailingSlash: false,
};

export default nextConfig;
