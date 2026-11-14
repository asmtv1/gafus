/** Pure video-position domain rule; importing this file requires no DB or HTTP. */
export const MAX_VIDEO_POSITION_SECONDS = 86400 * 24;
export function validateVideoPosition(positionSeconds: number): string | null {
  if (positionSeconds < 0) return "Позиция не может быть отрицательной";
  if (positionSeconds > MAX_VIDEO_POSITION_SECONDS)
    return `Позиция не должна превышать ${MAX_VIDEO_POSITION_SECONDS} секунд`;
  return null;
}
