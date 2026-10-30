/** Phase1 mounted timer recovery for AccordionStep, no legacy keys/replay/writer. */
import { useEffect } from "react";
import { useTimerStore } from "@/shared/stores/timerStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { readOwnRestoredTimer } from "@/shared/lib/offline/newOnlyV2TimerRestore";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import type { NewOnlyV2Queues } from "@/shared/lib/offline/newOnlyV2Queues";

type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
export type StepTimerRestoreDependencies = {
  queue: Queue;
  currentOwner: () => string | null;
  now: () => number;
};
const native: StepTimerRestoreDependencies = {
  queue: newOnlyV2NativeQueues,
  currentOwner: () => useAuthStore.getState().user?.id ?? null,
  now: () => Date.now(),
};
export function useVerifiedV2StepTimerRestore(
  courseId: string,
  dayId: string,
  stepIndex: number,
  status: string,
  showTimer: boolean,
  ownerId: string | null,
  verifiedEpoch: string | null,
  deps: StepTimerRestoreDependencies = native,
) {
  useEffect(() => {
    const binding = deps.queue.getVerifiedBinding();
    if (
      !showTimer ||
      !ownerId ||
      !binding ||
      binding.principalId !== ownerId ||
      binding.authEpoch !== verifiedEpoch ||
      deps.currentOwner() !== ownerId
    )
      return;
    const session = { ownerId, authEpoch: binding.authEpoch };
    const store = useTimerStore.getState();
    const existing = store.activeTimer;
    // An in-memory timer without the CURRENT owner+epoch is never a valid
    // restored timer, even if its course/day/step strings happen to be identical.
    if (existing && (existing.ownerId !== ownerId || existing.authEpoch !== binding.authEpoch)) {
      store.stopTimer(existing.courseId, existing.dayOnCourseId, existing.stepIndex);
    }
    if (status !== "IN_PROGRESS") {
      if (status === "COMPLETED" && store.isTimerActiveFor(courseId, dayId, stepIndex, session))
        store.stopTimer(courseId, dayId, stepIndex);
      return;
    }
    let cancelled = false;
    const selector = { courseId, dayId, stepIndex, daily: courseId === `daily-course:${dayId}` };
    void readOwnRestoredTimer(deps.queue, ownerId, selector, deps.now)
      .then((restored) => {
        if (cancelled || !restored) return;
        const after = deps.queue.getVerifiedBinding();
        if (
          !after ||
          after.principalId !== ownerId ||
          after.authEpoch !== binding.authEpoch ||
          deps.currentOwner() !== ownerId
        )
          return;
        const live = useTimerStore.getState();
        if (restored.status === "STOPPED") {
          if (live.isTimerActiveFor(courseId, dayId, stepIndex, session))
            live.stopTimer(courseId, dayId, stepIndex);
          return;
        }
        if (restored.status !== "RUNNING" || restored.remainingSec <= 0) return;
        if (!live.activeTimer)
          live.startTimer(courseId, dayId, stepIndex, restored.remainingSec, session);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "VerifiedV2TimerRestore",
            keys: { operation: "readPending" },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, dayId, stepIndex, status, showTimer, ownerId, verifiedEpoch, deps]);
}
