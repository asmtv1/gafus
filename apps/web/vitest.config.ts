import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
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
      "@shared": path.resolve(__dirname, "src/shared"),
      "@gafus/csrf/middleware": path.resolve(__dirname, "../../packages/csrf/src/middleware.ts"),
      "@gafus/csrf/server": path.resolve(__dirname, "../../packages/csrf/src/server.ts"),
      "@gafus/csrf": path.resolve(__dirname, "../../packages/csrf/src/index.ts"),
      "@gafus/*": path.resolve(__dirname, "../../packages/*"),
    },
  },
});
