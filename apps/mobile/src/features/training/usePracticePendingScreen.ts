/** Phase1 local-only practice preview: screen focus/restart, owner/epoch fence. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { NewOnlyV2Queues } from "@/shared/lib/offline/newOnlyV2Queues";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import {
  readOwnPendingPractice,
  type LocalPracticePending,
} from "@/shared/lib/offline/newOnlyV2PracticePending";

type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
export type PracticePendingDependencies = { queue: Queue; currentOwner: () => string | null };
const native: PracticePendingDependencies = {
  queue: newOnlyV2NativeQueues,
  currentOwner: () => useAuthStore.getState().user?.id ?? null,
};
export type PracticeReadStatus = "UNVERIFIED" | "READING" | "READY" | "UNAVAILABLE";
type Snapshot = {
  owner: string;
  epoch: string;
  course: string;
  day: string;
  rows: LocalPracticePending[];
};
export function usePracticePendingScreen(
  ownerId: string | null,
  courseId: string,
  dayId: string,
  deps: PracticePendingDependencies = native,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [readState, setReadState] = useState<
    (Omit<Snapshot, "rows"> & { status: PracticeReadStatus }) | null
  >(null);
  const revision = useRef(0);
  const active = useRef(true);
  const deactivate = useCallback(() => {
    active.current = false;
    revision.current++;
    setSnapshot(null);
    setReadState(null);
  }, []);
  const activate = useCallback(() => {
    active.current = true;
  }, []);
  useEffect(
    () => () => {
      active.current = false;
      revision.current++;
    },
    [],
  );
  useEffect(() => {
    revision.current++;
    setSnapshot(null);
    setReadState(null);
  }, [ownerId, courseId, dayId]);
  const verified = useCallback(
    (token: number, owner: string, epoch: string) => {
      const now = deps.queue.getVerifiedBinding();
      return (
        active.current &&
        token === revision.current &&
        deps.currentOwner() === owner &&
        now?.principalId === owner &&
        now.authEpoch === epoch
      );
    },
    [deps],
  );
  const refreshPendingPractice = useCallback(async () => {
    const token = ++revision.current;
    setSnapshot(null);
    setReadState(null);
    const binding = deps.queue.getVerifiedBinding();
    if (
      !ownerId ||
      !courseId ||
      !dayId ||
      !binding ||
      binding.principalId !== ownerId ||
      deps.currentOwner() !== ownerId ||
      !active.current
    )
      return;
    const meta = { owner: ownerId, epoch: binding.authEpoch, course: courseId, day: dayId };
    setReadState({ ...meta, status: "READING" });
    try {
      const rows = await readOwnPendingPractice(deps.queue, ownerId, courseId, dayId);
      if (!verified(token, ownerId, binding.authEpoch)) return;
      setSnapshot({ ...meta, rows });
      setReadState({ ...meta, status: "READY" });
    } catch {
      if (verified(token, ownerId, binding.authEpoch)) {
        setSnapshot(null);
        setReadState({ ...meta, status: "UNAVAILABLE" });
      }
    }
  }, [deps, ownerId, courseId, dayId, verified]);
  const binding = deps.queue.getVerifiedBinding();
  const valid =
    active.current &&
    !!ownerId &&
    !!binding &&
    deps.currentOwner() === ownerId &&
    binding.principalId === ownerId;
  const matching = (value: Omit<Snapshot, "rows"> | null) =>
    valid &&
    value &&
    value.owner === ownerId &&
    value.epoch === binding.authEpoch &&
    value.course === courseId &&
    value.day === dayId;
  const pendingPractice = matching(snapshot) ? snapshot!.rows : [];
  const pendingReadStatus: PracticeReadStatus = !valid
    ? "UNVERIFIED"
    : matching(readState)
      ? readState!.status
      : "READING";
  return { pendingPractice, pendingReadStatus, refreshPendingPractice, activate, deactivate };
}
