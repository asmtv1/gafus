/** Height for an uncropped feed attachment preview, stable across carousel pages. */
export function getFeedPreviewHeight(
  frameWidth: number,
  imageWidth?: number | null,
  imageHeight?: number | null,
  viewportHeight = 800,
): number {
  const width = Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : 320;
  const validDimensions = imageWidth != null && imageHeight != null &&
    Number.isFinite(imageWidth) && Number.isFinite(imageHeight) &&
    imageWidth > 0 && imageHeight > 0;
  const ratio = validDimensions ? imageWidth / imageHeight : 4 / 3;
  const maxHeight = Math.min(440, Math.max(260, viewportHeight * 0.58));
  return Math.max(160, Math.min(width / ratio, maxHeight));
}
