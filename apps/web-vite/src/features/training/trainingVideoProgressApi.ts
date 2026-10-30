import { apiRequest } from "../../shared/api/client";

const videoId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function safeTrainingVideoId(value: unknown): string | null {
  return videoId(value) ? value : null;
}

/** Existing owner-protected Hono video progress API. Never fabricate an
 * access token, actor ID, or progress value; the server checks permission.
 */
export async function readTrainingVideoProgress(id: string): Promise<number | null> {
  if (!videoId(id)) throw Error("INVALID_TRAINING_VIDEO_ID");
  const result: unknown = await apiRequest<unknown>(
    `/api/v1/training/video/${id}/progress`,
    { method: "GET", browserAuth: true },
  );
  if (result === null) return null;
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      !("lastPositionSec" in result) ||
      !Number.isSafeInteger(result.lastPositionSec) ||
      Number(result.lastPositionSec) < 0 || Number(result.lastPositionSec) > 86_400 * 24) {
    throw Error("INVALID_TRAINING_VIDEO_PROGRESS");
  }
  return result.lastPositionSec as number;
}

/** User-initiated playback only. Write exact integer seconds, no automatic
 * replay of an uncertain POST acknowledgement; allow a later new position.
 */
export async function writeTrainingVideoProgress(id: string, positionSec: number) {
  if (!videoId(id) || !Number.isSafeInteger(positionSec) ||
      positionSec < 0 || positionSec > 86_400 * 24) {
    throw Error("INVALID_TRAINING_VIDEO_POSITION");
  }
  await apiRequest<void>(`/api/v1/training/video/${id}/progress`, {
    method: "POST", browserAuth: true, json: { positionSec }, expectedStatus: 200,
  });
}
