import { describe, expect, it, vi } from "vitest";
import { retireLegacyPwa, type BrowserPwaContext, type LegacyRegistration } from "./retireLegacyPwa";

const origin = "https://gafus.ru";
const reg = (script: string, scope = origin + "/"): LegacyRegistration => ({
  scope,
  active: { scriptURL: script },
  unregister: vi.fn().mockResolvedValue(true),
});
function context(registrations: LegacyRegistration[], names: string[]): BrowserPwaContext {
  return {
    origin,
    serviceWorker: { getRegistrations: vi.fn().mockResolvedValue(registrations) },
    caches: {
      keys: vi.fn().mockResolvedValue(names),
      delete: vi.fn().mockResolvedValue(true),
    },
  };
}

describe("transitional PWA retirement - narrow and repeatable", () => {
  it("unregisters only root GAFUS /sw.js, including versioned script", async () => {
    const our = reg(origin + "/sw.js?version=2024");
    const nested = reg(origin + "/sw.js", origin + "/other-app/");
    const unrelated = reg(origin + "/service-worker.js");
    const crossOrigin = reg("https://other.example/sw.js");
    const c = context([our, nested, unrelated, crossOrigin], []);
    const result = await retireLegacyPwa(c);
    expect(result.unregistered).toBe(1);
    expect(our.unregister).toHaveBeenCalledOnce();
    for (const unknown of [nested, unrelated, crossOrigin]) {
      expect(unknown.unregister).not.toHaveBeenCalled();
    }
  });

  it("also catches waiting or installing GAFUS workers", async () => {
    const waiting: LegacyRegistration = {
      scope: origin + "/",
      active: null,
      waiting: { scriptURL: origin + "/sw.js" },
      unregister: vi.fn().mockResolvedValue(true),
    };
    expect((await retireLegacyPwa(context([waiting], []))).unregistered).toBe(1);
    expect(waiting.unregister).toHaveBeenCalledOnce();
  });

  it("deletes only proven GAFUS legacy cache names and never other storage", async () => {
    const c = context([], [
      "gafus-offline-v1", "gafus-courses-v1",
      "photos-cache", "private-media-cache", "user-drafts", "workbox-cache-other",
    ]);
    c.allowLegacyCacheDeletion = true;
    const result = await retireLegacyPwa(c);
    expect(result.cachesDeleted).toEqual(["gafus-offline-v1", "gafus-courses-v1"]);
    expect(c.caches?.delete).toHaveBeenCalledTimes(2);
    expect(c.caches?.delete).not.toHaveBeenCalledWith("user-drafts");
  });

  it("automated startup NEVER deletes caches while pending Web offline work is unknown", async () => {
    const c = context([reg(origin + "/sw.js")], [
      "gafus-offline-v1", "gafus-courses-v1",
    ]);
    const result = await retireLegacyPwa(c);
    expect(result.unregistered).toBe(1);
    expect(result.cachesDeleted).toEqual([]);
    expect(c.caches?.keys).not.toHaveBeenCalled();
    expect(c.caches?.delete).not.toHaveBeenCalled();
  });

  it("gracefully tolerates missing APIs, without registering SW or deleting DB", async () => {
    expect(await retireLegacyPwa({ origin })).toEqual({
      unregistered: 0, cachesDeleted: [], failures: 0,
    });
  });

  it("reports partial failures so a later navigation can retry", async () => {
    const failing = reg(origin + "/sw.js");
    vi.mocked(failing.unregister).mockRejectedValue(new Error("blocked"));
    const c = context([failing], ["gafus-offline-v1"]);
    c.allowLegacyCacheDeletion = true;
    vi.mocked(c.caches!.delete).mockResolvedValue(false);
    const result = await retireLegacyPwa(c);
    expect(result).toEqual({ unregistered: 0, cachesDeleted: [], failures: 2 });
  });
});
