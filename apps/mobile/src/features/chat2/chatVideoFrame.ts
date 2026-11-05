/** Display video messages at their actual orientation without consuming a whole chat screen. */
export function chatVideoFrameHeight(width: number, nativeWidth?: number, nativeHeight?: number): number {
  if (!Number.isFinite(width) || width <= 0) return 220;
  if (!nativeWidth || !nativeHeight || !Number.isFinite(nativeWidth) ||
      !Number.isFinite(nativeHeight) || nativeWidth <= 0 || nativeHeight <= 0) return width;
  return Math.round(Math.max(160, Math.min(360, width * nativeHeight / nativeWidth)));
}
