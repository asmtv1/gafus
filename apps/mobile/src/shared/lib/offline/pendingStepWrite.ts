import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";
import { stepJournalResource } from "./journalVersionFields";

type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
type StepCommand = {
  stepIndex: number;
  courseId?: string; dayOnCourseId?: string;
  scheduleId?: string; expectedBundleStepId?: string;
  expectedStepOnDayId?: string; expectedStepId?: string;
};

function sharesScope(a: Record<string, unknown>, b: StepCommand): boolean {
  return b.scheduleId !== undefined
    ? a.scheduleId === b.scheduleId
    : a.courseId === b.courseId && a.dayOnCourseId === b.dayOnCourseId;
}

/** A new online command must not overtake an older locally durable command
 * for the same occurrence. Unbound historical entries can only block, never
 * be promoted to a bound event or assigned a different identity. */
export function hasEarlierStepCommand(events: readonly V2PendingEvent[], command: StepCommand): boolean {
  const resource = stepJournalResource(command);
  return events.some(event => {
    const p = event.payload;
    if (event.kind === "saveVideoProgress" || !sharesScope(p, command)) return false;
    const earlier = stepJournalResource(p);
    if (resource && earlier) return resource === earlier;
    return p.stepIndex === command.stepIndex;
  });
}
export async function hasPendingStepWrite(queue: Queue, command: StepCommand): Promise<boolean> {
  const before = queue.getVerifiedBinding();
  if (!before) return false;
  const rows = await queue.getPending("progress");
  const after = queue.getVerifiedBinding();
  if (!after || after.principalId !== before.principalId || after.authEpoch !== before.authEpoch)
    throw new Error("V2_SESSION_CHANGED");
  return hasEarlierStepCommand(rows, command);
}
