import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.route.test.ts", "__tests__/**/*.test.ts"],
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
