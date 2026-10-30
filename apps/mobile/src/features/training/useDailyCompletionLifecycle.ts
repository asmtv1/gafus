/** Actual DailyCourseDayScreen Phase1 completion/pending lifecycle. No replay/network. */
import { useCallback, useEffect, useRef, useState } from "react";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import { readOwnPendingDailyTimers } from "@/shared/lib/offline/newOnlyV2DailyPending";
import type { PendingTimer } from "@/shared/lib/offline/newOnlyV2TimerPending";
import type { NewOnlyV2Queues } from "@/shared/lib/offline/newOnlyV2Queues";

type Queue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
export type DailyReadStatus = "UNVERIFIED" | "READING" | "READY" | "UNAVAILABLE";
export type DailyLifecycleDeps = { queue: Queue; owner: () => string | null };
const native: DailyLifecycleDeps = {
  queue: newOnlyV2NativeQueues,
  owner: () => useAuthStore.getState().user?.id ?? null,
};
type Snapshot = { owner: string; epoch: string; scheduleId: string; items: PendingTimer[] };
export function useDailyCompletionLifecycle(
  scheduleId: string,
  expectedOwner: string | null,
  completeMutation: (vars: {
    scheduleId: string;
    stepIndex: number;
  }) => Promise<{ success: boolean; code?: string; error?: string }>,
  onCompleted: (stepIndex: number, offline: boolean) => void,
  onFailure: (error: Error) => void,
  // Current server occurrence token is checked to prevent moving a reused Step.id
  // after data/route replacement while a storage write is in flight.
  occurrenceAt: (stepIndex: number) => string | null,
  deps: DailyLifecycleDeps = native,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [readState, setReadState] = useState<
    (Omit<Snapshot, "items"> & { status: DailyReadStatus }) | null
  >(null);
  const generation = useRef(0);
  const active = useRef(true);
  const saving = useRef(false);
  const deactivate = useCallback(() => {
    active.current = false;
    ++generation.current;
    setSnapshot(null);
    setReadState(null);
  }, []);
  const activate = useCallback(() => {
    active.current = true;
  }, []);
  useEffect(
    () => () => {
      active.current = false;
      ++generation.current;
    },
    [],
  );
  useEffect(() => {
    ++generation.current;
    setSnapshot(null);
    setReadState(null);
  }, [expectedOwner, scheduleId]);
  const attested = useCallback(
    (ticket: number, owner: string, epoch: string) => {
      const binding = deps.queue.getVerifiedBinding();
      return (
        active.current &&
        ticket === generation.current &&
        deps.owner() === owner &&
        binding?.principalId === owner &&
        binding.authEpoch === epoch
      );
    },
    [deps],
  );
  const refreshPending = useCallback(async () => {
    const ticket = ++generation.current;
    setSnapshot(null);
    setReadState(null);
    const binding = deps.queue.getVerifiedBinding();
    if (
      !expectedOwner ||
      !scheduleId ||
      !binding ||
      binding.principalId !== expectedOwner ||
      deps.owner() !== expectedOwner ||
      !active.current
    )
      return;
    const meta = { owner: expectedOwner, epoch: binding.authEpoch, scheduleId };
    setReadState({ ...meta, status: "READING" });
    try {
      const items = await readOwnPendingDailyTimers(deps.queue, expectedOwner, scheduleId);
      if (attested(ticket, expectedOwner, binding.authEpoch)) {
        setSnapshot({ ...meta, items });
        setReadState({ ...meta, status: "READY" });
      }
    } catch {
      if (attested(ticket, expectedOwner, binding.authEpoch)) {
        setSnapshot(null);
        setReadState({ ...meta, status: "UNAVAILABLE" });
      }
    }
  }, [deps, expectedOwner, scheduleId, attested]);
  const complete = useCallback(
    async (stepIndex: number) => {
      if (saving.current) return;
      const binding = deps.queue.getVerifiedBinding();
      if (
        !active.current ||
        !expectedOwner ||
        !binding ||
        binding.principalId !== expectedOwner ||
        deps.owner() !== expectedOwner
      ) {
        if (active.current) onFailure(new Error("V2_SESSION_UNVERIFIED"));
        return;
      }
      const occurrence = occurrenceAt(stepIndex);
      if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || !occurrence) {
        onFailure(new Error("DAILY_OCCURRENCE_UNVERIFIED"));
        return;
      }
      saving.current = true;
      const ticket = generation.current;
      try {
        const result = await completeMutation({ scheduleId, stepIndex });
        if (
          !attested(ticket, expectedOwner, binding.authEpoch) ||
          occurrenceAt(stepIndex) !== occurrence
        )
          return;
        if (!result.success) throw new Error(result.error ?? "DAILY_COMPLETE_FAILED");
        // The mutation itself performs exact durable eventId readback on offline writes.
        onCompleted(stepIndex, result.code === "OFFLINE_QUEUED");
        if (result.code === "OFFLINE_QUEUED") void refreshPending();
      } catch (e) {
        if (
          attested(ticket, expectedOwner, binding.authEpoch) &&
          occurrenceAt(stepIndex) === occurrence
        ) {
          // A failed read after a possible write must not look like a proven empty journal.
          setSnapshot(null);
          setReadState({
            owner: expectedOwner,
            epoch: binding.authEpoch,
            scheduleId,
            status: "UNAVAILABLE",
          });
          onFailure(e instanceof Error ? e : new Error("V2_LOCAL_RESULT_UNCONFIRMED"));
        }
      } finally {
        saving.current = false;
      }
    },
    [
      deps,
      expectedOwner,
      scheduleId,
      completeMutation,
      onCompleted,
      onFailure,
      occurrenceAt,
      attested,
      refreshPending,
    ],
  );
  const binding = deps.queue.getVerifiedBinding();
  const ownerValid =
    active.current &&
    !!expectedOwner &&
    !!binding &&
    binding.principalId === expectedOwner &&
    deps.owner() === expectedOwner;
  const matches = (s: { owner: string; epoch: string; scheduleId: string } | null) =>
    ownerValid &&
    s?.owner === expectedOwner &&
    s.epoch === binding.authEpoch &&
    s.scheduleId === scheduleId;
  return {
    complete,
    refreshPending,
    activate,
    deactivate,
    pendingDaily: matches(snapshot) ? snapshot!.items : [],
    readStatus: !ownerValid
      ? "UNVERIFIED"
      : matches(readState)
        ? readState!.status
        : ("READING" as DailyReadStatus),
  };
}
