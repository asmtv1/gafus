/**
 * Transitional migration, NOT a PWA implementation.
 *
 * Old Next.js Web may have registered /sw.js at root scope. The new static
 * client must retire that exact worker and the two cache namespaces present
 * in GAFUS's historical Web offline code, without touching unrelated browser
 * storage (cookies, IndexedDB, media caches, other SW registrations, Expo).
 */
export const LEGACY_CACHE_NAMES = ["gafus-offline-v1", "gafus-courses-v1"] as const;
const LEGACY_SCRIPT_PATHS = new Set(["/sw.js"]);

export type LegacyWorker = {
  scriptURL: string;
};

export type LegacyRegistration = {
  scope: string;
  active?: LegacyWorker | null;
  waiting?: LegacyWorker | null;
  installing?: LegacyWorker | null;
  unregister(): Promise<boolean>;
};

export type BrowserPwaContext = {
  origin: string;
  serviceWorker?: { getRegistrations(): Promise<LegacyRegistration[]> };
  caches?: { keys(): Promise<string[]>; delete(name: string): Promise<boolean> };
  /**
   * NEVER enabled by automatic startup. Set true only after an explicit
   * migration verifies that no offline write queue/video-progress is pending.
   */
  allowLegacyCacheDeletion?: boolean;
};

export type RetirementResult = {
  unregistered: number;
  cachesDeleted: string[];
  failures: number;
};

function ownsLegacyWorker(registration: LegacyRegistration, origin: string): boolean {
  try {
    const rootScope = new URL("/", origin).href;
    if (registration.scope !== rootScope) return false;
    return [registration.active, registration.waiting, registration.installing]
      .filter((worker): worker is LegacyWorker => Boolean(worker))
      .some(worker => {
        const url = new URL(worker.scriptURL);
        return url.origin === origin && LEGACY_SCRIPT_PATHS.has(url.pathname);
      });
  } catch {
    return false;
  }
}

/**
 * Best effort and repeatable. Does not mark cleanup as done on failed attempts.
 * Caller may retry on next page load. No service worker is ever registered.
 */
export async function retireLegacyPwa(context: BrowserPwaContext): Promise<RetirementResult> {
  const result: RetirementResult = { unregistered: 0, cachesDeleted: [], failures: 0 };
  if (context.serviceWorker) {
    try {
      const registrations = await context.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (!ownsLegacyWorker(registration, context.origin)) continue;
        try {
          if (await registration.unregister()) result.unregistered += 1;
          else result.failures += 1;
        } catch {
          result.failures += 1;
        }
      }
    } catch {
      result.failures += 1;
    }
  }

  if (context.allowLegacyCacheDeletion && context.caches) {
    try {
      const existing = await context.caches.keys();
      for (const name of LEGACY_CACHE_NAMES) {
        if (!existing.includes(name)) continue;
        try {
          if (await context.caches.delete(name)) result.cachesDeleted.push(name);
          else result.failures += 1;
        } catch {
          result.failures += 1;
        }
      }
    } catch {
      result.failures += 1;
    }
  }
  return result;
}

export async function retireLegacyPwaInBrowser(): Promise<RetirementResult> {
  if (typeof window === "undefined") {
    return { unregistered: 0, cachesDeleted: [], failures: 0 };
  }

  const serviceWorker = "serviceWorker" in navigator
    ? navigator.serviceWorker as unknown as BrowserPwaContext["serviceWorker"]
    : undefined;
  const browserCaches = "caches" in window
    ? window.caches as BrowserPwaContext["caches"]
    : undefined;
  return retireLegacyPwa({
    origin: window.location.origin,
    serviceWorker,
    caches: browserCaches,
  });
}
