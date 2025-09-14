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

// 2. Отключаем только Workbox, но оставляем PWA манифест и метатеги
// PWA будет работать через наш кастомный Service Worker в /public/sw.js
const withPWA = withPWAInit({
  disable: true, // Отключаем только автогенерацию Workbox, НЕ PWA функциональность
  // PWA манифест и метатеги остаются активными
});

// 3. основной конфиг Next.js
const nextConfig = {
  reactStrictMode: true,
  // Включаем standalone режим для Docker
  output: 'standalone',
  // Переменные окружения для клиентской части
  env: {
    NEXT_PUBLIC_TRAINER_PANEL_URL: process.env.NEXT_PUBLIC_TRAINER_PANEL_URL || 'https://trainer-panel.gafus.ru',
  },
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
  },

  // Webpack конфигурация для workspace зависимостей
  webpack: (config: WebpackConfig, { isServer: _isServer }: { isServer: boolean }) => {
    // Разрешаем workspace зависимости
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gafus/auth": _path.resolve(__dirname, "../../packages/auth/dist"),
      "@gafus/auth/server": _path.resolve(__dirname, "../../packages/auth/dist"),
      "@gafus/react-query": _path.resolve(__dirname, "../../packages/react-query/dist"),
      "@gafus/types": _path.resolve(__dirname, "../../packages/types/src"),
      "@gafus/csrf": _path.resolve(__dirname, "../../packages/csrf/src"),
      "@gafus/error-handling": _path.resolve(__dirname, "../../packages/error-handling/dist/error-handling/src"),
      "@gafus/prisma": _path.resolve(__dirname, "../../packages/prisma/dist"),
      "@gafus/webpush": _path.resolve(__dirname, "../../packages/webpush/dist"),
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
    ];
  },
};

// 4. экспорт: оборачиваем nextConfig функцией-обёрткой
module.exports = withBundleAnalyzer(withPWA(nextConfig));
