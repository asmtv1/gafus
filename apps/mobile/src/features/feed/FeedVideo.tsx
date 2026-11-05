import type { FeedV2VideoMedia } from "@gafus/types";
import { FeedV2Video, stopFeedV2OutsidePosts } from "./FeedV2Media";

/** Single native progressive MP4 player for the Moments feed. No HLS tickets. */
export const stopFeedVideoOutsidePosts = stopFeedV2OutsidePosts;
export function FeedVideo({ postId, mediaId, poster, visible, mp4Urls, width, height }: {
  postId: string; mediaId: string; poster: string | null; visible: boolean;
  mp4Urls?: { 360?: string; 720?: string } | null;
  width?: number; height?: number;
}) {
  if (!(mp4Urls?.[360] || mp4Urls?.[720])) return null;
  const media: FeedV2VideoMedia = { id: mediaId, kind: "video", status: "ready",
    width: width ?? 1280, height: height ?? 720, durationSeconds: 0, access: "viewer",
    placeholder: null, expiresAt: null, posterUrl: poster ?? "", mp4: mp4Urls };
  return <FeedV2Video postId={postId} media={media} visible={visible} />;
}
