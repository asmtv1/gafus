/** Opt-in disposable PostgreSQL webhook acceptance only, never the default test suite. */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@gafus/*": path.resolve(__dirname, "../../packages/*") } },
});
