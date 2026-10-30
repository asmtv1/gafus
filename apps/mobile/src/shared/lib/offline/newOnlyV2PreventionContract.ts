/**
 * OFF021 prevention.batch journal: pure Phase1 compatibility probe.
 * Does not send HTTP requests, read storage, replay, ACK or dequeue events.
 * Server JWT/SQL owner and fingerprint validity cannot be established by this parser.
 */
import type { V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";

const PATH = "/api/v1/offline/mutations" as const;
const OPERATION = "prevention.batch" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;
const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const INPUT_KEYS = new Set([
  "eventId",
  "clientId",
  "type",
  "performedAt",
  "productName",
  "notes",
  "reminderEnabled",
  "reminderKind",
  "reminderDaysAfter",
  "reminderOnDate",
  "reminderTimes",
]);
const ALLOWED_TYPES = new Set(["VACCINATION", "DEWORMING", "TICKS_FLEAS"]);
const ALLOWED_REMINDERS = new Set(["AFTER_DAYS", "ON_DATE"]);

export type PreventionSnapshot = {
  binding: V2SessionBinding;
  event: V2PendingEvent;
};
type PreventionItem = Readonly<{
  eventId: string;
  clientId: string;
  type: "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";
  performedAt: string;
  productName?: string;
  notes?: string;
  reminderEnabled?: boolean;
  reminderKind?: "AFTER_DAYS" | "ON_DATE";
  reminderDaysAfter?: number | null;
  reminderOnDate?: string | null;
  reminderTimes?: readonly string[];
}>;
type PreventionBody = Readonly<{
  eventId: string;
  operation: typeof OPERATION;
  petId: string;
  entries: readonly PreventionItem[];
}>;
export type PreventionContractPreview = Readonly<{
  post: Readonly<{
    method: "POST";
    path: typeof PATH;
    headers: Readonly<{ "X-Gafus-Sync-Protocol": "2"; "Idempotency-Key": string }>;
    body: PreventionBody;
  }>;
  lookup: Readonly<{
    method: "GET";
    path: string;
    headers: Readonly<{ "X-Gafus-Sync-Protocol": "2" }>;
  }>;
  /** Matches AG1 normalized scalar JSON stringify input, NOT authenticated SQL proof. */
  canonicalFingerprintInput: string;
  /** Each exact input to AG1 immutable (petId, clientId) SHA256 binding. */
  canonicalItemFingerprintInputs: readonly string[];
}>;
export type PreventionContractDecision =
  | Readonly<{ status: "confirmed"; eventId: string; replayed: boolean }>
  | Readonly<{ status: "pending" }>;

type Captured = Readonly<{
  principalId: string;
  authEpoch: string;
  eventId: string;
  fingerprint: string;
  items: readonly string[];
}>;
const captured = new WeakMap<PreventionContractPreview, Captured>();
const pending: PreventionContractDecision = Object.freeze({ status: "pending" });

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validBinding(value: V2SessionBinding | null): value is V2SessionBinding {
  return (
    !!value &&
    value.schemaVersion === 2 &&
    typeof value.principalId === "string" &&
    OWNER.test(value.principalId) &&
    typeof value.authEpoch === "string" &&
    UUID.test(value.authEpoch)
  );
}
function requireValue(ok: boolean): void {
  if (!ok) throw new Error("V2_PREVENTION_CONTRACT_INVALID");
}
function canonicalIso(value: unknown): string {
  requireValue(typeof value === "string" && value.length > 0);
  const date = new Date(value as string);
  requireValue(Number.isFinite(date.getTime()));
  return date.toISOString();
}
function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  requireValue(typeof value === "string" && value.length <= max);
  return value as string;
}
function getItem(value: unknown): PreventionItem {
  requireValue(object(value));
  const v = value as Record<string, unknown>;
  requireValue(Object.keys(v).every((k) => INPUT_KEYS.has(k)));
  requireValue(typeof v.eventId === "string" && UUID.test(v.eventId));
  requireValue(typeof v.clientId === "string" && UUID.test(v.clientId));
  requireValue(typeof v.type === "string" && ALLOWED_TYPES.has(v.type));
  const performedAt = canonicalIso(v.performedAt);
  const productName = optionalString(v.productName, 200);
  const notes = optionalString(v.notes, 2000);
  if (v.reminderEnabled !== undefined) requireValue(typeof v.reminderEnabled === "boolean");
  if (v.reminderKind !== undefined)
    requireValue(typeof v.reminderKind === "string" && ALLOWED_REMINDERS.has(v.reminderKind));
  if (v.reminderDaysAfter !== undefined && v.reminderDaysAfter !== null) {
    requireValue(
      Number.isInteger(v.reminderDaysAfter) &&
        Number(v.reminderDaysAfter) >= 1 &&
        Number(v.reminderDaysAfter) <= 1095,
    );
  }
  const reminderOnDate =
    v.reminderOnDate == null ? v.reminderOnDate : canonicalIso(v.reminderOnDate);
  if (v.reminderTimes !== undefined) {
    requireValue(
      Array.isArray(v.reminderTimes) && v.reminderTimes.length >= 1 && v.reminderTimes.length <= 5,
    );
    requireValue(
      (v.reminderTimes as unknown[]).every((time) => typeof time === "string" && CLOCK.test(time)),
    );
  }
  // Do not generate a missing clientId or item eventId; these MUST survive restart.
  const result: Record<string, unknown> = {
    eventId: v.eventId,
    clientId: v.clientId,
    type: v.type,
    performedAt,
  };
  if (productName !== undefined) result.productName = productName;
  if (notes !== undefined) result.notes = notes;
  if (v.reminderEnabled !== undefined) result.reminderEnabled = v.reminderEnabled;
  if (v.reminderKind !== undefined) result.reminderKind = v.reminderKind;
  if (v.reminderDaysAfter !== undefined) result.reminderDaysAfter = v.reminderDaysAfter;
  if (reminderOnDate !== undefined) result.reminderOnDate = reminderOnDate;
  if (v.reminderTimes !== undefined)
    result.reminderTimes = Object.freeze([...(v.reminderTimes as string[])]);
  return Object.freeze(result) as PreventionItem;
}
function getBody(event: V2PendingEvent): PreventionBody {
  requireValue(
    event.kind === "prevention.upsert" && UUID.test(event.eventId) && object(event.payload),
  );
  const p = event.payload;
  requireValue(
    Object.keys(p).length === 2 && Object.keys(p).every((k) => k === "petId" || k === "entries"),
  );
  requireValue(
    typeof p.petId === "string" &&
      p.petId.trim() === p.petId &&
      p.petId.length >= 1 &&
      p.petId.length <= 128,
  );
  requireValue(Array.isArray(p.entries) && p.entries.length >= 1 && p.entries.length <= 50);
  const items = (p.entries as unknown[]).map(getItem);
  const seenEvent = new Set<string>(),
    seenClient = new Set<string>();
  for (const item of items) {
    requireValue(!seenEvent.has(item.eventId) && !seenClient.has(item.clientId));
    seenEvent.add(item.eventId);
    seenClient.add(item.clientId);
  }
  return Object.freeze({
    eventId: event.eventId,
    operation: OPERATION,
    petId: p.petId as string,
    entries: Object.freeze(items),
  });
}
/** AG1 canonicalPreventionItem() normalization, preserving key order exactly. */
function canonicalNormalizedItem(item: PreventionItem): Record<string, unknown> {
  return {
    eventId: item.eventId,
    clientId: item.clientId,
    type: item.type,
    performedAt: item.performedAt,
    productName: item.productName ?? null,
    notes: item.notes ?? null,
    reminderEnabled: item.reminderEnabled ?? true,
    reminderKind: item.reminderKind ?? "AFTER_DAYS",
    reminderDaysAfter: item.reminderDaysAfter ?? null,
    reminderOnDate: item.reminderOnDate ?? null,
    reminderTimes: item.reminderTimes ?? ["09:00"],
  };
}
function fingerprint(body: PreventionBody): { parent: string; items: string[] } {
  const normalized = body.entries.map(canonicalNormalizedItem);
  return {
    parent: JSON.stringify({
      method: "POST",
      operation: OPERATION,
      petId: body.petId,
      entries: normalized,
    }),
    items: normalized.map((i) => JSON.stringify(i)),
  };
}

/** Build descriptors only; never network I/O, native persistence or replay. */
export function preparePreventionJournalContract(
  snapshot: PreventionSnapshot,
  activeBinding: V2SessionBinding | null,
): PreventionContractPreview {
  requireValue(validBinding(activeBinding) && validBinding(snapshot.binding));
  requireValue(
    activeBinding!.principalId === snapshot.binding.principalId &&
      activeBinding!.authEpoch === snapshot.binding.authEpoch,
  );
  const body = getBody(snapshot.event);
  const hash = fingerprint(body);
  const preview: PreventionContractPreview = Object.freeze({
    post: Object.freeze({
      method: "POST",
      path: PATH,
      headers: Object.freeze({ "X-Gafus-Sync-Protocol": "2", "Idempotency-Key": body.eventId }),
      body,
    }),
    lookup: Object.freeze({
      method: "GET",
      path: PATH + "/" + body.eventId,
      headers: Object.freeze({ "X-Gafus-Sync-Protocol": "2" }),
    }),
    canonicalFingerprintInput: hash.parent,
    canonicalItemFingerprintInputs: Object.freeze(hash.items),
  });
  captured.set(
    preview,
    Object.freeze({
      principalId: activeBinding!.principalId,
      authEpoch: activeBinding!.authEpoch,
      eventId: body.eventId,
      fingerprint: hash.parent,
      items: body.entries.map((i) => i.eventId + ":" + i.clientId),
    }),
  );
  return preview;
}

/** Mock response classifier; confirmed is NOT permission to remove a queued item. */
export function evaluatePreventionJournalContract(
  preview: PreventionContractPreview,
  activeBinding: V2SessionBinding | null,
  currentEvent: V2PendingEvent | null,
  kind: "post" | "lookup",
  status: number | null,
  response: unknown,
): PreventionContractDecision {
  const context = captured.get(preview);
  if (
    !context ||
    !validBinding(activeBinding) ||
    activeBinding.principalId !== context.principalId ||
    activeBinding.authEpoch !== context.authEpoch ||
    !currentEvent ||
    status !== 200 ||
    !object(response) ||
    response.success !== true ||
    !object(response.ack)
  )
    return pending;
  let current: PreventionBody;
  try {
    current = getBody(currentEvent);
    // Private untrusted legacy payload validation errors are not telemetry inputs.
    // eslint-disable-next-line @gafus/require-client-catch-tracer
  } catch {
    return pending;
  }
  if (current.eventId !== context.eventId || fingerprint(current).parent !== context.fingerprint)
    return pending;
  const ack = response.ack;
  if (
    ack.protocol !== 2 ||
    ack.operation !== OPERATION ||
    ack.state !== "COMMITTED" ||
    ack.eventId !== context.eventId ||
    typeof ack.replayed !== "boolean" ||
    (kind === "lookup" && ack.replayed !== true) ||
    typeof ack.serverRevision !== "string" ||
    !/^[1-9][0-9]*$/.test(ack.serverRevision) ||
    !Array.isArray(ack.items) ||
    ack.items.length !== context.items.length
  )
    return pending;
  const seen = new Set<string>();
  for (let i = 0; i < ack.items.length; i++) {
    const item: unknown = ack.items[i];
    if (
      !object(item) ||
      item.eventId !== current.entries[i]?.eventId ||
      item.clientId !== current.entries[i]?.clientId ||
      item.state !== "COMMITTED" ||
      item.result !== "CREATED" ||
      typeof item.serverRowId !== "string" ||
      item.serverRowId.length === 0 ||
      seen.has(item.eventId + ":" + item.clientId) ||
      item.eventId + ":" + item.clientId !== context.items[i]
    )
      return pending;
    seen.add(item.eventId + ":" + item.clientId);
  }
  return { status: "confirmed", eventId: context.eventId, replayed: ack.replayed };
}
