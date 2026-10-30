/**
 * OFF021 practice-only journal COMPATIBILITY PROBE — Phase1, PURE, NO NETWORK.
 * This is NOT an executable replay adapter or authority to dequeue an event.
 * Server-owned authentication, database fingerprint and COMMIT cannot be proven
 * by a synthetic response in a Mobile unit test.
 */
import type { V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";

const MUTATIONS_PATH = "/api/v1/offline/mutations" as const;
const PRACTICE_OPERATION = "training.complete.practice" as const;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CUID = /^c[a-z0-9]{8,}$/;
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;

export type PracticeEventSnapshot = {
  binding: V2SessionBinding;
  event: V2PendingEvent;
};
type PracticeRequestBody = Readonly<{
  eventId: string;
  operation: typeof PRACTICE_OPERATION;
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
}>;
export type PracticeJournalPreview = Readonly<{
  post: Readonly<{
    method: "POST";
    path: typeof MUTATIONS_PATH;
    headers: Readonly<{ "X-Gafus-Sync-Protocol": "2"; "Idempotency-Key": string }>;
    body: PracticeRequestBody;
  }>;
  lookup: Readonly<{
    method: "GET";
    path: string;
    headers: Readonly<{ "X-Gafus-Sync-Protocol": "2" }>;
  }>;
  canonicalFingerprintInput: string;
}>;
export type PracticeCompatibilityDecision =
  | Readonly<{ status: "confirmed"; eventId: string; replayed: boolean }>
  | Readonly<{ status: "pending" }>;

type CapturedEvent = Readonly<{
  ownerId: string;
  authEpoch: string;
  eventId: string;
  fingerprint: string;
  courseId: string;
}>;
const snapshots = new WeakMap<PracticeJournalPreview, CapturedEvent>();
const pending: PracticeCompatibilityDecision = Object.freeze({ status: "pending" });

function validOwner(binding: V2SessionBinding | null): binding is V2SessionBinding {
  return (
    !!binding &&
    binding.schemaVersion === 2 &&
    typeof binding.principalId === "string" &&
    OWNER.test(binding.principalId) &&
    typeof binding.authEpoch === "string" &&
    UUID_V4.test(binding.authEpoch)
  );
}
function sameOwner(a: V2SessionBinding, b: V2SessionBinding): boolean {
  return a.principalId === b.principalId && a.authEpoch === b.authEpoch;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** Only the exact AG1 POST training.complete.practice DTO is currently supported. */
function extractPracticeBody(event: V2PendingEvent): PracticeRequestBody {
  if (
    event.kind !== "completePracticeStep" ||
    !UUID_V4.test(event.eventId) ||
    !isRecord(event.payload) ||
    Object.keys(event.payload).length !== 3
  ) {
    throw new Error("V2_PRACTICE_CONTRACT_UNSUPPORTED");
  }
  const { courseId, dayOnCourseId, stepIndex } = event.payload;
  if (
    typeof courseId !== "string" ||
    !CUID.test(courseId) ||
    typeof dayOnCourseId !== "string" ||
    !CUID.test(dayOnCourseId) ||
    !Number.isSafeInteger(stepIndex) ||
    (stepIndex as number) < 0
  ) {
    throw new Error("V2_PRACTICE_CONTRACT_INVALID");
  }
  return Object.freeze({
    eventId: event.eventId,
    operation: PRACTICE_OPERATION,
    courseId,
    dayOnCourseId,
    stepIndex: stepIndex as number,
  });
}
/** Exactly AG1's canonical JSON.stringify scalar order. The SHA256 is SERVER-authoritative. */
function canonicalFingerprint(body: PracticeRequestBody): string {
  return JSON.stringify({
    method: "POST",
    operation: PRACTICE_OPERATION,
    courseId: body.courseId,
    dayOnCourseId: body.dayOnCourseId,
    stepIndex: body.stepIndex,
  });
}

/**
 * Construct a passive request DESCRIPTION only. No token/header IO, fetch,
 * mutation, ACK clearing, old-path fallback or native storage access exists.
 */
export function preparePracticeJournalRequest(
  snapshot: PracticeEventSnapshot,
  currentBinding: V2SessionBinding | null,
): PracticeJournalPreview {
  if (
    !validOwner(currentBinding) ||
    !validOwner(snapshot.binding) ||
    !sameOwner(currentBinding, snapshot.binding)
  ) {
    throw new Error("V2_PRACTICE_OWNER_EPOCH_MISMATCH");
  }
  const body = extractPracticeBody(snapshot.event);
  const fingerprint = canonicalFingerprint(body);
  const preview: PracticeJournalPreview = Object.freeze({
    post: Object.freeze({
      method: "POST" as const,
      path: MUTATIONS_PATH,
      headers: Object.freeze({
        "X-Gafus-Sync-Protocol": "2" as const,
        "Idempotency-Key": body.eventId,
      }),
      body,
    }),
    lookup: Object.freeze({
      method: "GET" as const,
      path: MUTATIONS_PATH + "/" + body.eventId,
      headers: Object.freeze({ "X-Gafus-Sync-Protocol": "2" as const }),
    }),
    canonicalFingerprintInput: fingerprint,
  });
  // Owner/authEpoch are never transmitted and never added to the public preview.
  snapshots.set(
    preview,
    Object.freeze({
      ownerId: currentBinding.principalId,
      authEpoch: currentBinding.authEpoch,
      eventId: body.eventId,
      fingerprint,
      courseId: body.courseId,
    }),
  );
  return preview;
}

/**
 * Pure interpretation of a supplied response fixture; NOT authorization to
 * delete/dequeue. It cannot prove the actual server receipt owner/fingerprint:
 * AG1 response does not include those fields and no request is performed here.
 */
export function evaluatePracticeJournalResponse(
  preview: PracticeJournalPreview,
  currentBinding: V2SessionBinding | null,
  currentEvent: V2PendingEvent | null,
  responseKind: "post" | "lookup",
  httpStatus: number | null,
  response: unknown,
): PracticeCompatibilityDecision {
  const captured = snapshots.get(preview);
  if (
    !captured ||
    !validOwner(currentBinding) ||
    !currentEvent ||
    currentBinding.principalId !== captured.ownerId ||
    currentBinding.authEpoch !== captured.authEpoch ||
    httpStatus !== 200 ||
    !isRecord(response) ||
    response.success !== true ||
    !isRecord(response.ack)
  ) {
    return pending;
  }
  let currentBody: PracticeRequestBody;
  try {
    currentBody = extractPracticeBody(currentEvent);
    // Do not report raw untrusted offline payloads from this pure validator.
    // eslint-disable-next-line @gafus/require-client-catch-tracer
  } catch {
    // A changed queued event must remain pending; never log potentially private payload.
    return pending;
  }
  if (
    currentBody.eventId !== captured.eventId ||
    canonicalFingerprint(currentBody) !== captured.fingerprint
  )
    return pending;
  const ack = response.ack;
  if (
    ack.protocol !== 2 ||
    ack.state !== "COMMITTED" ||
    ack.eventId !== captured.eventId ||
    ack.operation !== PRACTICE_OPERATION ||
    typeof ack.replayed !== "boolean" ||
    (responseKind === "lookup" && ack.replayed !== true) ||
    typeof ack.serverRevision !== "string" ||
    !/^[1-9][0-9]*$/.test(ack.serverRevision) ||
    !isRecord(ack.result) ||
    ack.result.courseId !== captured.courseId ||
    typeof ack.result.allCompleted !== "boolean" ||
    typeof ack.result.stepJustCompleted !== "boolean"
  )
    return pending;
  return { status: "confirmed", eventId: captured.eventId, replayed: ack.replayed };
}
