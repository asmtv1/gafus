import { defineConfig } from "vitest/config";
/** Run only with scripts/qa/a3-media-priority-isolated.sh on private PG/Redis. */
export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    environment: "node",
    include: ["src/a3-media-priority.real-services.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
