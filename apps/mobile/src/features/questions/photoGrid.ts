/** Keep every question/answer photo visible while using the card's full width.
 * Five photos use 3+2, four use 2+2; each row's cells grow equally. */
export function questionPhotoGridRows<T>(photos: readonly T[]): { photo: T; index: number }[][] {
  const columns = photos.length === 2 || photos.length === 4 ? 2 : 3;
  const rows: { photo: T; index: number }[][] = [];
  for (let index = 0; index < photos.length; index += columns) {
    rows.push(photos.slice(index, index + columns).map((photo, offset) => ({
      photo, index: index + offset,
    })));
  }
  return rows;
}


/** Preserve natural ratio; max height belongs to the container. */
export function questionSinglePhotoPreviewRatio(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return 1;
  return width / height;
}

/** Limit tall photos while keeping the full image visible via contain. */
export function questionSinglePhotoPreviewHeight(
  containerWidth: number, ratio: number, maxHeight = 640,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 240;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return Math.max(100, Math.min(maxHeight, containerWidth / safeRatio));
}

/** Adaptive justified rows with bounded widths for tappable portrait cells. */
export function questionPhotoRowLayout(
  containerWidth: number, ratios: readonly number[], gap = 8, maxHeight = 280,
): { height: number; weights: number[] } {
  const weights = ratios.map(r => Number.isFinite(r) && r > 0
    ? Math.max(0.65, Math.min(1.9, r)) : 1);
  const available = Math.max(1, containerWidth - gap * Math.max(0, weights.length - 1));
  const height = Math.max(80, Math.min(maxHeight, available / (weights.reduce((a,b) => a+b,0) || 1)));
  return { height, weights };
}
