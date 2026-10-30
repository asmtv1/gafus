/** Read-only Phase1 daily-course projection; no legacy, network, ACK or dequeue. */
import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";
import type { PendingTimer } from "./newOnlyV2TimerPending";
type ReadQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
const DAILY_KINDS = {
  dailyCourseStartStep: "IN_PROGRESS",
  dailyCoursePauseStep: "PAUSED",
  dailyCourseResumeStep: "IN_PROGRESS",
  dailyCourseResetStep: "RESET",
  dailyCourseCompleteStep: "COMPLETED",
} as const;
export function reducePendingDailyTimers(
  events: readonly V2PendingEvent[],
  scheduleId: string,
): PendingTimer[] {
  const latest = new Map<number, PendingTimer>();
  for (const event of events) {
    if (!Object.prototype.hasOwnProperty.call(DAILY_KINDS, event.kind)) continue;
    const payload = event.payload;
    if (!payload || payload.scheduleId !== scheduleId) continue;
    const step = payload.stepIndex;
    if (!Number.isSafeInteger(step) || (step as number) < 0) continue;
    const status = DAILY_KINDS[event.kind as keyof typeof DAILY_KINDS];
    if (
      event.kind === "dailyCourseStartStep" &&
      (payload.status !== "IN_PROGRESS" ||
        !Number.isSafeInteger(payload.durationSec) ||
        (payload.durationSec as number) < 0)
    )
      continue;
    if (
      event.kind === "dailyCoursePauseStep" &&
      (!Number.isSafeInteger(payload.timeLeftSec) || (payload.timeLeftSec as number) < 0)
    )
      continue;
    const previous = latest.get(step as number);
    const remainingSec =
      event.kind === "dailyCourseStartStep"
        ? (payload.durationSec as number)
        : event.kind === "dailyCoursePauseStep"
          ? (payload.timeLeftSec as number)
          : event.kind === "dailyCourseResumeStep"
            ? (previous?.remainingSec ?? null)
            : null;
    latest.set(step as number, {
      stepIndex: step as number,
      status,
      remainingSec,
      eventId: event.eventId,
    });
  }
  return [...latest.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}
export async function readOwnPendingDailyTimers(
  queue: ReadQueue,
  ownerId: string | null,
  scheduleId: string,
): Promise<PendingTimer[]> {
  const before = queue.getVerifiedBinding();
  if (!ownerId || !scheduleId || !before || before.principalId !== ownerId) return [];
  const events = await queue.getPending("progress");
  const after = queue.getVerifiedBinding();
  if (!after || after.principalId !== ownerId || after.authEpoch !== before.authEpoch) return [];
  return reducePendingDailyTimers(events, scheduleId);
}
