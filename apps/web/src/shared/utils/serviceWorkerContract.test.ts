import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const serviceWorkerPath = fileURLToPath(new URL("../../../public/sw.js", import.meta.url));
const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
const managerPath = fileURLToPath(new URL("./serviceWorkerManager.ts", import.meta.url));
const manager = readFileSync(managerPath, "utf8");
const cleanupPath = fileURLToPath(
  new URL("../lib/migrations/cleanupLegacyWebOfflineData.ts", import.meta.url),
);
const cleanup = readFileSync(cleanupPath, "utf8");

describe("web push service worker contract", () => {
  it("keeps root-scoped push and notification click handling", () => {
    expect(serviceWorker).toContain('self.addEventListener("push"');
    expect(serviceWorker).toContain('self.addEventListener("notificationclick"');
    expect(serviceWorker).toContain("self.clients.openWindow");
    expect(serviceWorker).toContain('"/api/track-reengagement-click"');
  });

  it("does not retain offline download routing or service-worker message protocols", () => {
    expect(serviceWorker).not.toContain('addEventListener("fetch"');
    expect(serviceWorker).not.toContain("offline-hls");
    expect(serviceWorker).not.toContain("HTML_FROM_INDEXEDDB");
    expect(serviceWorker).not.toContain("CLEAR_PROFILE_CACHE");
  });

  it("does not mutate browser storage during service-worker activation", () => {
    expect(serviceWorker).toContain("event.waitUntil(self.clients.claim())");
    expect(serviceWorker).not.toContain("deleteDatabase");
    expect(serviceWorker).not.toContain("caches.delete");
  });

  it("keeps legacy cleanup behind web-sync and video-progress guards", () => {
    expect(cleanup).toContain("await useOfflineStore.persist.rehydrate()");
    expect(cleanup).toContain("syncQueue.length > 0");
    expect(cleanup).toContain("getVideoProgressMigrationState(userId)");
    expect(cleanup).toContain('"deferred-pending"');
    expect(cleanup).toContain('"deferred-unknown"');
    expect(cleanup).toContain('"gafus-offline-courses"');
  });

  it("registers the push worker at root without unregistering other scopes", () => {
    expect(manager).toContain('navigator.serviceWorker.register("/sw.js", {');
    expect(manager).toContain('scope: "/"');
    expect(manager).not.toContain("getRegistrations");
    expect(manager).not.toContain(".unregister()");
  });
});
