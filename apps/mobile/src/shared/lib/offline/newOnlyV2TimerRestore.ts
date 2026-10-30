/** Owner/epoch attested Phase1 timer restart; no legacy storage, network or ACK. */
import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";
type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
type Selector = { courseId: string; dayId: string; stepIndex: number; daily: boolean };
export type RestoredTimer = { status: "RUNNING" | "PAUSED" | "STOPPED"; remainingSec: number };
export function projectV2Timer(
  events: readonly V2PendingEvent[],
  s: Selector,
  now: number,
): RestoredTimer | null {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  let st: { status: RestoredTimer["status"]; remainingSec: number; at: number } | null = null;
  const kinds = s.daily
    ? [
        "dailyCourseStartStep",
        "dailyCoursePauseStep",
        "dailyCourseResumeStep",
        "dailyCourseResetStep",
        "dailyCourseCompleteStep",
      ]
    : [
        "startStep",
        "pauseStep",
        "resumeStep",
        "resetStep",
        "completeTheoryStep",
        "completePracticeStep",
      ];
  for (const ev of events) {
    const p = ev.payload;
    if (!p || p.stepIndex !== s.stepIndex || !kinds.includes(ev.kind)) continue;
    if (
      s.daily ? p.scheduleId !== s.dayId : p.courseId !== s.courseId || p.dayOnCourseId !== s.dayId
    )
      continue;
    const at = ev.createdAt;
    if (!Number.isSafeInteger(at) || at < 0 || at > now || (st && at < st.at)) return null;
    if (ev.kind === "startStep" || ev.kind === "dailyCourseStartStep") {
      if (!Number.isSafeInteger(p.durationSec) || (p.durationSec as number) < 0) return null;
      st = { status: "RUNNING", remainingSec: p.durationSec as number, at };
    } else if (ev.kind === "pauseStep" || ev.kind === "dailyCoursePauseStep") {
      if (!Number.isSafeInteger(p.timeLeftSec) || (p.timeLeftSec as number) < 0) return null;
      st = { status: "PAUSED", remainingSec: p.timeLeftSec as number, at };
    } else if (ev.kind === "resumeStep" || ev.kind === "dailyCourseResumeStep") {
      if (!st || st.status !== "PAUSED") return null;
      st = { status: "RUNNING", remainingSec: st.remainingSec, at };
    } else {
      st = { status: "STOPPED", remainingSec: 0, at };
    }
  }
  if (!st) return null;
  const elapsed = st.status === "RUNNING" ? Math.floor((now - st.at) / 1000) : 0;
  const remainingSec = Math.max(0, st.remainingSec - elapsed);
  return {
    status: st.status === "RUNNING" && remainingSec === 0 ? "STOPPED" : st.status,
    remainingSec,
  };
}
export async function readOwnRestoredTimer(
  q: Queue,
  principalId: string | null,
  s: Selector,
  now: number | (() => number),
): Promise<RestoredTimer | null> {
  const before = q.getVerifiedBinding();
  if (!principalId || !before || before.principalId !== principalId) return null;
  const events = await q.getPending("progress");
  const after = q.getVerifiedBinding();
  if (!after || after.principalId !== principalId || after.authEpoch !== before.authEpoch)
    return null;
  return projectV2Timer(events, s, typeof now === "function" ? now() : now);
}
