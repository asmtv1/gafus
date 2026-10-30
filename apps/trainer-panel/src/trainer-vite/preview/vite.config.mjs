import { defineConfig } from "vite";

/**
 * Demo-only preview policy. No API proxy: no browser backend or PWA.
 * Prevent Vite SPA fallback from treating API/PWA requests as valid pages.
 */
function noMockBackend() {
  return {
    name: "ag4-preview-no-backend",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname;
        try {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          pathname = decodeURIComponent(url.pathname).toLowerCase();
        } catch {
          res.statusCode = 400;
          res.setHeader("Cache-Control", "no-store");
          res.end("Invalid preview path");
          return;
        }
        const blocked = pathname === "/api" || pathname.startsWith("/api/") ||
          pathname === "/sw.js" || pathname === "/service-worker.js" ||
          pathname === "/manifest.json" || pathname === "/manifest.webmanifest" ||
          pathname.startsWith("/workbox-") || pathname.includes("%");
        if (!blocked) {
          next();
          return;
        }
        res.statusCode = 404;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("No API or PWA in AG4 preview");
      });
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [noMockBackend()],
  preview: {
    host: "127.0.0.1",
    strictPort: true,
    headers: { "Cache-Control": "no-store" },
  },
});
