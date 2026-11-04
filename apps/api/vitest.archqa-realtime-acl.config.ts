import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/chat2-realtime-owner-media.realpg.archqa.acceptance.ts"],
    testTimeout: 35_000, hookTimeout: 20_000, fileParallelism: false,
  },
});
