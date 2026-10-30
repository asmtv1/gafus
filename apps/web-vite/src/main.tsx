import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { NextCookieConsent } from "./features/profile/NextCookieConsent";
import { retireLegacyPwaInBrowser } from "./shared/pwa-retirement/retireLegacyPwa";
import "./brand/normalize.css";
import "./brand/tokens.css";
import "./style.css";
import "./brand/brand-parity.css";
import "./brand/pages-parity.css";
import "./brand/next-routes-parity.css";
import "./shared/ui/SelectChevron.css";
// Source-derived WEB1 routes need CSS on first paint, before lazy JSX mounts.
// Selectors inside are confined to profile, Bio, reminders, and tour.
import "./features/profile/web1-local-parity.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application mount root");
// The historical /main-panel routes belong to Admin, not the public Web SPA.
// Load a separate React shell only for those URLs, while sharing the same
// browser Origin, HttpOnly cookie transport, and the existing Hono proxy.
// Do not mount Web or retire its PWA state in the administrative path.
if (
  window.location.pathname === "/main-panel" ||
  window.location.pathname.startsWith("/main-panel/")
) {
  void import("../../admin-panel/src/admin-live/mountInWeb")
    .then(({ mountAdminInWeb }) => mountAdminInWeb(root))
    .catch(() => {
      root.textContent = "Не удалось загрузить админ-панель. Обновите страницу.";
    });
} else {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  // Migrate away from old Next.js /sw.js. Never delete user drafts, offline queues,
  // IndexedDB or even old course caches until an audited offline migration is complete.
  // Cleanup is non-blocking and never prevents the React UI from rendering.
  void retireLegacyPwaInBrowser().catch(() => undefined);

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App showGalleryOptIn />
        <NextCookieConsent />
      </QueryClientProvider>
    </StrictMode>,
  );
}
