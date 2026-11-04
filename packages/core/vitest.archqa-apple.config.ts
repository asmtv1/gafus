import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["src/services/appSubscription/appleJws.archqa.acceptance.ts"],
    fileParallelism: false, testTimeout: 15000, hookTimeout: 20000 },
  resolve: { alias: { "@gafus/*": path.resolve(__dirname, "../../packages/*") } },
});
