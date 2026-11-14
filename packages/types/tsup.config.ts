import { defineConfig } from "tsup";

/** Сборка в один файл — убирает конфликт __esModule при export * из нескольких подмодулей. */
export default defineConfig({
  entry: ["src/index.ts", "src/training-client.ts", "src/logger.ts"],
  format: ["esm"],
  // Declaration bundling can silently drop newly added barrel exports.
  // The package build runs tsc declaration emit after bundling JS instead.
  dts: false,
  outDir: "dist",
  // Keep last known-good .d.ts files while JS is rebundled.  Deleting
  // dist/ at tsup startup races other workspaces reading declarations during
  // concurrent Turbo builds; tsc below regenerates declarations afterwards.
  // Explicit `pnpm clean` is still available for full artifact cleanup.
  clean: false,
  sourcemap: true,
  external: ["@gafus/logger"],
  outExtension: () => ({ js: ".js" }),
  esbuildOptions(options) {
    options.banner = { js: '"use strict";' };
  },
});
