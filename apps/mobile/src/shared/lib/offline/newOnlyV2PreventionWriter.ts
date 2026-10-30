/**
 * Phase1 NEW-only prevention writer: durable local persistence, NO HTTP/replay/ACK.
 * Never writes, migrates or reads ownerless historical prevention-sync-storage.
 */
import type { CreatePreventionEntryData } from "@/shared/lib/api/pets";
import type { NewOnlyV2Queues, V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";
import { NewOnlyV2Error } from "./newOnlyV2Queues";
import { preparePreventionJournalContract } from "./newOnlyV2PreventionContract";

type LocalWriter = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "enqueue">;

/** Calendar-only input must not silently normalize nonexistent days. */
function strictCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
  }
  return date.toISOString();
}

/**
 * Generate per-item IDs independently. Validate the *exact* AG1 prevention.batch
 * DTO before writing an immutable new parent event into owner+epoch scoped storage.
 * A failed validation or disk write MUST be propagated to the caller.
 */
export async function enqueueNewOnlyPrevention(
  storage: LocalWriter,
  petId: string,
  data: CreatePreventionEntryData,
  makeId: () => string,
): Promise<V2PendingEvent & { ownerId: string; authEpoch: string }> {
  const current: V2SessionBinding | null = storage.getVerifiedBinding();
  if (!current) throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
  const performedAt = strictCalendarDate(data.performedAt);
  const reminderOnDate = data.reminderOnDate ? strictCalendarDate(data.reminderOnDate) : undefined;

  const item = {
    eventId: makeId(),
    clientId: makeId(),
    type: data.type,
    performedAt,
    productName: data.productName,
    notes: data.notes,
    reminderEnabled: data.reminderEnabled,
    reminderKind: data.reminderKind,
    reminderDaysAfter: data.reminderDaysAfter,
    reminderOnDate,
    reminderTimes: data.reminderTimes,
  };
  // V2 persistence rejects undefined; omit absent optional API fields before enqueue.
  const definedItem = Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined),
  );
  const payload = { petId, entries: [definedItem] };
  const draft: V2PendingEvent = {
    eventId: makeId(),
    kind: "prevention.upsert",
    createdAt: Date.now(),
    payload,
  };
  // This is a pure shape/fingerprint check. It does not make a network request.
  preparePreventionJournalContract({ binding: current, event: draft }, current);
  return storage.enqueue("prevention", "prevention.upsert", payload);
}
