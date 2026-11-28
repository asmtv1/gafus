function stripControlCharsExceptNewlines(s: string): string {
  let result = "";
  for (const char of s) {
    const code = char.charCodeAt(0);
    const allowed = char === "\t" || char === "\n" || char === "\r";
    const isC0Control = code <= 0x1f || code === 0x7f;
    if (allowed || !isC0Control) {
      result += char;
    }
  }
  return result;
}

const MAX_ABOUT_LENGTH = 20_000;

export function plainConsultationAboutHtml(raw: string | null): string {
  if (!raw?.trim()) {
    return "";
  }
  let s = raw.replace(/<[^>]*>/g, "");
  s = stripControlCharsExceptNewlines(s);
  if (s.length > MAX_ABOUT_LENGTH) {
    s = s.slice(0, MAX_ABOUT_LENGTH);
  }
  return s.trim();
}

export function cynologistDisplayInitials(displayName: string | null): string {
  const s = (displayName ?? "К").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase() || "К";
}

/** Matches the former Next catalog: already absolute URLs or original CDN-backed relative media keys. */
export function cynologistAvatarSrc(value: string | null | undefined): string | null {
  const path = value?.trim();
  if (
    !path ||
    [...path].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return null;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return url.username || url.password ? null : path;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.includes("\\")) {
    return null;
  }
  // Relative media keys are scoped to our public bucket, not arbitrary
  // sibling buckets. Reject traversal (including URL-normalized escapes).
  const relative = path.startsWith("/") ? path.slice(1) : path;
  const base = "https://storage.yandexcloud.net/gafus-media/";
  const resolved = new URL(base + relative);
  if (!resolved.pathname.startsWith("/gafus-media/")) return null;
  return base + relative;
}
