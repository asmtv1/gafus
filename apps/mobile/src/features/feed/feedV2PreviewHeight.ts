/** Compact native feed previews; only the viewer itself goes fullscreen.
 * The source MP4 is never cropped or re-encoded for the preview. */
export function feedV2PreviewHeight(
  media: { width: number; height: number },
  containerWidth: number,
  viewportHeight: number,
): number {
  const width = Number.isFinite(media.width) && media.width > 0 ? media.width : 16;
  const height = Number.isFinite(media.height) && media.height > 0 ? media.height : 9;
  const ratio = height > width ? 5 / 4 : height === width ? 1 : 9 / 16;
  return Math.max(1, Math.round(Math.min(containerWidth * ratio, viewportHeight * 0.52, 440)));
}
