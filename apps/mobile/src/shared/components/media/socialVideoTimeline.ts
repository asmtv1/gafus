/** Pure timeline maths shared by Moments and Chat 2.0 native MP4 players. */
export function mediaTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

export function safeVideoDuration(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function videoProgress(seconds: number, duration: number): number {
  const validDuration = safeVideoDuration(duration);
  if (!validDuration || !Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(1, seconds / validDuration));
}

export function videoSeekForTouch(locationX: number, trackWidth: number, duration: number): number {
  if (!Number.isFinite(locationX) || !Number.isFinite(trackWidth) || trackWidth <= 0) return 0;
  return videoProgress(locationX, trackWidth) * safeVideoDuration(duration);
}
