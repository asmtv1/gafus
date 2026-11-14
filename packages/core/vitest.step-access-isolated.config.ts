/** Dedicated guarded real PostgreSQL opt-in test. The default Core Vitest
 * config deliberately excludes realpg tests; never weaken its exclusions.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/services/contentAccess/courseStepGrantReads.realpg.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    maxWorkers: 1,
  },
  resolve: { alias: { "@gafus/*": path.resolve(__dirname, "../../packages/*") } },
});
