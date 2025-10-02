import path from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Включаем standalone режим для Docker
  output: 'standalone',
  eslint: {
    // ESLint проверки включены для качества кода
    ignoreDuringBuilds: false,
    dirs: ["src"],
  },

  // Внешние пакеты для server components
  serverExternalPackages: ['@aws-sdk/client-s3'],

  // Конфигурация для изображений
  images: {
    // Разрешаем загрузку изображений с любых доменов
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
    // Отключаем оптимизацию для локальных изображений
    unoptimized: true,
    // Обработка ошибок загрузки
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Webpack конфигурация для workspace зависимостей
  webpack: (config, { isServer: _isServer }) => {
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/react-query": path.resolve(__dirname, "../../packages/react-query/src"),
      "@gafus/types": path.resolve(__dirname, "../../packages/types/src"),
      "@gafus/csrf": path.resolve(__dirname, "../../packages/csrf/src"),
      "@gafus/error-handling": path.resolve(__dirname, "../../packages/error-handling/src"),
      "@gafus/prisma": path.resolve(__dirname, "../../packages/prisma/src"),
      "@gafus/ui-components": path.resolve(__dirname, "../../packages/ui-components/src"),
    };

    return config;
  },
};

export default nextConfig;
