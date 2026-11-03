/** Browser-only canonical URLs for the separate Trainer Vite app.
 * Legacy /main-panel paths remain the internal route contract and are accepted
 * as deep links; production Next routing is intentionally untouched here.
 */
import { matchLegacyPath } from "../routes";

const LEGACY_PREFIX = "/main-panel";

/** Keep invalid paths invalid; do not turn unrelated pages into trainer routes. */
export function toTrainerBrowserPath(pathname: string): string {
  if (pathname === LEGACY_PREFIX) return "/";
  if (pathname.startsWith(LEGACY_PREFIX + "/") && matchLegacyPath(pathname) !== null)
    return pathname.slice(LEGACY_PREFIX.length);
  return pathname;
}

/** Reuse the existing route, auth and permission checks without duplicating them. */
export function toTrainerLegacyPath(pathname: string): string {
  if (pathname === "/") return LEGACY_PREFIX;
  if (pathname === "/login" || pathname === LEGACY_PREFIX ||
      pathname.startsWith(LEGACY_PREFIX + "/")) return pathname;
  const legacy = LEGACY_PREFIX + pathname;
  return matchLegacyPath(legacy) !== null ? legacy : pathname;
}

/** Nav hrefs can contain query strings; never alter their query parameters. */
export function toTrainerBrowserHref(href: string): string {
  const queryStart = href.indexOf("?");
  const pathname = queryStart < 0 ? href : href.slice(0, queryStart);
  return toTrainerBrowserPath(pathname) + (queryStart < 0 ? "" : href.slice(queryStart));
}
