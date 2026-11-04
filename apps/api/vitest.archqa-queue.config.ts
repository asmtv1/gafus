import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["tests/chat2-queue.realpg.archqa.acceptance.ts"],
    testTimeout: 40_000, hookTimeout: 12_000, fileParallelism: false },
});
