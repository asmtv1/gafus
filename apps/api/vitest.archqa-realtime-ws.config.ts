/** Never run on default Vitest: requires owned loopback PG, Redis, Centrifugo. */
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/chat2-realtime-centrifugo.realpg.archqa.acceptance.ts"],
    testTimeout: 20_000, hookTimeout: 18_000, fileParallelism: false,
  },
});
