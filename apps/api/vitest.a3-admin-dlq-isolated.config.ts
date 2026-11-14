import { defineConfig } from "vitest/config";
/** Explicit disposable PostgreSQL only: never part of normal `vitest run`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/routes/v1/admin-media-dlq.real-pg.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
