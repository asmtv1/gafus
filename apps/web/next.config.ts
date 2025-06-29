// next.config.js ─ CommonJS-вариант для @ducanh2912/next-pwa ≥ 10
const path = require("path");

// 1. берём **default**-экспорт как функцию-инициализатор
const withPWAInit = require("@ducanh2912/next-pwa").default;

// 2. передаём ей объект настроек Workbox/PWA
const withPWA = withPWAInit({
  disable: process.env.NODE_ENV === "development",
  register: false,
  skipWaiting: true,
  injectRegister: false,
  runtimeCaching: [
    {
      urlPattern:
        /^https:\/\/res\.cloudinary\.com\/.*\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "cloudinary-images",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      urlPattern: /^\/music\/.*\.(mp3|ogg|wav)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "local-audio",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
      urlPattern: /^\/(?:|trainings|profile|favorites|courses)$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "app-shell-html",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
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
      handler: "StaleWhileRevalidate",
      options: { cacheName: "static-resources" },
    },
    {
      urlPattern: /^\/$/,
      handler: "NetworkFirst",
      options: { cacheName: "start-url" },
    },
  ],
  mode: "production",
  dynamicStartUrl: false,
  fallback: {},
  minify: false,
  exclude: [
    /\.js\.map$/,
    /\.js\.LICENSE$/,
    /middleware-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
  ],
  workboxOptions: { disableDevLogs: true },
  sw: "sw.js",
  customWorkerSrc: "worker",
});

// 3. основной конфиг Next.js
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, immutable" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  webpack(config: import('webpack').Configuration) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
};

// 4. экспорт: оборачиваем nextConfig функцией-обёрткой
module.exports = withPWA(nextConfig);
