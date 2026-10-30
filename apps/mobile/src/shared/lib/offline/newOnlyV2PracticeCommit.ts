/** Phase1 practice create: durable writer + owner/epoch-attested exact receipt readback. */
import { readOwnPendingPractice } from "./newOnlyV2PracticePending";
import type { NewOnlyV2Queues } from "./newOnlyV2Queues";

type PracticeQueue = Pick<NewOnlyV2Queues, "enqueue" | "getPending" | "getVerifiedBinding">;
type PracticeInput = { courseId: string; dayOnCourseId: string; stepIndex: number };

export async function commitVerifiedPractice(
  queue: PracticeQueue,
  expectedOwner: string | null,
  input: PracticeInput,
  currentOwner: () => string | null,
): Promise<string> {
  const before = queue.getVerifiedBinding();
  if (
    !expectedOwner ||
    !before ||
    before.principalId !== expectedOwner ||
    currentOwner() !== expectedOwner
  )
    throw new Error("V2_SESSION_UNVERIFIED");
  const isCurrent = () => {
    const active = queue.getVerifiedBinding();
    return (
      currentOwner() === expectedOwner &&
      active?.principalId === expectedOwner &&
      active.authEpoch === before.authEpoch
    );
  };
  const receipt = await queue.enqueue("progress", "completePracticeStep", input);
  if (!isCurrent() || receipt.ownerId !== expectedOwner || receipt.authEpoch !== before.authEpoch)
    throw new Error("V2_SESSION_CHANGED");
  // A durable setItem resolution is not yet a visible receipt: verify the exact eventId
  // through the same owner-scoped reader used by the mounted screen on restart.
  const rows = await readOwnPendingPractice(
    queue,
    expectedOwner,
    input.courseId,
    input.dayOnCourseId,
  );
  if (!isCurrent()) throw new Error("V2_SESSION_CHANGED");
  if (!rows.some((row) => row.eventId === receipt.eventId && row.stepIndex === input.stepIndex))
    throw new Error("V2_LOCAL_RECEIPT_UNCONFIRMED");
  return receipt.eventId;
}
