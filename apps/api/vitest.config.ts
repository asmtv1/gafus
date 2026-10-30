import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // The adjacent stale trainingService.js must not shadow the current TS source
  // when the training barrel is imported in API Vitest. Scope this redirect
  // strictly to that one module, not other application/test imports.
  plugins: [
    {
      name: "gafus-core-training-ts-test-resolution",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./trainingService" &&
          importer?.split("?")[0] ===
            path.resolve(__dirname, "../../packages/core/src/services/training/index.ts")
        ) {
          return path.resolve(
            __dirname,
            "../../packages/core/src/services/training/trainingService.ts",
          );
        }
        return null;
      },
    },
  ],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.route.test.ts", "__tests__/**/*.test.ts"],
    // Tests requiring a specifically guarded, isolated PostgreSQL instance
    // are opt-in and MUST NOT run from the default unit/contract suite.
    // They enforce local DB name/role/port themselves; no DB URL is read here.
    // Run explicit isolated integration tests with a separate approved config.
    exclude: [
      "src/**/*real-pg*.test.ts",
      "src/**/*realpg*.test.ts",
      "src/**/*real-prisma-pg*.test.ts",
      "src/**/*real-work*.test.ts",
      // Full real S3/PG/Redis/CDN and Chat2/WS acceptances are intentionally
      // NOT included in generic `pnpm --filter @gafus/api test`. They require
      // explicit dedicated configs, exact QA data directory and local ports.
      // Do not skip their checks inside the tests or permit production URLs.
      "src/test/agent2-cdn-full-isolated.actor-access.test.ts",
      "src/modules/chat2/chat2.full-isolated.http.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
    // Полный импорт app + первый запрос на медленных CI runner'ах иногда > 5s
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@gafus/core/services/course": path.resolve(
        __dirname,
        "../../packages/core/src/services/course/index.ts",
      ),
      "@gafus/core/services/pets": path.resolve(
        __dirname,
        "../../packages/core/src/services/pets/index.ts",
      ),
      "@gafus/core/services/training": path.resolve(
        __dirname,
        "../../packages/core/src/services/training/index.ts",
      ),
      "@gafus/core/services/user": path.resolve(
        __dirname,
        "../../packages/core/src/services/user/index.ts",
      ),
      "@gafus/core/services/exam": path.resolve(
        __dirname,
        "../../packages/core/src/services/exam/index.ts",
      ),
      "@gafus/core/services/offline": path.resolve(
        __dirname,
        "../../packages/core/src/services/offline/index.ts",
      ),
      "@gafus/core/services/achievements": path.resolve(
        __dirname,
        "../../packages/core/src/services/achievements/index.ts",
      ),
      "@gafus/core/services/notifications": path.resolve(
        __dirname,
        "../../packages/core/src/services/notifications/index.ts",
      ),
      "@gafus/core/services/appSubscription": path.resolve(
        __dirname,
        "../../packages/core/src/services/appSubscription/index.ts",
      ),
      "@gafus/core/services/appFeatureFlags": path.resolve(
        __dirname,
        "../../packages/core/src/services/appFeatureFlags/index.ts",
      ),
      "@gafus/core/errors": path.resolve(__dirname, "../../packages/core/src/errors/index.ts"),
      "@gafus/core/validation/auth-register": path.resolve(
        __dirname,
        "../../packages/core/src/validation/authRegisterSchema.ts",
      ),
    },
  },
});
