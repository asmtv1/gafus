/**
 * OFF021 NEW-only V2 training practice completion journal, AG4-approved local
 * source slice.  No DDL, old route changes, historical replay, or new rewards.
 * Until AG4 approves+applies isolated additive schema, POST/GET fail closed 503.
 *
 * Atomic boundary: reservation + existing Core step mutation + course sync +
 * monotonic revision + persisted response are ONE actual Prisma transaction.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  withOfflineMutationTx,
  claimPracticeReceipt,
  findPracticeReceipt,
  incrementPracticeRevision,
  commitPracticeReceipt,
  lookupOfflineMutationReceipt,
  lockOwnedPreventionPet,
  claimPreventionReceipt,
  findPreventionReceipt,
  findPreventionBoundClient,
  readPreventionClientRow,
  persistPreventionClientBinding,
  incrementPreventionRevision,
  commitPreventionReceipt,
} from "./offlineMutationRowsPort";
import { batchRequestSchema, type BatchEntryInput } from "../petPrevention/schemas";

export type JournalOperation = "training.complete.practice";
export type NewOfflinePracticeMutation = {
  ownerId: string;
  eventId: string;
  operation: "training.complete.practice";
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
};
export type JournalAck = {
  protocol: 2;
  eventId: string;
  state: "COMMITTED";
  replayed: boolean;
  operation: JournalOperation;
  serverRevision: string;
  result: { courseId: string; allCompleted: boolean; stepJustCompleted: boolean };
};
export type JournalResponse = { success: true; ack: JournalAck };

export class OfflineMutationJournalError extends Error {
  constructor(
    public readonly code:
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "JOURNAL_UNAVAILABLE"
      | "PET_NOT_FOUND"
      | "INVALID_BATCH_INPUT",
  ) {
    super(code);
    this.name = "OfflineMutationJournalError";
  }
}

type Receipt = {
  method: string;
  operation: string;
  resourceKey: string;
  payloadHash: string;
  state: string;
  responseBody: JournalResponse | PreventionJournalResponse | null;
};
const operationResource = (input: NewOfflinePracticeMutation) =>
  `training:${input.dayOnCourseId}:step:${input.stepIndex}`;
// No raw user-controlled JSON hash: canonical scalar validated fields only.
const mutationHash = (input: NewOfflinePracticeMutation) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        method: "POST",
        operation: input.operation,
        courseId: input.courseId,
        dayOnCourseId: input.dayOnCourseId,
        stepIndex: input.stepIndex,
      }),
    )
    .digest("hex");

function isTableAbsent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const p = error as { code?: string; meta?: { code?: string } };
  return p.code === "P2021" || (p.code === "P2010" && p.meta?.code === "42P01");
}
function isRetryableSql(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const p = error as { code?: string; meta?: { code?: string } };
  return (
    p.code === "P2034" || p.code === "P2028" || p.meta?.code === "40P01" || p.meta?.code === "40001"
  );
}
function parseCommittedReceipt(row: Receipt, input: NewOfflinePracticeMutation): JournalResponse {
  if (
    row.method !== "POST" ||
    row.operation !== input.operation ||
    row.resourceKey !== operationResource(input) ||
    row.payloadHash !== mutationHash(input)
  ) {
    throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
  }
  if (
    row.state !== "COMMITTED" ||
    !row.responseBody?.ack ||
    row.responseBody.ack.eventId !== input.eventId ||
    row.responseBody.ack.state !== "COMMITTED"
  ) {
    throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
  }
  return { success: true, ack: { ...(row.responseBody.ack as JournalAck), replayed: true } };
}

export async function submitNewOfflinePracticeMutation(
  input: NewOfflinePracticeMutation,
): Promise<JournalResponse> {
  const fingerprint = mutationHash(input);
  const resource = operationResource(input);
  try {
    return await withOfflineMutationTx(async (tx) => {
      // ON CONFLICT waits for a competing open transaction: no externally visible
      // RESERVED rows. Second SELECT gets a fresh READ COMMITTED snapshot.
      const claim = await claimPracticeReceipt(
        tx,
        input.ownerId,
        input.eventId,
        input.operation,
        resource,
        fingerprint,
      );
      if (claim.length === 0) {
        const existing = await findPracticeReceipt<Receipt>(tx, input.ownerId, input.eventId);
        if (!existing[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        return parseCommittedReceipt(existing[0], input);
      }

      // Defer trainingService evaluation until after the offline/core import graph
      // is initialized. The static dependency participates in Core's existing
      // offline->course->training ESM cycle under real runtime, not only Vitest.
      // Both funcs still execute inside THIS tx; no nested SQL transaction.
      const { applyStepAndDayTx, syncUserCourseStatusFromDaysTx } = await import(
        "../training/trainingService"
      );
      const progress = await applyStepAndDayTx(
        tx,
        input.ownerId,
        input.dayOnCourseId,
        input.stepIndex,
        { type: "complete" },
      );
      if (progress.courseId !== input.courseId) throw new Error("COURSE_DAY_MISMATCH");
      // Unlike old theory 500 / practice swallowed post-commit sync, v2 keeps
      // this consistent within the same PG transaction; any failure rolls back.
      await syncUserCourseStatusFromDaysTx(tx, input.ownerId, progress.courseId);

      const revision = await incrementPracticeRevision(tx, input.ownerId, resource);
      if (!revision[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const ack: JournalResponse = {
        success: true,
        ack: {
          protocol: 2,
          eventId: input.eventId,
          state: "COMMITTED",
          replayed: false,
          operation: input.operation,
          serverRevision: String(revision[0].revision),
          result: progress,
        },
      };
      const committed = await commitPracticeReceipt(
        tx,
        revision[0].revision,
        ack,
        claim[0].id,
        input.ownerId,
      );
      if (committed !== 1) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return ack;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error)) {
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    }
    throw error;
  }
}

export async function findNewOfflineMutationReceipt(
  ownerId: string,
  eventId: string,
): Promise<JournalResponse | PreventionJournalResponse | null> {
  try {
    const rows = await lookupOfflineMutationReceipt<Pick<Receipt, "state" | "responseBody">>(
      ownerId,
      eventId,
    );
    const row = rows[0];
    if (!row) return null;
    if (
      row.state !== "COMMITTED" ||
      !row.responseBody?.ack ||
      row.responseBody.ack.eventId !== eventId
    )
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    if (row.responseBody.ack.operation === "prevention.batch") {
      return {
        success: true,
        ack: { ...row.responseBody.ack, replayed: true },
      } as PreventionJournalResponse;
    }
    return { success: true, ack: { ...row.responseBody.ack, replayed: true } } as JournalResponse;
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    if (isTableAbsent(error) || isRetryableSql(error))
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}

/** AG4 method-scope receipt ebcfd43: NEW-only v2 prevention batch. */
export type NewOfflinePreventionItem = {
  eventId: string; // UUIDv4 per-item, NOT historical/native queue identifier
  clientId: string; // UUIDv4 immutable (petId,clientId) key
  type: "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";
  performedAt: string;
  productName?: string;
  notes?: string;
  reminderEnabled?: boolean;
  reminderKind?: "AFTER_DAYS" | "ON_DATE";
  reminderDaysAfter?: number | null;
  reminderOnDate?: string | null;
  reminderTimes?: string[];
};
export type NewOfflinePreventionBatch = {
  ownerId: string;
  eventId: string; // parent receipt UUIDv4
  operation: "prevention.batch";
  petId: string;
  entries: NewOfflinePreventionItem[];
};
export type PreventionItemAck = {
  eventId: string;
  clientId: string;
  state: "COMMITTED";
  result: "CREATED";
  serverRowId: string;
};
export type PreventionJournalResponse = {
  success: true;
  ack: {
    protocol: 2;
    eventId: string;
    operation: "prevention.batch";
    state: "COMMITTED";
    replayed: boolean;
    serverRevision: string;
    items: PreventionItemAck[];
  };
};

const OFF021_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function canonicalPreventionItem(entry: BatchEntryInput): Record<string, unknown> {
  return {
    clientId: entry.clientId,
    type: entry.type,
    performedAt: entry.performedAt.toISOString(),
    productName: entry.productName ?? null,
    notes: entry.notes ?? null,
    reminderEnabled: entry.reminderEnabled ?? true,
    reminderKind: entry.reminderKind ?? "AFTER_DAYS",
    reminderDaysAfter: entry.reminderDaysAfter ?? null,
    reminderOnDate: entry.reminderOnDate?.toISOString() ?? null,
    reminderTimes: entry.reminderTimes ?? ["09:00"],
  };
}
function preventionHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Exactly one SQL transaction binds all new PetPreventionEntry rows,
 * immutable per-clientId bindings, resource revision and stored per-item ACK.
 * A new batch with ANY preexisting bound/unbound clientId is a 409 with NO ACK.
 * No legacy upsert, no nested $transaction, no history adoption or replay.
 */
export async function submitNewOfflinePreventionBatch(
  input: NewOfflinePreventionBatch,
): Promise<PreventionJournalResponse> {
  const seenClient = new Set<string>();
  const seenItemEvent = new Set<string>();
  if (
    !OFF021_UUID_V4.test(input.eventId) ||
    input.operation !== "prevention.batch" ||
    !input.petId ||
    input.petId.length > 128 ||
    input.entries.length < 1 ||
    input.entries.length > 50
  ) {
    throw new OfflineMutationJournalError("INVALID_BATCH_INPUT");
  }
  for (const item of input.entries) {
    if (
      !OFF021_UUID_V4.test(item.eventId) ||
      !OFF021_UUID_V4.test(item.clientId) ||
      seenClient.has(item.clientId) ||
      seenItemEvent.has(item.eventId)
    ) {
      throw new OfflineMutationJournalError("INVALID_BATCH_INPUT");
    }
    seenClient.add(item.clientId);
    seenItemEvent.add(item.eventId);
  }
  // Reuse existing validation and reminder-normalization, not historical writes.
  const entries = batchRequestSchema.parse({
    entries: input.entries.map((i) => ({
      ...i,
      performedAt: new Date(i.performedAt),
      reminderOnDate: i.reminderOnDate == null ? i.reminderOnDate : new Date(i.reminderOnDate),
    })),
  }).entries;
  const normalized = input.entries.map((i, n) => ({
    eventId: i.eventId,
    ...canonicalPreventionItem(entries[n]!),
  }));
  const fingerprint = preventionHash({
    method: "POST",
    operation: input.operation,
    petId: input.petId,
    entries: normalized,
  });
  const resource = "prevention:" + input.petId;
  try {
    return await withOfflineMutationTx(async (tx) => {
      // Every request, including duplicate ACK lookup, needs current pet ownership.
      // Row lock serializes independent eventIds on the same pet.
      const owned = await lockOwnedPreventionPet(tx, input.petId, input.ownerId);
      if (owned.length !== 1) throw new OfflineMutationJournalError("PET_NOT_FOUND");

      // Unique claim is uncommitted until ALL business rows and ACK commit.
      const receiptId = randomUUID();
      const claim = await claimPreventionReceipt(
        tx,
        receiptId,
        input.ownerId,
        input.eventId,
        resource,
        fingerprint,
      );
      if (!claim.length) {
        const rows = await findPreventionReceipt<Receipt>(tx, input.ownerId, input.eventId);
        const row = rows[0];
        if (!row) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        if (
          row.method !== "POST" ||
          row.operation !== "prevention.batch" ||
          row.resourceKey !== resource ||
          row.payloadHash !== fingerprint
        ) {
          throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        }
        const stored = row.responseBody as PreventionJournalResponse | null;
        if (
          row.state !== "COMMITTED" ||
          stored?.ack.operation !== "prevention.batch" ||
          stored.ack.eventId !== input.eventId ||
          stored.ack.state !== "COMMITTED" ||
          stored.ack.items.length !== entries.length
        ) {
          throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
        }
        return {
          success: true,
          ack: { ...stored.ack, replayed: true },
        } as PreventionJournalResponse;
      }

      const { createNewPreventionEntryTx } = await import("../petPrevention/petPreventionService");
      const itemAcks: PreventionItemAck[] = [];
      for (let index = 0; index < entries.length; index++) {
        const item = input.entries[index]!;
        const normalizedItem = normalized[index];
        // New v2 never accepts a legacy/unbound clientId or updates it.
        const bound = await findPreventionBoundClient(tx, input.petId, item.clientId);
        if (bound.length) throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const oldRow = await readPreventionClientRow(tx, input.petId, item.clientId);
        if (oldRow) throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
        const created = await createNewPreventionEntryTx(
          tx,
          input.ownerId,
          input.petId,
          entries[index]!,
        );
        await persistPreventionClientBinding(
          tx,
          input.ownerId,
          input.petId,
          item.clientId,
          preventionHash(normalizedItem),
          receiptId,
        );
        itemAcks.push({
          eventId: item.eventId,
          clientId: item.clientId,
          state: "COMMITTED",
          result: "CREATED",
          serverRowId: created.id,
        });
      }
      const rev = await incrementPreventionRevision(tx, input.ownerId, resource);
      if (!rev[0]) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      const ack: PreventionJournalResponse = {
        success: true,
        ack: {
          protocol: 2,
          eventId: input.eventId,
          operation: "prevention.batch",
          state: "COMMITTED",
          replayed: false,
          serverRevision: String(rev[0].revision),
          items: itemAcks,
        },
      };
      const committed = await commitPreventionReceipt(
        tx,
        rev[0].revision,
        ack,
        receiptId,
        input.ownerId,
      );
      if (committed !== 1) throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
      return ack;
    });
  } catch (error) {
    if (error instanceof OfflineMutationJournalError) throw error;
    const e = error as { code?: string };
    if (e?.code === "P2002") throw new OfflineMutationJournalError("IDEMPOTENCY_KEY_CONFLICT");
    if (isRetryableSql(error) || isTableAbsent(error))
      throw new OfflineMutationJournalError("JOURNAL_UNAVAILABLE");
    throw error;
  }
}
