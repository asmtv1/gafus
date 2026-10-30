/** OFF021 Phase1 — screen-lifetime durable local prevention, never network/replay/ACK. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreatePreventionEntryData } from "@/shared/lib/api/pets";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { enqueueNewOnlyPreventionNative } from "@/shared/lib/offline/newOnlyV2PreventionWriterNative";
import {
  readOwnPendingPrevention,
  type PendingPreventionPreview,
} from "@/shared/lib/offline/newOnlyV2PreventionPending";
import type { NewOnlyV2Queues, V2PendingEvent } from "@/shared/lib/offline/newOnlyV2Queues";

type SessionQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
type SavedEvent = V2PendingEvent & { ownerId: string; authEpoch: string };
export type PreventionPendingReadStatus =
  | "IDLE"
  | "READING"
  | "READY"
  | "UNAVAILABLE"
  | "UNVERIFIED";
export interface PreventionOfflineDependencies {
  queue: SessionQueue;
  enqueue: (petId: string, data: CreatePreventionEntryData) => Promise<SavedEvent>;
  currentOwner: () => string | null;
}
const native: PreventionOfflineDependencies = {
  queue: newOnlyV2NativeQueues,
  enqueue: enqueueNewOnlyPreventionNative,
  currentOwner: () => useAuthStore.getState().user?.id ?? null,
};

type SaveCallbacks = {
  onSaved: () => void;
  onFailed: (error: Error) => void;
};

export function usePreventionOfflineSave(
  petId: string,
  principalId: string | null,
  deps: PreventionOfflineDependencies = native,
) {
  const [pendingState, setPendingState] = useState<{
    owner: string;
    epoch: string;
    petId: string;
    rows: PendingPreventionPreview[];
  } | null>(null);
  const [readState, setReadState] = useState<{
    owner: string;
    epoch: string;
    petId: string;
    status: PreventionPendingReadStatus;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const generation = useRef(0);
  const active = useRef(true);
  const inFlight = useRef(false);

  const invalidate = useCallback(() => {
    ++generation.current;
    setPendingState(null);
    setReadState(null);
  }, []);
  const activate = useCallback(() => {
    active.current = true;
  }, []);
  const deactivate = useCallback(() => {
    active.current = false;
    ++generation.current;
    setPendingState(null);
    setReadState(null);
    setIsSaving(false);
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      ++generation.current;
    };
  }, []);
  useEffect(() => {
    ++generation.current;
    setPendingState(null);
    setReadState(null);
    setIsSaving(false);
  }, [petId, principalId]);

  const isCurrent = useCallback(
    (ticket: number, owner: string, epoch: string) => {
      const binding = deps.queue.getVerifiedBinding();
      return (
        active.current &&
        ticket === generation.current &&
        deps.currentOwner() === owner &&
        binding?.principalId === owner &&
        binding.authEpoch === epoch
      );
    },
    [deps],
  );

  const refreshPending = useCallback(async () => {
    const ticket = ++generation.current;
    setPendingState(null);
    setReadState(null);
    const binding = deps.queue.getVerifiedBinding();
    if (
      !active.current ||
      !principalId ||
      !binding ||
      binding.principalId !== principalId ||
      deps.currentOwner() !== principalId
    )
      return;
    setReadState({ owner: principalId, epoch: binding.authEpoch, petId, status: "READING" });
    try {
      const rows = await readOwnPendingPrevention(deps.queue, petId, principalId);
      if (isCurrent(ticket, principalId, binding.authEpoch)) {
        setPendingState({ owner: principalId, epoch: binding.authEpoch, petId, rows });
        setReadState({ owner: principalId, epoch: binding.authEpoch, petId, status: "READY" });
      }
    } catch {
      // Never render unknown-owner or unreadable pending bytes.
      if (isCurrent(ticket, principalId, binding.authEpoch)) {
        setPendingState(null);
        setReadState({
          owner: principalId,
          epoch: binding.authEpoch,
          petId,
          status: "UNAVAILABLE",
        });
      }
    }
  }, [deps, isCurrent, petId, principalId]);

  const save = useCallback(
    async (data: CreatePreventionEntryData, callbacks: SaveCallbacks) => {
      if (inFlight.current) return;
      const binding = deps.queue.getVerifiedBinding();
      if (
        !active.current ||
        !principalId ||
        !binding ||
        binding.principalId !== principalId ||
        deps.currentOwner() !== principalId
      ) {
        if (active.current) callbacks.onFailed(new Error("V2_SESSION_UNVERIFIED"));
        return;
      }
      const epoch = binding.authEpoch;
      const ticket = ++generation.current;
      inFlight.current = true;
      setIsSaving(true);
      try {
        const receipt = await deps.enqueue(petId, data);
        if (!isCurrent(ticket, principalId, epoch)) return;
        if (receipt.ownerId !== principalId || receipt.authEpoch !== epoch)
          throw new Error("V2_SESSION_CHANGED");
        // A successful write is not sufficient to show a local preview: attest the
        // exact durable receipt through the same owner-scoped reader used on restart.
        const rows = await readOwnPendingPrevention(deps.queue, petId, principalId);
        if (!isCurrent(ticket, principalId, epoch)) return;
        if (!rows.some((entry) => entry.eventId === receipt.eventId))
          throw new Error("V2_LOCAL_RECEIPT_UNCONFIRMED");
        setPendingState({ owner: principalId, epoch, petId, rows });
        setReadState({ owner: principalId, epoch, petId, status: "READY" });
        callbacks.onSaved();
      } catch (error) {
        if (isCurrent(ticket, principalId, epoch)) {
          callbacks.onFailed(
            error instanceof Error ? error : new Error("V2_LOCAL_RESULT_UNCONFIRMED"),
          );
        }
      } finally {
        inFlight.current = false;
        if (active.current) setIsSaving(false);
      }
    },
    [deps, isCurrent, petId, principalId],
  );

  const current = deps.queue.getVerifiedBinding();
  const localPending =
    pendingState &&
    current &&
    pendingState.owner === principalId &&
    pendingState.petId === petId &&
    current.principalId === principalId &&
    current.authEpoch === pendingState.epoch &&
    deps.currentOwner() === principalId
      ? pendingState.rows
      : [];
  const validOwner =
    active.current &&
    !!principalId &&
    !!current &&
    current.principalId === principalId &&
    deps.currentOwner() === principalId;
  const pendingReadStatus: PreventionPendingReadStatus = !validOwner
    ? "UNVERIFIED"
    : readState &&
        readState.owner === principalId &&
        readState.epoch === current.authEpoch &&
        readState.petId === petId
      ? readState.status
      : "IDLE";
  return {
    localPending,
    pendingReadStatus,
    isSaving,
    refreshPending,
    save,
    activate,
    deactivate,
    invalidate,
  };
}
