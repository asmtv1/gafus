import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"],
    passWithNoTests: true,
    setupFiles: ["./src/test/test-utils.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@gafus/*": path.resolve(__dirname, "../../packages/*"),
    },
  },
});
