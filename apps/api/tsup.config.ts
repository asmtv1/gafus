import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  // Внешние зависимости (не бандлятся)
  external: [
    "@gafus/prisma",
    "@gafus/auth",
    "@gafus/core",
    "@gafus/logger",
    "@gafus/queues",
    "@gafus/cdn-upload",
    "ioredis",
    "@hono/node-server",
    "hono",
    "@hono/zod-validator",
    "hono-rate-limiter",
    "@hono-rate-limiter/redis",
    "jose",
    "bcryptjs",
    "zod",
  ],
  // Явно указываем noExternal для бандлинга
  noExternal: [],
});
