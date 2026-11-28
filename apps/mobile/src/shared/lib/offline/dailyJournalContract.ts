import { readJournalVersionFields, type JournalVersionFields } from "./journalVersionFields";
import type { V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CUID = /^c[a-z0-9]{8,}$/;
const PATH = "/api/v1/offline/mutations" as const;
type DailyBody = Readonly<JournalVersionFields & {
  eventId: string; operation: "daily.complete"; scheduleId: string; stepIndex: number;
  expectedBundleStepId: string; expectedStepId: string;
}>;
export type DailyJournalPreview = Readonly<{
  post: Readonly<{
    path: typeof PATH; method: "POST";
    headers: Readonly<{ "X-Gafus-Sync-Protocol": "2"; "Idempotency-Key": string }>;
    body: DailyBody;
  }>;
}>;
const snapshots = new WeakMap<DailyJournalPreview, { binding: V2SessionBinding; canonical: string }>();

function bodyFor(event: V2PendingEvent): DailyBody {
  const p = event.payload;
  if (event.kind !== "dailyCourseCompleteStep" || !UUID.test(event.eventId) ||
      Object.keys(p).some(key => !["scheduleId","stepIndex","expectedBundleStepId","expectedStepId","expectedVersion","previousEventId"].includes(key)) ||
      typeof p.scheduleId !== "string" || !CUID.test(p.scheduleId) ||
      !Number.isSafeInteger(p.stepIndex) || Number(p.stepIndex) < 0 ||
      typeof p.expectedBundleStepId !== "string" || !CUID.test(p.expectedBundleStepId) ||
      typeof p.expectedStepId !== "string" || !CUID.test(p.expectedStepId))
    throw new Error("V2_DAILY_CONTRACT_INVALID");
  return Object.freeze({
    eventId: event.eventId, operation: "daily.complete", scheduleId: p.scheduleId,
    stepIndex: Number(p.stepIndex), expectedBundleStepId: p.expectedBundleStepId,
    expectedStepId: p.expectedStepId,
    ...readJournalVersionFields(p),
  });
}
function sameBinding(a: V2SessionBinding, b: V2SessionBinding) {
  return a.schemaVersion === 2 && b.schemaVersion === 2 &&
    a.principalId === b.principalId && a.authEpoch === b.authEpoch;
}
export function prepareDailyJournalRequest(binding: V2SessionBinding, event: V2PendingEvent): DailyJournalPreview {
  if (!binding.principalId || !UUID.test(binding.authEpoch)) throw new Error("V2_SESSION_UNVERIFIED");
  const body = bodyFor(event);
  const preview: DailyJournalPreview = Object.freeze({ post: Object.freeze({
    path: PATH, method: "POST",
    headers: Object.freeze({ "X-Gafus-Sync-Protocol": "2", "Idempotency-Key": body.eventId }),
    body,
  }) });
  snapshots.set(preview, { binding: { ...binding }, canonical: JSON.stringify(body) });
  return preview;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function verifyDailyJournalAck(preview: DailyJournalPreview, binding: V2SessionBinding,
  event: V2PendingEvent, response: unknown): boolean {
  const saved = snapshots.get(preview);
  if (!saved || !sameBinding(binding, saved.binding) || !record(response) ||
      response.success !== true || !record(response.ack)) return false;
  let body: DailyBody;
  try { body = bodyFor(event); } catch { return false; }
  const ack = response.ack;
  return JSON.stringify(body) === saved.canonical &&
    ack.protocol === 2 && ack.eventId === body.eventId && ack.operation === body.operation &&
    ack.state === "COMMITTED" && typeof ack.replayed === "boolean" &&
    typeof ack.serverRevision === "string" && /^[1-9][0-9]*$/.test(ack.serverRevision) &&
    record(ack.result) && ack.result.scheduleId === body.scheduleId &&
    typeof ack.result.allCompleted === "boolean" && typeof ack.result.stepJustCompleted === "boolean";
}
