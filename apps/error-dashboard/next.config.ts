import path from "path";
import type { NextConfig } from "next";

interface WebpackConfig {
  resolve: {
    alias: Record<string, string>;
  };
  externals?: any[];
  plugins?: any[];
}

const nextConfig: NextConfig = {
  // Включаем standalone режим для production (кроме явного отключения)
  ...((process.env.NODE_ENV === "production" || process.env.USE_STANDALONE === "true") &&
    process.env.DISABLE_STANDALONE !== "true" && { output: "standalone" }),
  serverExternalPackages: ["@gafus/prisma", "@prisma/client"],
  eslint: {
    // Игнорируем ESLint во время сборки
    // Проверки можно запускать отдельно: pnpm lint
    ignoreDuringBuilds: true,
    dirs: ["src"],
  },
  typescript: {
    // Игнорируем TypeScript проверки во время сборки
    // Проверки можно запускать отдельно: pnpm typecheck
    ignoreBuildErrors: true,
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
    NEXT_PUBLIC_SEQ_URL: process.env.NEXT_PUBLIC_SEQ_URL || "http://localhost:5341",
  },
  // Вся статика на CDN, отключаем оптимизацию
  images: {
    unoptimized: true,
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

  // Webpack конфигурация для создания dummy файла worker.js
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");
      config.plugins = config.plugins || [];
      config.plugins.push(new PrismaPlugin());
    }
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/logger": path.resolve(__dirname, "../../packages/logger/dist"),
    };

    // Webpack плагин для создания dummy файла lib/worker.js (processAssets — webpack 5)
    config.plugins = config.plugins || [];
    config.plugins.push({
      apply: (compiler: any) => {
        const { RawSource } = compiler.webpack?.sources || require("webpack").sources;
        compiler.hooks.compilation.tap("CreateWorkerFile", (compilation: any) => {
          const stage = compilation.constructor.PROCESS_ASSETS_STAGE_ADDITIONAL;
          compilation.hooks.processAssets.tap(
            { name: "CreateWorkerFile", stage },
            (assets: any) => {
              assets["lib/worker.js"] = new RawSource("module.exports = {};");
            },
          );
        });
      },
    });

    return config;
  },
};

export default nextConfig;
