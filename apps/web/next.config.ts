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

// Общие алиасы для webpack и Turbopack (workspace-пакеты).
// Важно: более длинные пути для core — первыми, иначе сработает @gafus/core и попадёт src вместо dist (на проде 500).
const gafusAliases = {
  "@gafus/core/updatePetPhoto": _path.resolve(
    __dirname,
    "../../packages/core/src/services/pets/petsService.ts",
  ),
  "@gafus/core/services/training/trainingService": _path.resolve(
    __dirname,
    "../../packages/core/dist/core/src/services/training/trainingService.js",
  ),
  "@gafus/core/services/training": _path.resolve(
    __dirname,
    "../../packages/core/dist/core/src/services/training",
  ),
  "@gafus/core": _path.resolve(__dirname, "../../packages/core/src"),
  "@gafus/core/services/course": _path.resolve(__dirname, "../../packages/core/src/services/course"),
  "@gafus/core/services/coursePath": _path.resolve(
    __dirname,
    "../../packages/core/src/services/coursePath",
  ),
  "@gafus/core/services/diary": _path.resolve(__dirname, "../../packages/core/src/services/diary"),
  "@gafus/core/services/user": _path.resolve(__dirname, "../../packages/core/src/services/user"),
  "@gafus/core/services/auth": _path.resolve(__dirname, "../../packages/core/src/services/auth"),
  "@gafus/core/services/consent": _path.resolve(
    __dirname,
    "../../packages/core/src/services/consent",
  ),
  "@gafus/core/services/notifications": _path.resolve(
    __dirname,
    "../../packages/core/src/services/notifications",
  ),
  "@gafus/core/services/subscriptions": _path.resolve(
    __dirname,
    "../../packages/core/src/services/subscriptions",
  ),
  "@gafus/core/services/tracking": _path.resolve(
    __dirname,
    "../../packages/core/src/services/tracking",
  ),
  "@gafus/core/services/achievements": _path.resolve(
    __dirname,
    "../../packages/core/src/services/achievements",
  ),
  "@gafus/core/services/pets": _path.resolve(__dirname, "../../packages/core/src/services/pets"),
  "@gafus/core/errors": _path.resolve(__dirname, "../../packages/core/src/errors"),
  "@gafus/core/utils": _path.resolve(__dirname, "../../packages/core/src/utils"),
  "@gafus/core/utils/social": _path.resolve(__dirname, "../../packages/core/src/utils/social"),
  "@gafus/core/utils/training": _path.resolve(__dirname, "../../packages/core/src/utils/training"),
  "@gafus/core/utils/retry": _path.resolve(__dirname, "../../packages/core/src/utils/retry"),
  "@gafus/auth": _path.resolve(__dirname, "../../packages/auth/dist"),
  "@gafus/auth/server": _path.resolve(__dirname, "../../packages/auth/dist"),
  "@gafus/react-query": _path.resolve(__dirname, "../../packages/react-query/dist"),
  "@gafus/types": _path.resolve(__dirname, "../../packages/types/src"),
  "@gafus/csrf": _path.resolve(__dirname, "../../packages/csrf/src"),
  "@gafus/error-handling": _path.resolve(__dirname, "../../packages/error-handling/dist"),
  "@gafus/prisma": _path.resolve(__dirname, "../../packages/prisma/dist"),
  // Резолв @prisma/client в инстанс с engine (pnpm store; после prisma generate в packages/prisma)
  "@prisma/client": _path.resolve(
    __dirname,
    "../../node_modules/.pnpm/@prisma+client@6.10.1_prisma@6.10.1_typescript@5.8.3__typescript@5.8.3/node_modules/@prisma/client",
  ),
  "@gafus/webpush": _path.resolve(__dirname, "../../packages/webpush/dist"),
  "@gafus/logger": _path.resolve(__dirname, "../../packages/logger/dist"),
  "@gafus/ui-components": _path.resolve(
    __dirname,
    "../../packages/ui-components/dist/ui-components/src",
  ),
};

// 3. основной конфиг Next.js
const nextConfig = {
  // В dev выключен: один рендер вместо двух — быстрее отклик на ввод
  reactStrictMode: process.env.NODE_ENV !== "development",

  // Turbopack (next dev --turbo): быстрее HMR и холодный старт
  turbopack: {
    resolveAlias: gafusAliases,
  },
  // Включаем standalone режим для production (кроме явного отключения)
  ...((process.env.NODE_ENV === "production" || process.env.USE_STANDALONE === "true") &&
    process.env.DISABLE_STANDALONE !== "true" && { output: "standalone" }),
  // Исправляем проблемы с standalone сборкой
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  // Исправляем проблемы с React 19 и Next.js 14
  transpilePackages: [
    "@gafus/auth",
    "@gafus/prisma",
    "@gafus/logger",
    "@gafus/types",
    "@gafus/error-handling",
    "@gafus/ui-components",
  ],
  // Переменные окружения для клиентской части
  env: {
    NEXT_PUBLIC_TRAINER_PANEL_URL:
      process.env.NEXT_PUBLIC_TRAINER_PANEL_URL || "https://trainer-panel.gafus.ru",
  },
  // ESLint проверки: игнорируем во время сборки
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
  // Prisma: не бандлить — Query Engine ищется в node_modules
  // core: не бандлить на сервере — резолв в рантайме по package.json exports (dist), см. bundling.md
  // core убран: бандлится из src по алиасу; иначе реэкспорт updatePetPhoto даёт предупреждение (резолв в dist)
  serverExternalPackages: ["sharp", "prisma", "@prisma/client", "bullmq"],

  // Оптимизации для bundle
  experimental: {
    // Включить Prisma engine в standalone-сборку
    outputFileTracingIncludes: {
      "/**": [
        "./node_modules/.pnpm/@prisma+client@6.10.1_prisma@6.10.1_typescript@5.8.3__typescript@5.8.3/node_modules/.prisma/client/**",
      ],
    },
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
    ],
    serverActions: {
      bodySizeLimit: "100mb", // Лимит для Server Actions (для загрузки видео)
      allowedOrigins: [
        "gafus.ru",
        "https://gafus.ru",
        "web.gafus.localhost",
        "http://web.gafus.localhost",
        "localhost:3002",
        "http://localhost:3002",
      ],
    },
  },

  // Webpack конфигурация для workspace зависимостей
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    config.resolve.alias = { ...config.resolve.alias, ...gafusAliases };

    // Исправляем проблемы с standalone сборкой и clientReferenceManifest
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        sharp: "commonjs sharp",
      });
    }

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

  // Отключаем Image Optimization - вся статика на CDN
  images: {
    unoptimized: true,
  },

  async rewrites() {
    return [{ source: "/contacts", destination: "/contacts.html" }];
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
      // Server Actions endpoints - короткий кеш для HMR
      {
        source: "/_next/data/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" },
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
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Type", value: "text/html; charset=utf-8" },
        ],
      },
      // Кэширование тестовой страницы с анимацией собаки
      {
        source: "/test-dog.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Type", value: "text/html; charset=utf-8" },
        ],
      },
    ];
  },
};

// 4. экспорт: оборачиваем nextConfig функцией-обёрткой
module.exports = withBundleAnalyzer(withPWA(nextConfig));
