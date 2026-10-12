/** Only owner-authorized legacy user documents may be proxied by the Web node.
 * Cloud.ru originals use direct presigned redirects, never a server-side fetch. */
export function trustedLegacyPetDocumentSource(raw: string): boolean {
  // Validate the literal input before URL parsing; WHATWG URL normalizes encoded
  // dot segments (e.g. %2e%2e) before pathname checks can detect them.
  if (raw.includes("%") || raw.includes("\\")) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (url.search || url.hash) return false;
  const path = url.pathname;
  if (
    path.includes("%") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "." || part === "..")
  )
    return false;
  if (url.hostname === "storage.yandexcloud.net")
    return path.startsWith("/gafus-media/uploads/users/");
  if (url.hostname === "gafus-media.storage.yandexcloud.net")
    return path.startsWith("/uploads/users/");
  if (["gafus.ru", "www.gafus.ru"].includes(url.hostname))
    return path.startsWith("/uploads/users/");
  return false;
}
