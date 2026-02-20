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
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        "**/push-worker.ts",
        "**/reengagement-worker.ts",
        "**/video-transcoding-worker.ts",
      ],
      thresholds: {
        lines: 27,
        functions: 36,
        branches: 32,
        statements: 27,
      },
    },
  },
});
