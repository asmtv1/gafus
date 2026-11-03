/**
 * Canonical URLs for the standalone Admin Vite app only.
 * Existing legacy /main-panel routes stay the internal dispatch/permissions
 * contract. Do not change Hono API or legacy Next routes.
 */
import { matchAdminRoute } from "./routes";

const LEGACY_PREFIX = "/main-panel";

/** Accept only recognized legacy pages, including validated detail routes. */
export function toAdminBrowserPath(pathname: string): string {
  if (pathname === LEGACY_PREFIX || pathname === LEGACY_PREFIX + "/") return "/";
  if (pathname.startsWith(LEGACY_PREFIX + "/") && matchAdminRoute(pathname))
    return pathname.slice(LEGACY_PREFIX.length);
  return pathname;
}

/** Turn public browser URLs into existing internally validated routes. */
export function toAdminInternalPath(pathname: string): string {
  if (pathname === "/" || pathname === "/login") return LEGACY_PREFIX;
  if (pathname === LEGACY_PREFIX || pathname.startsWith(LEGACY_PREFIX + "/"))
    return pathname;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return pathname;
  const candidate = LEGACY_PREFIX + pathname;
  return matchAdminRoute(candidate) ? candidate : pathname;
}

/** Preserve filters, fragment identifiers and detail URLs without normalizing them away. */
export function toAdminBrowserHref(href: string): string {
  const query = href.indexOf("?");
  const hash = href.indexOf("#");
  const suffix = query < 0 ? hash : hash < 0 ? query : Math.min(query, hash);
  const path = suffix < 0 ? href : href.slice(0, suffix);
  return toAdminBrowserPath(path) + (suffix < 0 ? "" : href.slice(suffix));
}
