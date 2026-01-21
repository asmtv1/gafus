import path from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Включаем standalone режим для production (кроме явного отключения)
  ...((process.env.NODE_ENV === 'production' || process.env.USE_STANDALONE === 'true') && 
      process.env.DISABLE_STANDALONE !== 'true' && { output: 'standalone' }),
  experimental: {
    // В dev режиме используем все CPU и worker threads для ускорения компиляции
    ...(process.env.NODE_ENV !== 'production' && {
      workerThreads: true,
    }),
    serverActions: {
      bodySizeLimit: '600mb', // Лимит для Server Actions (для загрузки видео до 500 МБ)
    },
  },
  eslint: {
    // Игнорируем ESLint во время сборки
    // Проверки можно запускать отдельно: pnpm lint
    ignoreDuringBuilds: true,
    dirs: ["src"],
  },

  // Внешние пакеты для server components
  serverExternalPackages: ['@aws-sdk/client-s3', 'bcrypt'],

  // Вся статика обслуживается через CDN / nginx, отключаем оптимизацию
  images: {
    unoptimized: true,
  },

  // Больше не требуется: статика на CDN (см. nginx)

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
      "@gafus/logger": path.resolve(__dirname, "../../packages/logger/dist"),
      "@gafus/ui-components": path.resolve(__dirname, "../../packages/ui-components/src"),
    };

    // Создаем dummy-файл lib/worker.js, чтобы подавить попытки загрузки thread-stream/worker
    // в окружении Next.js (исправляет "the worker has exited").
    // При необходимости можно отключить этот трюк, удалив плагин.
    // Он не влияет на прод, т.к. prod собирается в standalone.
    // Аналогичный трюк используется в @gafus/web.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config.plugins = config.plugins || []).push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
