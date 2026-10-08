import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ resolve: { alias: { "@gafus/core/services/gallery/imageProcessing": root + "packages/core/src/services/gallery/imageProcessing.ts", "@gafus/gallery-storage": root + "packages/gallery-storage/src" } }, test: { include: ["src/**/*.test.ts"], environment: "node" } });
