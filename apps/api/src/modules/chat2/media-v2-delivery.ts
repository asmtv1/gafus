/** Chat2 Media V2: immutable public finals; original source is never public.
 * Default to S3. A separate Beget CDN can be enabled without VM or DNS writes.
 * Authorization to discover keys still belongs to the existing chat API.
 */
import type { Chat2V2Manifest } from "@gafus/feed-cloud";

export const CHAT2_V2_S3_PUBLIC_ORIGIN = "https://gafus-chat2-media-2026.s3.cloud.ru";

export function chat2V2CdnOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.CHAT2_V2_CDN_BASE_URL?.trim();
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw Error("CHAT2_V2_INVALID_CDN_ORIGIN"); }
  // Only the configured Chat2-specific CDN, never a URL or path supplied by a client.
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !/^[a-z0-9-]+\.begetcdn\.cloud$/i.test(parsed.hostname) ||
      raw !== parsed.origin && raw !== parsed.origin + "/")
    throw Error("CHAT2_V2_INVALID_CDN_ORIGIN");
  return parsed.origin;
}

export function chat2V2Delivery(manifest: Chat2V2Manifest,
  env: Record<string, string | undefined> = process.env) {
  const cdn = chat2V2CdnOrigin(env);
  const publicUrl = (key: string) => `${cdn ?? CHAT2_V2_S3_PUBLIC_ORIGIN}/${key}`;
  const directUrl = (key: string) => `${CHAT2_V2_S3_PUBLIC_ORIGIN}/${key}`;
  const mapping = (url: (key: string) => string) => manifest.kind === "image"
    ? { image: { 360: url(manifest.keys.small), 1440: url(manifest.keys.medium) },
        imageWidths: { 360: manifest.imageSizes.small.width, 1440: manifest.imageSizes.medium.width },
        poster: undefined, video: undefined }
    : { poster: manifest.posterKey ? url(manifest.posterKey) : undefined,
        video: Object.fromEntries(manifest.renditions.map(v => [v.quality, url(v.key)])),
        image: undefined, imageWidths: undefined };
  const primary = manifest.kind === "image"
    ? manifest.keys.medium : (manifest.renditions.find(x => x.quality === 360) ??
      manifest.renditions.find(x => x.quality === 720))?.key;
  if (!primary) throw Error("CHAT2_V2_NO_PRIMARY");
  return { url: publicUrl(primary), renditions: mapping(publicUrl),
    ...(cdn ? { fallbackUrl: directUrl(primary), fallbackRenditions: mapping(directUrl) } : {}),
  };
}
