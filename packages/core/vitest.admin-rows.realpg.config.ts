/** Only the guarded, disposable-loopback admin Gafus PostgreSQL acceptance suite. */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/services/adminGafus/adminRows.realpg.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    maxWorkers: 1,
  },
  resolve: {
    alias: { "@gafus/*": path.resolve(__dirname, "../../packages/*") },
  },
});
