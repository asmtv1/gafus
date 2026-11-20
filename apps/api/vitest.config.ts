import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
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
      "__tests__/**/*realpg*.test.ts",
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
      // More-specific subpath MUST precede the broad appSubscription index
      // redirect: otherwise Vite tries index.ts/renewalPolicy (ENOTDIR).
      "@gafus/core/services/appSubscription/renewalPolicy": path.resolve(
        __dirname,
        "../../packages/core/src/services/appSubscription/renewalPolicy.ts",
      ),
      // Resolve the pure anonymous course policy before the broad source-index alias.
      "@gafus/core/services/course/publicOutlinePolicy": path.resolve(
        __dirname,
        "../../packages/core/src/services/course/publicOutlinePolicy.ts",
      ),
      "@gafus/core/services/course": path.resolve(
        __dirname,
        "../../packages/core/src/services/course/index.ts",
      ),
      "@gafus/core/services/pets": path.resolve(
        __dirname,
        "../../packages/core/src/services/pets/index.ts",
      ),
      "@gafus/core/services/training/cache-publication": path.resolve(
        __dirname, "../../packages/core/src/services/training/cachePublication.ts",
      ),
      "@gafus/core/services/training": path.resolve(
        __dirname,
        "../../packages/core/src/services/training/index.ts",
      ),
      "@gafus/core/services/user": path.resolve(
        __dirname,
        "../../packages/core/src/services/user/index.ts",
      ),
      "@gafus/core/services/offline": path.resolve(
        __dirname,
        "../../packages/core/src/services/offline/index.ts",
      ),
      "@gafus/core/services/appSubscription": path.resolve(
        __dirname,
        "../../packages/core/src/services/appSubscription/index.ts",
      ),
      "@gafus/core/errors": path.resolve(__dirname, "../../packages/core/src/errors/index.ts"),
      "@gafus/core/validation/auth-register": path.resolve(
        __dirname,
        "../../packages/core/src/validation/authRegisterSchema.ts",
      ),
    },
  },
});
