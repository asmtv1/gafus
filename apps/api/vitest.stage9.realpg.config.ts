import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/routes/v1/stage9-offline.realpg.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: { alias: {
    "@gafus/core/services/offline": path.resolve(__dirname, "../../packages/core/src/services/offline/index.ts"),
  } },
});
