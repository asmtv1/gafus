/** Respect GAFUS's tier: the shorter display edge is at most 720px.
 * Odd dimensions are rounded to even for H264 hardware encoder compatibility.
 */
export function webVideo720Dimensions(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
    width < 2 || height < 2 || width * height > 50_000_000) return null;
  const short = Math.min(width, height);
  if (short < 720 || Math.max(width, height) / short > 4) return null;
  const ratio = Math.min(1, 720 / short);
  const even = (x: number) => Math.max(2, 2 * Math.round(x / 2));
  return { width: even(width * ratio), height: even(height * ratio) };
}


/** Common GAFUS upload contract: one playable H.264/AAC MP4 at <=30fps.
 * Source bitrate is a measured upper bound, not an extension/MIME guess. */
export const WEB_VIDEO_MAX_FPS = 30;
export const WEB_VIDEO_MAX_TOTAL_BITRATE = 2_050_000;
export const WEB_VIDEO_MAX_DURATION_SECONDS = 120;
export const WEB_VIDEO_MAX_SHORT_EDGE = 720;

export type WebVideoSourceProbe = {
  container: string; videoCodec: string | null; audioCodec: string | null;
  videoTracks: number; audioTracks: number; otherTracks: number;
  width: number; height: number; duration: number; maxFrameRate: number;
  totalBitrate: number; hdr: boolean; rotation: number;
};

export function canReuseWeb720(source: WebVideoSourceProbe): boolean {
  return source.container === "mp4" && source.videoCodec === "avc" &&
    (source.audioTracks === 0 || source.audioCodec === "aac") &&
    source.videoTracks === 1 && source.audioTracks <= 1 && source.otherTracks === 0 &&
    Number.isFinite(source.width) && Number.isFinite(source.height) &&
    Math.min(source.width, source.height) >= 2 &&
    Math.min(source.width, source.height) <= WEB_VIDEO_MAX_SHORT_EDGE &&
    Number.isFinite(source.duration) && source.duration > 0 &&
    source.duration <= WEB_VIDEO_MAX_DURATION_SECONDS &&
    Number.isFinite(source.maxFrameRate) && source.maxFrameRate > 0 &&
    source.maxFrameRate <= WEB_VIDEO_MAX_FPS + .05 &&
    Number.isFinite(source.totalBitrate) && source.totalBitrate > 0 &&
    source.totalBitrate <= WEB_VIDEO_MAX_TOTAL_BITRATE &&
    !source.hdr && source.rotation === 0;
}
