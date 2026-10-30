/**
 * Public course-card artwork only. Keep this intentionally narrower than
 * getCDNUrl: the latter accepts arbitrary absolute URLs and signed URLs.
 * Never serialize signed query strings, local/private URLs or upload keys from
 * otherwise private media to an anonymous browser response.
 */
export function publicCourseCoverUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      parsed.search || parsed.hash) return null;
  const yandexPath = parsed.hostname === "storage.yandexcloud.net" &&
    parsed.pathname.startsWith("/gafus-media/uploads/");
  const legacyPath = parsed.hostname === "gafus-media.storage.yandexcloud.net" &&
    parsed.pathname.startsWith("/uploads/");
  if (!yandexPath && !legacyPath) return null;
  // Two legacy course covers are stored with .blob keys despite serving
  // Content-Type: image/png (confirmed against the public Yandex object URLs).
  // Accept those *only* in the original trainer/course cover namespace,
  // where the filename matches its UUID directory. Never admit arbitrary
  // .blob uploads or relax the existing unsigned-public-HTTPS restrictions.
  const legacyCourseBlobPattern = new RegExp(
    "^/(?:gafus-media/)?uploads/trainers/[a-zA-Z0-9_-]{1,128}/courses/" +
    "([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/\\1\\.blob$",
    "i",
  );
  const legacyCourseBlob = legacyCourseBlobPattern.test(parsed.pathname);
  if (parsed.pathname.includes("..") || parsed.pathname.includes("%") ||
      (!/\.(?:png|jpe?g|webp|avif)$/i.test(parsed.pathname) && !legacyCourseBlob))
    return null;
  return value;
}
