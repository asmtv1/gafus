/** Only the single active WebP/MP4 asset namespace can be delivered to clients.
 * Old Refactor test snapshot rows must not cause a 500 or re-enable HLS playback.
 * Exact variant matching prevents accidentally signing media owned by another asset.
 */
export interface FeedMediaUrlKeys {
  id: string;
  kind: "photo" | "video";
  smallKey: string | null;
  thumbKey: string | null;
  fullKey: string | null;
  posterKey: string | null;
  mp4Keys: readonly string[];
}
export interface SignedFeedMediaUrls {
  smallUrl: string | null;
  thumbUrl: string | null;
  fullUrl: string | null;
  posterUrl: string | null;
  mp4Urls: { 360: string; 720?: string; 1080?: string } | null;
}
export async function signFeedMediaUrls(
  asset: FeedMediaUrlKeys,
  sign: (key: string) => Promise<string>,
): Promise<SignedFeedMediaUrls> {
  const prefix = `media/v2/${asset.id}/v1/`;
  const exact = async (key: string | null | undefined, variant: string) =>
    key === prefix + variant ? sign(key) : null;
  if (asset.kind === "photo") {
    const [smallUrl, thumbUrl, fullUrl] = await Promise.all([
      exact(asset.smallKey, "image/s.webp"),
      exact(asset.thumbKey, "image/m.webp"),
      exact(asset.fullKey, "image/l.webp"),
    ]);
    return { smallUrl, thumbUrl, fullUrl, posterUrl: null, mp4Urls: null };
  }
  const posterUrl = await exact(asset.posterKey, "poster.webp");
  const qualities = [360, 720, 1080] as const;
  const candidates = await Promise.all(qualities.map(quality =>
    exact(asset.mp4Keys.find(key => key === `${prefix}video/${quality}.mp4`),
      `video/${quality}.mp4`),
  ));
  if (!posterUrl || !candidates[0]) {
    return { smallUrl: null, thumbUrl: null, fullUrl: null, posterUrl: null, mp4Urls: null };
  }
  return {
    smallUrl: null, thumbUrl: null, fullUrl: null, posterUrl,
    mp4Urls: { 360: candidates[0],
      ...(candidates[1] ? { 720: candidates[1] } : {}),
      ...(candidates[2] ? { 1080: candidates[2] } : {}),
    },
  };
}
