import { defineConfig } from "tsup";

/** Сборка в один файл — убирает конфликт __esModule при export * из нескольких подмодулей. */
export default defineConfig({
  entry: ["src/index.ts", "src/training-client.ts", "src/logger.ts"],
  format: ["esm"],
  // Declaration bundling can silently drop newly added barrel exports.
  // The package build runs tsc declaration emit after bundling JS instead.
  dts: false,
  outDir: "dist",
  clean: true,
  sourcemap: true,
  external: ["@gafus/logger"],
  outExtension: () => ({ js: ".js" }),
  esbuildOptions(options) {
    options.banner = { js: '"use strict";' };
  },
});
