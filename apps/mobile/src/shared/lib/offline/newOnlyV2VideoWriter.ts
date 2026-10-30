/** Phase1 VIDEO-only NEW-only writer. No HTTP, legacy v1 read/mutation or ACK. */
import type { NewOnlyV2Queues } from "./newOnlyV2Queues";
import { NewOnlyV2Error } from "./newOnlyV2Queues";

type DurableWriter = Pick<NewOnlyV2Queues, "enqueue" | "getVerifiedBinding">;

/** Do not promote a local video position until the owner-scoped disk write resolves. */
export async function persistNewOnlyVideoProgress(
  writer: DurableWriter,
  videoId: string,
  positionSec: number,
  updatedAt: number,
) {
  if (!writer.getVerifiedBinding()) throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(videoId) ||
    !Number.isSafeInteger(positionSec) ||
    positionSec < 0 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt <= 0
  )
    throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
  return writer.enqueue("progress", "saveVideoProgress", {
    videoId,
    positionSec,
    updatedAt,
  });
}

/** Verified owner/epoch read of the *new* v2 queue only; never opens the v1 video cache. */
export async function readOwnPendingVideoProgress(
  queue: Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">,
  videoId: string,
): Promise<{ positionSec: number; updatedAt: number } | null> {
  const start = queue.getVerifiedBinding();
  if (!start || !videoId) return null;
  const events = await queue.getPending("progress");
  const finish = queue.getVerifiedBinding();
  if (!finish || finish.principalId !== start.principalId || finish.authEpoch !== start.authEpoch)
    return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.kind !== "saveVideoProgress" || event.payload.videoId !== videoId) continue;
    const positionSec = event.payload.positionSec;
    const updatedAt = event.payload.updatedAt;
    if (
      Number.isSafeInteger(positionSec) &&
      (positionSec as number) >= 0 &&
      Number.isSafeInteger(updatedAt) &&
      (updatedAt as number) > 0
    )
      return { positionSec: positionSec as number, updatedAt: updatedAt as number };
  }
  return null;
}
