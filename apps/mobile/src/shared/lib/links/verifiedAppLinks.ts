/**
 * Verified GAFUS HTTPS App/Universal Links -> actual Expo Router paths.
 * OS domain association alone is not authorization: protected content always
 * requires the real session and server-side ACL. Password reset stays guest.
 *
 * Never navigate from an arbitrary URL, userinfo, foreign host, or untrusted
 * path. Unknown legitimate links stay in the browser instead of routing 404.
 */
const allowedHosts = new Set(["gafus.ru","www.gafus.ru"]);
const id = "[A-Za-z0-9_-]{1,128}";
const detailPath = new RegExp(`^/(feed|questions|chats)/${id}$`);
const momentsDetailPath = new RegExp(`^/moments/(${id})$`);
const trainingPath = new RegExp(`^/training/${id}(?:/${id})?$`);

export function nativePathForVerifiedGafusUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; } // eslint-disable-line @gafus/require-client-catch-tracer -- malformed external URL is expected untrusted input
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port) return null;
  const path = url.pathname;
  // Do not let encoded slashes/dot segments smuggle another route or domain.
  if (/%2f|%5c|\\/i.test(path)) return null;
  if (path === "/reset-password") return `/reset-password${url.search}`;
  if (path === "/moments") return "/feed";
  // The web /moments namespace also contains reserved non-post paths.
  // Never mistake /moments/new or /moments/drafts for post IDs.
  if (path === "/moments/new") return "/feed/create";
  if (path === "/moments/saved") return "/feed/saved";
  if (path === "/moments/drafts" || path.startsWith("/moments/drafts/") ||
      path === "/moments/notifications") return "/feed";
  const profile = /^\/moments\/profile\/([A-Za-z0-9_-]{1,128})$/.exec(path);
  if (profile) return `/feed/profile/${profile[1]}`;
  if (path === "/moments/profile") return "/feed";
  const moment = momentsDetailPath.exec(path);
  if (moment) return `/feed/${moment[1]}${url.search}`;
  if (detailPath.test(path) || trainingPath.test(path)) return `${path}${url.search}`;
  return null;
}
