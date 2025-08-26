// next.config.js ─ CommonJS-вариант для @ducanh2912/next-pwa ≥ 10
interface WebpackConfig {
  resolve: {
    alias: Record<string, string>;
  };
}

const _path = require("path");
const withPWAInit = require("@ducanh2912/next-pwa").default;

// Bundle analyzer
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

// 2. передаём ей объект настроек Workbox/PWA
const withPWA = withPWAInit({
  disable: false, // PWA всегда включена
  register: true, // Автоматическая регистрация
  skipWaiting: true,
  injectRegister: "auto", // Автоматическая инъекция
  mode: "production",
  dynamicStartUrl: false,
  // Исключаем проблемные внутренние манифесты Next из предкеша Workbox
  buildExcludes: [/_buildManifest\.js$/, /_ssgManifest\.js$/, /middleware-manifest\.json$/],
  // Fallback документ для офлайн-навигаций (лучшие практики Workbox)
  fallback: {
    document: "/~offline",
  },
  minify: false,
      exclude: [
      /\.js\.map$/,
      /\.js\.LICENSE$/,
      /middleware-manifest\.json$/,
      /_ssgManifest\.js$/,
      /_buildManifest\.js$/,
      /_next\/static\/.*\/_buildManifest\.js$/,
      // Не исключаем offline страницу — пусть Workbox сам управляет её кэшированием
      /shared\/uploads\//, // Исключаем только старые пути для backward compatibility
    ],
  workboxOptions: {
    disableDevLogs: true,
    importScripts: ["/sw-custom.js"],
    // Очистка устаревших кэшей
    cleanupOutdatedCaches: true,
    // Добавляем кастомную логику кеширования
    runtimeCaching: [
      {
        // Навигации (HTML) — NetworkFirst с недельным TTL
        urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
      {
        urlPattern: /^\/.*\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "local-images",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /^\/.*\.css$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "styles",
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /^\/_next\/.*\.(js|css|woff2?)$/,
        handler: "CacheFirst",
        options: { cacheName: "static-resources" },
      },
      {
        urlPattern: /^\/api\/ping$/,
        handler: "NetworkFirst",
        options: { cacheName: "ping-api" },
      },
      {
        urlPattern: /^\/~offline$/,
        handler: "CacheFirst",
        options: {
          cacheName: "offline-page",
          expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 дней
        },
      },
      {
        urlPattern: /^\/api\/push\/.*$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "push-api",
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 }, // 1 час
        },
      },
    ],
    // Дополнительные настройки для избежания ошибок кеширования
    skipWaiting: true,
    clientsClaim: true,
  },
  sw: "sw.js", // Используем стандартный Workbox SW
});

// 3. основной конфиг Next.js
const nextConfig = {
  reactStrictMode: true,

  // ESLint проверки включены для качества кода
  eslint: {
    ignoreDuringBuilds: false,
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

  // Оптимизации для bundle
  experimental: {
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
    ],
    // Добавляем настройки для решения проблем с чанками
    webpackBuildWorker: false,
  },

  // Webpack конфигурация для workspace зависимостей
  webpack: (config: WebpackConfig, { isServer: _isServer }: { isServer: boolean }) => {
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/swr": _path.resolve(__dirname, "../../packages/swr/src"),
      "@gafus/types": _path.resolve(__dirname, "../../packages/types/src"),
      "@gafus/csrf": _path.resolve(__dirname, "../../packages/csrf/src"),
      "@gafus/error-handling": _path.resolve(__dirname, "../../packages/error-handling/src"),
      "@gafus/prisma": _path.resolve(__dirname, "../../packages/prisma/src"),
      "@gafus/webpush": _path.resolve(__dirname, "../../packages/webpush/src"),
    };

    return config;
  },

  // Оптимизация изображений
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 дней
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, immutable" }],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/_next/image/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

// 4. экспорт: оборачиваем nextConfig функцией-обёрткой
module.exports = withBundleAnalyzer(withPWA(nextConfig));
