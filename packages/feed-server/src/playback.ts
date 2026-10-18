import { createHmac, timingSafeEqual } from "node:crypto";
import { FeedError, type FeedService } from "@gafus/core/services/feed";
import { signFeedHlsManifest, parseFeedHlsPlaylist } from "@gafus/feed-cloud";
import type { FeedPlaybackStoragePort } from "@gafus/feed-storage";
const unavailable = () => new FeedError("FEED_DISABLED", undefined, 503);
const denied = () => new FeedError("NOT_FOUND", "Видео недоступно", 404);
export function createFeedPlayback(input: {
  posts: Pick<FeedService, "playbackSource">;
  storage: Pick<FeedPlaybackStoragePort, "readPlaylist" | "signCdn">;
  key: Uint8Array;
  cdnHost: string;
  fallbackSign?: (key: string, ttlSeconds: number) => Promise<string>;
  now?: () => Date;
}) {
  if (input.key.byteLength < 32) throw unavailable();
  const now = input.now ?? (() => new Date());
  const sign = (payload: string) => createHmac("sha256", input.key).update(`feed-playback-v1\n${payload}`).digest();
  function decode(ticket: string, mediaId: string) {
    if (ticket.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw denied();
    const [payload, signature] = ticket.split(".");
    const expected = sign(payload);
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw denied();
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { actorId: string; mediaId: string; expires: number };
      const ttl = data.expires - now().getTime();
      if (typeof data.actorId !== "string" || data.mediaId !== mediaId || !Number.isSafeInteger(data.expires) || ttl <= 0 || ttl > 120_000) throw denied();
      return data;
    } catch { throw denied(); }
  }
  async function manifest(mediaId: string, ticket: string, actorId?: string, delivery: "cdn" | "cloudru" = "cdn") {
    const data = decode(ticket, mediaId);
    if (actorId !== undefined && actorId !== data.actorId) throw denied();
    // Re-authorize on every manifest request: deletion/replacement revokes new access immediately.
    const source = await input.posts.playbackSource(data.actorId, mediaId);
    const expected = `posts/${source.ownerId}/${source.postId}/attachments/${mediaId}/hls/`;
    if (source.playlistKey !== expected + "playlist.m3u8") throw denied();
    const raw = await input.storage.readPlaylist(source.playlistKey);
    const segments = parseFeedHlsPlaylist(raw).map(name => expected + name);
    if (!segments.length || segments.length !== source.segmentKeys.length || segments.some((key, i) => key !== source.segmentKeys[i])) throw denied();
    if (delivery === "cloudru" && !input.fallbackSign) throw unavailable();
    // Preserve the issued ticket and manifest API contract. The storage signer
    // can return public CDN URLs after cutover; S3 fallback stays presigned.
    const remainingSeconds = Math.floor((data.expires - now().getTime()) / 1000);
    if (delivery === "cloudru" && remainingSeconds < 30) throw denied();
    return signFeedHlsManifest({ manifest: raw, ...source,
      expiresAt: new Date(data.expires), now,
      sign: delivery === "cloudru"
        ? key => input.fallbackSign!(key, Math.min(120, remainingSeconds))
        : (key, expiresAt) => input.storage.signCdn({ key, expiresAt }),
      allowedCdnHost: delivery === "cloudru" ? "s3.cloud.ru" : input.cdnHost,
    });
  }
  return {
    async ticket(actorId: string, mediaId: string) {
      await input.posts.playbackSource(actorId, mediaId);
      const expires = now().getTime() + 120_000;
      const payload = Buffer.from(JSON.stringify({ actorId, mediaId, expires })).toString("base64url");
      const ticket = `${payload}.${sign(payload).toString("base64url")}`;
      return { ticket, expiresAt: new Date(expires).toISOString(),
        manifestUrl: `/api/v1/feed-playback/${encodeURIComponent(mediaId)}?ticket=${encodeURIComponent(ticket)}` };
    },
    manifest,
  };
}
