import { parseFeedHlsPlaylist, FeedVideoError } from "./video.js";

export interface SignedFeedManifest {
  playlist: string;
  expiresAt: string;
}
/**
 * Replaces HLS segment references with short-lived, individually signed CDN URLs.
 * Client never sees the internal bucket/key or an unsigned storage origin.
 * Caller must authorize the published media and supply an audited CDN signer.
 */
export async function signFeedHlsManifest(input: {
  manifest: string;
  ownerId: string;
  postId: string;
  mediaId: string;
  expiresAt: Date;
  now?: () => Date;
  sign: (key: string, expiresAt: Date) => Promise<string>;
  allowedCdnHost: string;
}): Promise<SignedFeedManifest> {
  const { manifest, expiresAt, sign, allowedCdnHost } = input;
  const now = (input.now ?? (() => new Date()))();
  const ttl = expiresAt.getTime() - now.getTime();
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 120_000) {
    throw new FeedVideoError("VIDEO_TICKET_EXPIRED");
  }
  if (Buffer.byteLength(manifest) > 64 * 1024) throw new FeedVideoError("VIDEO_PLAYLIST_SIZE");
  for (const line of manifest.split(/\r?\n/)) {
    if (line.startsWith("#") &&
        !/^#(?:EXTM3U|EXT-X-VERSION:[0-9]+|EXT-X-PLAYLIST-TYPE:VOD|EXT-X-TARGETDURATION:[0-9]+|EXT-X-MEDIA-SEQUENCE:[0-9]+|EXT-X-INDEPENDENT-SEGMENTS|EXTINF:[0-9.]+,|EXT-X-ENDLIST)$/.test(line.trim())) {
      throw new FeedVideoError("VIDEO_PLAYLIST_UNTRUSTED_TAG");
    }
  }
  const names = parseFeedHlsPlaylist(manifest);
  const prefix = `posts/${input.ownerId}/${input.postId}/attachments/${input.mediaId}/hls/`;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.ownerId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.postId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.mediaId)) {
    throw new FeedVideoError("VIDEO_MEDIA_ID");
  }
  if (!/^[A-Za-z0-9.-]+$/.test(allowedCdnHost)) throw new FeedVideoError("VIDEO_CDN_HOST");
  const signed = await Promise.all(names.map(async name => {
    const url = new URL(await sign(prefix + name, expiresAt));
    if (url.protocol !== "https:" || url.hostname !== allowedCdnHost ||
        url.username || url.password || url.port || url.hash) {
      throw new FeedVideoError("VIDEO_CDN_SIGNATURE");
    }
    return url.toString();
  }));
  let index = 0;
  const rendered = manifest.split(/\r?\n/).map(line =>
    line.trim() && !line.trim().startsWith("#") ? signed[index++]! : line,
  ).join("\n");
  return { playlist: rendered, expiresAt: expiresAt.toISOString() };
}
