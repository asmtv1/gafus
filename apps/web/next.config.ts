// next.config.js ─ CommonJS-вариант для @ducanh2912/next-pwa ≥ 10
interface WebpackConfig {
  resolve: {
    alias: Record<string, string>;
  };
  externals?: any[];
  plugins?: any[];
}

const _path = require("path");
const withPWAInit = require("@ducanh2912/next-pwa").default;

// Bundle analyzer
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// 2. Отключаем только Workbox, но оставляем PWA манифест и метатеги
// PWA будет работать через наш кастомный Service Worker в /public/sw.js
const withPWA = withPWAInit({
  disable: true, // Отключаем только автогенерацию Workbox, НЕ PWA функциональность
  // PWA манифест и метатеги остаются активными
});

// 3. основной конфиг Next.js
const nextConfig = {
  reactStrictMode: true,
  // Включаем standalone режим только для production/Docker
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),
  // Исправляем проблемы с standalone сборкой
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  // Исправляем проблемы с React 19 и Next.js 14
  transpilePackages: ['@gafus/auth', '@gafus/prisma', '@gafus/logger', '@gafus/types', '@gafus/error-handling'],
  // Настройки для больших файлов (видео)
  serverRuntimeConfig: {
    // Максимальный размер body для API routes
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
  // Настройки для клиентской части
  publicRuntimeConfig: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
  // Переменные окружения для клиентской части
  env: {
    NEXT_PUBLIC_TRAINER_PANEL_URL: process.env.NEXT_PUBLIC_TRAINER_PANEL_URL || 'https://trainer-panel.gafus.ru',
  },
  // Отключаем ESLint проверки во время сборки
  // Проверки можно запускать отдельно: pnpm lint
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ["src"],
  },

  // Разрешаем dev-доступ к /_next/* с кастомного хоста
  allowedDevOrigins: [
    "http://web.gafus.localhost",
    "web.gafus.localhost",
    "http://webw.gafus.localhost", // Добавить этот хост
    "webw.gafus.localhost", // И этот
    "http://localhost:3002",
  ],

  // Исправляем проблемы с clientReferenceManifest в Next.js 14
  serverExternalPackages: ['sharp'],
  
  // Оптимизации для bundle
  experimental: {
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
    ],
    serverActions: {
      bodySizeLimit: '100mb', // Лимит для Server Actions (для загрузки видео)
    },
  },

  // Webpack конфигурация для workspace зависимостей
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/auth": _path.resolve(__dirname, "../../packages/auth/dist"),
      "@gafus/auth/server": _path.resolve(__dirname, "../../packages/auth/dist"),
      "@gafus/react-query": _path.resolve(__dirname, "../../packages/react-query/dist"),
      "@gafus/types": _path.resolve(__dirname, "../../packages/types/src"),
      "@gafus/csrf": _path.resolve(__dirname, "../../packages/csrf/src"),
      "@gafus/error-handling": _path.resolve(__dirname, "../../packages/error-handling/dist"),
      "@gafus/prisma": _path.resolve(__dirname, "../../packages/prisma/dist"),
      "@gafus/webpush": _path.resolve(__dirname, "../../packages/webpush/dist"),
      "@gafus/logger": _path.resolve(__dirname, "../../packages/logger/dist"),
    };

    // Исправляем проблемы с standalone сборкой и clientReferenceManifest
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'sharp': 'commonjs sharp',
      });
    }

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

  // Отключаем Image Optimization - вся статика на CDN
  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Кэширование HTML страниц для офлайн работы
      {
        source: "/courses",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=60" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/statistics",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=60" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/favorites",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=60" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Кэширование презентации (HTML с инлайн CSS/JS)
      {
        source: "/presentation.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Type", value: "text/html; charset=utf-8" },
        ],
      },
      // Кэширование тестовой страницы с анимацией собаки
      {
        source: "/test-dog.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Type", value: "text/html; charset=utf-8" },
        ],
      },
    ];
  },
};

// 4. экспорт: оборачиваем nextConfig функцией-обёрткой
module.exports = withBundleAnalyzer(withPWA(nextConfig));
