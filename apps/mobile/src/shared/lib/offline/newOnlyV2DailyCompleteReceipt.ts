/** Daily Phase1 complete occurrence: scheduleId + stepIndex; never generic Step.id. */
import { readOwnPendingDailyTimers } from "./newOnlyV2DailyPending";
import type { NewOnlyV2Queues } from "./newOnlyV2Queues";

type Queue = Pick<NewOnlyV2Queues, "enqueue" | "getPending" | "getVerifiedBinding">;
export type DailyOccurrence = { scheduleId: string; stepIndex: number };

export async function commitVerifiedDailyCompletion(
  queue: Queue,
  owner: string | null,
  occurrence: DailyOccurrence,
  currentOwner: () => string | null,
): Promise<string> {
  const binding = queue.getVerifiedBinding();
  if (!owner || !binding || binding.principalId !== owner || currentOwner() !== owner)
    throw new Error("V2_SESSION_UNVERIFIED");
  const valid = () => {
    const after = queue.getVerifiedBinding();
    return (
      after?.principalId === owner &&
      after.authEpoch === binding.authEpoch &&
      currentOwner() === owner
    );
  };
  // The scheduled occurrence is the durable identity; a Step.id can recur on another
  // schedule or several step positions. Do not invent an unapproved wire DTO field.
  const receipt = await queue.enqueue("progress", "dailyCourseCompleteStep", occurrence);
  if (!valid() || receipt.ownerId !== owner || receipt.authEpoch !== binding.authEpoch)
    throw new Error("V2_SESSION_CHANGED");
  const rows = await readOwnPendingDailyTimers(queue, owner, occurrence.scheduleId);
  if (!valid()) throw new Error("V2_SESSION_CHANGED");
  if (
    !rows.some(
      (row) =>
        row.eventId === receipt.eventId &&
        row.stepIndex === occurrence.stepIndex &&
        row.status === "COMPLETED",
    )
  )
    throw new Error("V2_LOCAL_RECEIPT_UNCONFIRMED");
  return receipt.eventId;
}
