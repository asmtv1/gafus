import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/chat2-photo.archqa.realpg-minio.acceptance.ts"],
    testTimeout: 50_000, hookTimeout: 15_000, fileParallelism: false },
  resolve: { alias: {
    "@gafus/core/services/gallery/imageProcessing": path.resolve(__dirname, "../../packages/core/src/services/gallery/imageProcessing.ts"),
    "@gafus/gallery-storage": path.resolve(__dirname, "../../packages/gallery-storage/src"),
  } },
});
