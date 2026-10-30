import { defineConfig } from "vite";
/**
 * Separate locally isolated trainer browser (mutually exclusive with Web Vite
 * on 5173). Never a public/production deployment or a credentialed mock.
 * Development proxy is fixed to the ORIGINAL local Hono loopback only.
 */
export default defineConfig(({ command, isPreview }) => {
  const development = command === "serve" && !isPreview;
  if (development && (
    process.env.GAFUS_TRAINER_DEV_API_MODE !== "local-hono" ||
    process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    process.env.GAFUS_LOCAL_BROWSER_AUTH !== "1" ||
    process.env.API_HOST !== "127.0.0.1" || process.env.API_PORT !== "3001" ||
    process.env.VITE_API_BASE_URL !== undefined
  )) throw new Error("Trainer live browser needs explicitly isolated Hono 127.0.0.1:3001");
  return {
    root: import.meta.dirname,
    oxc: { jsx: { runtime: "automatic" } },
    build: { outDir: "dist", emptyOutDir: true },
    preview: { host: "127.0.0.1", port: 4183, strictPort: true, proxy: {} },
    server: {
      host: "127.0.0.1", port: 5173, strictPort: true,
      ...(development ? { proxy: {
        "/api/v1": { target: "http://127.0.0.1:3001", changeOrigin: false },
      } } : {}),
    },
  };
});
