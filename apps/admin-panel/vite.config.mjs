import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig(({ command, isPreview }) => ({
  root: fileURLToPath(new URL("./src/admin-live/", import.meta.url)),
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: [{ find: /^@gafus\/cdn-upload\/utils$/, replacement: fileURLToPath(new URL("../../packages/cdn-upload/src/utils.ts", import.meta.url)) }] },
  build: { outDir: fileURLToPath(new URL("./dist/", import.meta.url)), emptyOutDir: true },
  preview: { host: "127.0.0.1", port: 4177, strictPort: true, proxy: {} },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, ...(command === "serve" && !isPreview ? { proxy: { "/api/v1": { target: "http://127.0.0.1:3001", changeOrigin: false } } } : {}) },
}));
