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
  // Включаем standalone режим только для production (ускоряет dev)
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),
  serverExternalPackages: ["@gafus/prisma"],
  eslint: {
    // Отключаем ESLint проверки в dev режиме для ускорения компиляции
    // Проверки можно запускать отдельно: pnpm lint
    ignoreDuringBuilds: process.env.NODE_ENV !== 'production',
    dirs: ["src"],
  },
  typescript: {
    // Отключаем TypeScript проверки в dev режиме для ускорения компиляции
    // Проверки можно запускать отдельно: pnpm typecheck
    ignoreBuildErrors: process.env.NODE_ENV !== 'production',
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Вся статика обслуживается через CDN / nginx, отключаем оптимизацию
  images: {
    unoptimized: true,
  },

  // Больше не требуется: статика на CDN (см. nginx)
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
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/logger": path.resolve(__dirname, "../../packages/logger/dist"),
    };

    // Webpack плагин для создания dummy файла lib/worker.js
    config.plugins = config.plugins || [];
    config.plugins.push({
      apply: (compiler: any) => {
        compiler.hooks.emit.tap('CreateWorkerFile', (compilation: any) => {
          compilation.assets['lib/worker.js'] = {
            source: () => 'module.exports = {};',
            size: () => 20,
          };
        });
      },
    });

    return config;
  },
};

export default nextConfig;

