import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/chat2-real-video.archqa.acceptance.ts"],
    environment: "node", fileParallelism: false, testTimeout: 70_000,
    hookTimeout: 10_000,
  },
});
