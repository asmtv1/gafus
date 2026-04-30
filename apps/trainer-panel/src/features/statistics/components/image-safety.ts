export function getSafeImageSrc(src: string | null | undefined, fallback: string): string {
  if (!src) {
    return fallback;
  }

  const normalizedSrc = src.trim();
  if (!normalizedSrc) {
    return fallback;
  }

  if (normalizedSrc.startsWith("/")) {
    return normalizedSrc;
  }

  try {
    const parsedUrl = new URL(normalizedSrc);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? normalizedSrc
      : fallback;
  } catch {
    return fallback;
  }
}
