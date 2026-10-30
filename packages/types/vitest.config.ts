/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Both source-unit tests and published-root contract tests are mandatory.
    // Do not run shadowing adjacent generated .js or emitted dist tests.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.test.js", "**/*.spec.js"],
  },
});
