import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig(({ command, isPreview }) => ({
  root: fileURLToPath(new URL("./src/admin-live/", import.meta.url)),
  oxc: { jsx: { runtime: "automatic" } },
  build: { outDir: fileURLToPath(new URL("./dist/", import.meta.url)), emptyOutDir: true,
      sourcemap: process.env.GAFUS_PRIVATE_MAPS_ENABLED === "true" ? "hidden" : false },
  preview: { host: "127.0.0.1", port: 4177, strictPort: true, proxy: {} },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, ...(command === "serve" && !isPreview ? { proxy: { "/api/v1": { target: "http://127.0.0.1:3001", changeOrigin: false } } } : {}) },
}));
