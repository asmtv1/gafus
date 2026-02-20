/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/auth.ts", "**/server.ts", "**/middleware.ts"],
      thresholds: {
        lines: 33,
        functions: 48,
        branches: 33,
        statements: 33,
      },
    },
  },
});
