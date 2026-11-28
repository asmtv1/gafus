/** Measure the actual payment TypeScript source using the same real-PG cases.
 * Only this guarded coverage config changes the service resolution. */
import { defineConfig, mergeConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import base from "./vitest.archqa-payment.realpg.config";
export default mergeConfig(base, defineConfig({
  resolve: {
    alias: {
      "@gafus/subscription-payment-server/service": fileURLToPath(
        new URL("../subscription-payment-server/src/paymentService.ts", import.meta.url),
      ),
    },
  },
  test: { fileParallelism: false },
}));
