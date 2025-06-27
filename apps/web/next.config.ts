import path from "path";
import type { NextConfig } from "next";
import type { Configuration } from "webpack";
import withPWA from "@ducanh2912/next-pwa";

const runtimeCaching = [
  {
    urlPattern:
      /^https:\/\/res\.cloudinary\.com\/.*\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
    handler: "CacheFirst",
    options: {
      cacheName: "cloudinary-images",
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/,
    handler: "CacheFirst",
    options: {
      cacheName: "google-fonts",
      expiration: {
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      },
    },
  },
  {
    urlPattern: /^\/music\/.*\.(mp3|ogg|wav)$/,
    handler: "CacheFirst",
    options: {
      cacheName: "local-audio",
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
    },
  },
  {
    urlPattern: /^\/.*\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
    handler: "CacheFirst",
    options: {
      cacheName: "local-images",
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
    },
  },
  {
    urlPattern: /^\/(?:|trainings|profile|favorites|courses)$/,
    handler: "NetworkFirst",
    options: {
      cacheName: "app-shell-html",
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
  {
    urlPattern: /^\/.*\.css$/,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "styles",
      expiration: {
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
    },
  },
  {
    urlPattern: /^\/_next\/.*\.(js|css|woff2?)$/,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-resources",
    },
  },
  {
    urlPattern: /^\/$/,
    handler: "NetworkFirst",
    options: {
      cacheName: "start-url",
    },
  },
];

const pwaConfig = {
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  skipWaiting: true,
  injectRegister: false,
  runtimeCaching,
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

  // подключаем кастомный сервис-воркер ▼
  sw: "sw.js",
  customWorkerSrc: "worker",
};

const nextConfig: NextConfig = {
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
  webpack: (
    config: Configuration,
    options: {
      buildId: string;
      dev: boolean;
      isServer: boolean;
      nextRuntime?: string;
      defaultLoaders: { babel: any };
      webpack: typeof import("webpack");
    }
  ): Configuration => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@/shared": path.resolve(__dirname, "shared"),
    };
    return config;
  },
};

export default withPWA(pwaConfig)(nextConfig);
