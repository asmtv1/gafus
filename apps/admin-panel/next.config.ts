import type { NextConfig } from "next";

interface WebpackConfig {
  resolve: {
    alias: Record<string, string>;
  };
  externals?: any[];
  plugins?: any[];
}

const nextConfig: NextConfig = {
  // Включаем standalone режим для Docker
  output: 'standalone',
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
  // Конфигурация для изображений с CDN
  images: {
    loader: 'custom',
    loaderFile: './src/lib/imageLoader.ts',
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
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
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

