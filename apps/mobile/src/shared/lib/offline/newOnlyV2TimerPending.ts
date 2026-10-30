/** Phase1 read-only reduction of durable v2 events, never server ACK or replay. */
import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";
type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
type Status = "IN_PROGRESS" | "PAUSED" | "RESET" | "COMPLETED";
export type PendingTimer = {
  stepIndex: number;
  status: Status;
  eventId: string;
  remainingSec: number | null;
};
const kinds: Record<string, Status> = {
  startStep: "IN_PROGRESS",
  pauseStep: "PAUSED",
  resumeStep: "IN_PROGRESS",
  resetStep: "RESET",
  completeTheoryStep: "COMPLETED",
  completePracticeStep: "COMPLETED",
};
export function reducePendingTimers(
  events: readonly V2PendingEvent[],
  courseId: string,
  dayId: string,
): PendingTimer[] {
  const latest = new Map<number, PendingTimer>();
  for (const event of events) {
    const status = kinds[event.kind];
    if (
      !status ||
      !event.payload ||
      event.payload.courseId !== courseId ||
      event.payload.dayOnCourseId !== dayId
    )
      continue;
    const step = event.payload.stepIndex;
    if (!Number.isSafeInteger(step) || (step as number) < 0) continue;
    if (
      event.kind === "pauseStep" &&
      (!Number.isSafeInteger(event.payload.timeLeftSec) ||
        (event.payload.timeLeftSec as number) < 0)
    )
      continue;
    if (
      event.kind === "startStep" &&
      (!Number.isSafeInteger(event.payload.durationSec) ||
        (event.payload.durationSec as number) < 0)
    )
      continue;
    if (
      event.kind === "resetStep" &&
      event.payload.durationSec !== undefined &&
      (!Number.isSafeInteger(event.payload.durationSec) ||
        (event.payload.durationSec as number) < 0)
    )
      continue;
    const previous = latest.get(step as number);
    const remainingSec =
      event.kind === "pauseStep"
        ? (event.payload.timeLeftSec as number)
        : event.kind === "startStep"
          ? (event.payload.durationSec as number)
          : event.kind === "resumeStep"
            ? (previous?.remainingSec ?? null)
            : event.kind === "resetStep"
              ? typeof event.payload.durationSec === "number"
                ? event.payload.durationSec
                : null
              : null;
    latest.set(step as number, {
      stepIndex: step as number,
      status,
      eventId: event.eventId,
      remainingSec,
    });
  }
  return [...latest.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}
export async function readOwnPendingTimers(
  queue: Queue,
  principalId: string | null,
  courseId: string,
  dayId: string,
): Promise<PendingTimer[]> {
  const before = queue.getVerifiedBinding();
  if (!principalId || !before || before.principalId !== principalId || !courseId || !dayId)
    return [];
  const events = await queue.getPending("progress");
  const after = queue.getVerifiedBinding();
  if (!after || after.principalId !== principalId || after.authEpoch !== before.authEpoch)
    return [];
  return reducePendingTimers(events, courseId, dayId);
}
