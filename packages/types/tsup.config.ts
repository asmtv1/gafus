import { defineConfig } from "tsup";

/** Сборка в один файл — убирает конфликт __esModule при export * из нескольких подмодулей. */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
  sourcemap: true,
  external: ["@gafus/logger", "react-hook-form"],
  outExtension: () => ({ js: ".js" }),
  esbuildOptions(options) {
    options.banner = { js: '"use strict";' };
  },
});
