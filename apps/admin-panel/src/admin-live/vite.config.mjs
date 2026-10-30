import { fileURLToPath } from "node:url";

/** Explicit isolated local-only Admin Vite. No remote origin, no mock production secrets. */
export default {
  root: import.meta.dirname,
  // cdn-upload's published utils.js is CommonJS; Vite's dev ESM server cannot
  // import its named exports untransformed. Resolve the shared pure TS source
  // here, without changing package artifacts or duplicating URL semantics.
  resolve: {
    alias: [
      {
        find: /^@gafus\/cdn-upload\/utils$/,
        replacement: fileURLToPath(
          new URL("../../../../packages/cdn-upload/src/utils.ts", import.meta.url),
        ),
      },
    ],
  },
  appType: "spa",
  // Next keeps TSX JSX untouched; Rolldown/Vite 8 needs an explicit JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false, // original browser Origin is required for CSRF verification
      },
    },
  },
  preview: { host: "127.0.0.1", port: 4183, strictPort: true, proxy: {} },
  build: { outDir: "dist", emptyOutDir: true },
};
