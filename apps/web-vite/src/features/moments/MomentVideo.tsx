import { FeedV2Video } from "./FeedV2Video";
import type { FeedV2VideoMedia } from "@gafus/types";

/** Native progressive MP4; signed variants arrive with the publication (zero extra requests). */
export function MomentVideo({ mediaId, poster, mp4Urls, width, height }: {
  mediaId: string; poster: string | null;
  mp4Urls?: { 360?: string; 720?: string };
  width?: number; height?: number;
}) {
  if (!(mp4Urls?.[360] || mp4Urls?.[720])) return <div role="alert">Видео недоступно</div>;
  const media: FeedV2VideoMedia = {
    id: mediaId, kind: "video", status: "ready", width: width ?? 1280,
    height: height ?? 720, durationSeconds: 0, access: "viewer",
    expiresAt: null, placeholder: null, posterUrl: poster ?? "", mp4: mp4Urls,
  };
  return <FeedV2Video media={media} />;
}
