/* eslint-disable @gafus/require-client-catch-tracer -- URL parsing and optional CDN HEAD are normal fallbacks, not app errors. */
/**
 * expo-updates provides progress but not the total bytes downloaded.
 * A HEAD on the manifest's launch asset can provide the exact main Hermes
 * bundle size. This must not be described as the entire OTA payload:
 * images/fonts can be additional downloads or already cached.
 */
export function formatOtaMegabytes(bytes: number): string | null {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  return (bytes / 1_000_000).toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export async function getOtaMainBundleBytes(
  manifest: unknown,
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<number | null> {
  if (typeof manifest !== "object" || manifest === null ||
    !("launchAsset" in manifest)) return null;

  const asset = manifest.launchAsset;
  if (typeof asset !== "object" || asset === null ||
    !("url" in asset) || typeof asset.url !== "string") return null;

  let url: URL;
  try { url = new URL(asset.url); } catch { return null; }
  if (url.protocol !== "https:") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4500);
  try {
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      method: "HEAD",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const header = response.headers.get("content-length");
    if (!header || !/^[1-9]\d*$/.test(header)) return null;
    const bytes = Number(header);
    return Number.isSafeInteger(bytes) && bytes < 500_000_000 ? bytes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
