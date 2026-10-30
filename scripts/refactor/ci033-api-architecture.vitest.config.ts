/** CI033 manual root-importer API source gate only; no API setup, DB or runtime Core. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: [],
    include: [
      "apps/api/src/modules/architecture/dependency-architecture.test.ts",
      "apps/api/src/lib/graceful-shutdown.test.ts",
      "apps/api/src/lib/readiness-deadline.test.ts",
    ],
    passWithNoTests: false,
  },
});
