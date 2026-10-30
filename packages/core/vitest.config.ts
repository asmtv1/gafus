/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Guarded real-PostgreSQL tests require their exact dedicated disposable QA
    // server/role/port. Never run them with the default unit test environment;
    // do not weaken the per-test DB isolation assertions.
    exclude: [
      "**/node_modules/**", "**/dist/**",
      "**/*real-pg*.test.ts", "**/*realpg*.test.ts", "**/*isolatedpg*.test.ts",
      "**/*private-work*.test.ts", "**/*permanent-work*.test.ts",
      "**/*prisma-alias.proof.test.ts", "**/*prisma-real-alias.proof.test.ts",
      // Read-only permanent Work PG18 tests need an explicit restrictive DB URL.
      "**/g1-soc040-current-work-question-list.read.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@gafus/*": path.resolve(__dirname, "../../packages/*"),
    },
  },
});
