import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { assertSafeDevApiBaseUrl } from "../../scripts/refactor/dev-api-config.mjs";

/**
 * Dev traffic uses the existing isolated mock by default. An explicit,
 * fixed-loopback local-Hono mode is permitted only for Vite dev serving.
 * Remote URLs must still fail the original MIG-SEC-003 validator.
 */
export default defineConfig(({ command, isPreview }) => {
  const dev = command === "serve" && !isPreview;
  const requestedMode = dev ? (process.env.GAFUS_WEB_DEV_API_MODE ?? "mock") : "mock";
  if (dev && requestedMode !== "mock" && requestedMode !== "local-hono") {
    throw new Error("Only mock or explicit local-hono dev API mode is allowed");
  }
  // Only an explicit isolated Gallery preview routes *all* local browser
  // requests through the same 3601 JWT signer. Standard local-hono stays 3001.
  const allGallery = dev && requestedMode === "local-hono" &&
    process.env.GAFUS_WEB_GALLERY_FULL_HONO === "1";
  if (dev && process.env.GAFUS_WEB_GALLERY_FULL_HONO !== undefined && !allGallery) {
    throw new Error("Unsafe isolated Gallery browser mode");
  }
  // Dedicated Questions Photo QA (separate from the active Web 5173 and API 3001).
  // Only explicit local Hono mode may use the isolated 3002 signer / 5507 UI.
  const questionsQa = dev && requestedMode === "local-hono" && !allGallery &&
    process.env.GAFUS_QUESTIONS_ISOLATED_QA === "1" &&
    process.env.VITE_QUESTIONS_LOCAL_QA === "1";
  if (dev && (process.env.GAFUS_QUESTIONS_ISOLATED_QA !== undefined ||
      process.env.VITE_QUESTIONS_LOCAL_QA !== undefined) && !questionsQa)
    throw new Error("Unsafe isolated Questions QA browser mode");
  // Keep the existing remote/credential/URL denial in BOTH dev modes.
  const localMock = dev ? assertSafeDevApiBaseUrl(process.env.VITE_API_BASE_URL) : undefined;
  const devApiTarget = localMock
    ? requestedMode === "local-hono"
      ? (questionsQa ? "http://127.0.0.1:3002" :
         allGallery ? "http://127.0.0.1:3601" : "http://127.0.0.1:3001")
      : localMock
    : undefined;
  return {
    // Shared Admin TSX lives outside the web-vite Vite root; explicitly enable
    // React JSX for source in both workspace apps (Vite 8 / Rolldown).
    oxc: { jsx: { runtime: "automatic" } },
    // Pure shared CDN helpers compile to CommonJS in dist. Serve source as ESM
    // for the lazy Admin shell without modifying shared package output.
    resolve: {
      alias: [
        {
          find: /^@gafus\/cdn-upload\/utils$/,
          replacement: fileURLToPath(
            new URL("../../packages/cdn-upload/src/utils.ts", import.meta.url),
          ),
        },
      ],
    },
    // Isolated client: no SW, no Workbox, no PWA manifest, no plugins.
    root: import.meta.dirname,
    build: { outDir: "dist", emptyOutDir: true },
    // Preview serves static assets only. Never inherit a dev proxy.
    preview: { host: "127.0.0.1", port: 4175, strictPort: true, proxy: {} },
    server: {
      host: "127.0.0.1",
      port: questionsQa ? 5507 : 5173,
      strictPort: true,
      ...(devApiTarget
        ? {
            proxy: {
              // TEMPORARY LOCAL ONLY: S3 service credentials can upload via
              // signed POST, but this new-org bucket denies browser CORS.
              // Vite relays the exact presigned POST to the SAME Cloud.ru bucket.
              // No generic URL proxy, no production or additional VM.
              ...(process.env.GAFUS_CHAT2_LOCAL_MEDIA_QA === "1" &&
                  process.env.VITE_CHAT2_LOCAL_S3_RELAY === "true" ? {
                "/chat2-qa-s3-upload": {
                  target: "https://s3.cloud.ru", changeOrigin: true,
                  rewrite: (path) => path === "/chat2-qa-s3-upload"
                    ? "/gafus-chat2-media-2026" : "/__denied_chat2_qa_path",
                  configure: (proxy) => {
                    proxy.on("proxyReq", (req) => req.removeHeader("origin"));
                  },
                },
              } : {}),
              // Gallery-only isolated localhost API (never affects other Hono endpoints).
              ...(allGallery ? {
                "/api/v1/gallery": {
                  target: "http://127.0.0.1:3601",
                  changeOrigin: false,
                },
              } : {}),
              // Gallery-only Hono 3601 intentionally disables Feed. In this exact
              // isolated dev preview, serve moments from the separate full Hono
              // 3001, using the same local JWT signing keys. No remote/prod proxy.
              ...(allGallery ? {
                "/api/v1/feed-playback": {
                  target: "http://127.0.0.1:3001", changeOrigin: false,
                },
                "/api/v1/feed": {
                  target: "http://127.0.0.1:3001", changeOrigin: false,
                },
              } : {}),
              // Explicit Chat2 cutover: Hono 3003 is strict loopback-only and
              // shares the dev JWT signer; every other /api/v1 stays on 3001.
              ...(requestedMode === "local-hono" && !allGallery && !questionsQa &&
                  process.env.GAFUS_CHAT2_LOCAL_MEDIA_QA !== "1" ? {
                "/api/v1/chats": {
                  target: "http://127.0.0.1:3003", changeOrigin: false,
                },
              } : {}),
              "/api/v1": {
                target: devApiTarget,
                // Preserve original browser Host/Origin; do not spoof Hono auth.
                changeOrigin: requestedMode !== "local-hono",
              },
            },
          }
        : {}),
    },
  };
});
