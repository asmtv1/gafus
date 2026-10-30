/** Phase1 local-only practice preview; no v1 reads, network, ACK or removal. */
import type { NewOnlyV2Queues, V2SessionBinding } from "./newOnlyV2Queues";

type ReadQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
export type LocalPracticePending = { eventId: string; stepIndex: number };

export async function readOwnPendingPractice(
  queue: ReadQueue,
  ownerId: string | null,
  courseId: string,
  dayOnCourseId: string,
): Promise<LocalPracticePending[]> {
  const first: V2SessionBinding | null = queue.getVerifiedBinding();
  if (!ownerId || !first || first.principalId !== ownerId || !courseId || !dayOnCourseId) return [];
  const events = await queue.getPending("progress");
  const final = queue.getVerifiedBinding();
  if (!final || final.principalId !== ownerId || final.authEpoch !== first.authEpoch) return [];
  return events.flatMap((event): LocalPracticePending[] => {
    if (event.kind !== "completePracticeStep") return [];
    const payload = event.payload;
    if (payload.courseId !== courseId || payload.dayOnCourseId !== dayOnCourseId) return [];
    if (!Number.isSafeInteger(payload.stepIndex) || (payload.stepIndex as number) < 0) return [];
    return [{ eventId: event.eventId, stepIndex: payload.stepIndex as number }];
  });
}
