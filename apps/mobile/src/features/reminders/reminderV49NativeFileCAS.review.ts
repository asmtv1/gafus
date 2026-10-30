/** AG3 Reminder V49: review-only native FileStorage CAS capability boundary.
 * No native SDK, filesystem, AsyncStorage or network imports. An injected backend
 * is NOT proof of real device durability; independent AG4/provider evidence is mandatory.
 */
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";
import { reportClientError } from "@/shared/lib/tracer";
import type { V49AG4MockStore, V49AG4Record } from "./reminderV49AG4Compat.review";

/** Abstract transactional file slot, NOT a POSIX file implementation.
 * compareExchange MUST be one LINEARIZABLE, inter-process atomic operation,
 * fenced by never-reused revision, and return only after durable fsync/commit.
 * Torn bytes, delete, rollback or crashes must be distinguished from a truly
 * enrolled empty slot by independent protected metadata. */
export type FileCASImage = Readonly<{ revision: string; bytes: string }>;
export type FileCASResult =
  | Readonly<{ committed: true; revision: string }>
  | Readonly<{ committed: false }>;
export type FileStorage = Readonly<{
  attest: () => Promise<{
    interprocessAtomicCAS: boolean;
    durableCommit: boolean;
    revisionsNeverReused: boolean;
    rollbackAndLossDetection: boolean;
  }>;
  read: (slot: string) => Promise<FileCASImage | null>;
  compareExchange: (
    slot: string,
    expectedRevision: string | null,
    nextBytes: string,
  ) => Promise<FileCASResult>;
  verifiedFreshEmptyEnrollment: () => Promise<boolean>;
}>;
export type NativeBinding = Readonly<{ principalId: string; authEpoch: string }>;
export type NativeScopeDeps = Readonly<{
  file: FileStorage;
  getVerifiedBinding: () => NativeBinding | null;
  /** Must be keyed HMAC-SHA256 using a protected per-install secret outside JS
   * storage; NEVER sha256(ownerId) or raw ownerId. Not implemented here. */
  deriveProtectedHmacOwnerScope: (ownerId: string) => Promise<string>;
}>;
export const V49_REVIEW_SLOT = "gafus-reminder-v49-native-filecas-review-v2";
const HMAC = /^h_[a-f0-9]{64}$/;
const REVI = /^[A-Za-z0-9_-]{1,160}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PHASES = new Set([
  "PREPARED",
  "MAY_HAVE_SENT",
  "UNKNOWN",
  "COMMITTED",
  "REJECTED",
  "SERVER_COMMITTED_UNVERIFIED_DRAFT",
]);
const FIELD_KEYS = [
  "authEpoch",
  "createdAt",
  "idempotencyKey",
  "lastSeenAt",
  "ownerScopeHandle",
  "phase",
  "schemaVersion",
]
  .sort()
  .join("|");
function record(value: unknown): V49AG4Record | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join("|") !== FIELD_KEYS ||
    v.schemaVersion !== 2 ||
    typeof v.ownerScopeHandle !== "string" ||
    !HMAC.test(v.ownerScopeHandle) ||
    typeof v.authEpoch !== "string" ||
    !v.authEpoch ||
    typeof v.idempotencyKey !== "string" ||
    !UUID.test(v.idempotencyKey) ||
    !PHASES.has(String(v.phase)) ||
    typeof v.createdAt !== "number" ||
    !Number.isSafeInteger(v.createdAt) ||
    v.createdAt < 0 ||
    typeof v.lastSeenAt !== "number" ||
    !Number.isSafeInteger(v.lastSeenAt) ||
    v.lastSeenAt < v.createdAt
  )
    return null;
  return Object.freeze({
    schemaVersion: 2,
    ownerScopeHandle: v.ownerScopeHandle,
    authEpoch: v.authEpoch,
    idempotencyKey: v.idempotencyKey.toLowerCase(),
    phase: v.phase as V49AG4Record["phase"],
    createdAt: v.createdAt,
    lastSeenAt: v.lastSeenAt,
  });
}
const same = (a: V49AG4Record | null, b: V49AG4Record) =>
  !!a &&
  a.schemaVersion === b.schemaVersion &&
  a.ownerScopeHandle === b.ownerScopeHandle &&
  a.authEpoch === b.authEpoch &&
  a.idempotencyKey === b.idempotencyKey &&
  a.phase === b.phase &&
  a.createdAt === b.createdAt &&
  a.lastSeenAt === b.lastSeenAt;
const encode = (r: V49AG4Record) => JSON.stringify(r);
function safeDecode(bytes: string): V49AG4Record {
  const parsed = record(JSON.parse(bytes) as unknown);
  if (!parsed || encode(parsed) !== bytes) throw Error("V49_INVALID_JOURNAL");
  return parsed;
}
/** Disabled adapter for getItem/setItem storage. Even same-process mutex is
 * insufficient for OS-process CAS; NEVER promote this to a writable store. */
export function disabledAsyncStorageReminderCAS(
  _unsafe?: Readonly<{
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  }>,
): V49AG4MockStore {
  return {
    load: async () => {
      throw Error("V49_ATOMIC_CAS_NOT_SUPPORTED");
    },
    reserve: async () => false,
    cas: async () => false,
  };
}
export type V49FileCASReady = Readonly<{
  state: "ready";
  ownerScopeHandle: string;
  store: V49AG4MockStore;
  /** Safe ONLY for source-only injected V49 Review. No ordinary app hookup. */
  scopeHandle: (actor: PushActor) => string;
}>;
export type V49FileCASUnavailable = Readonly<{ state: "unavailable" }>;
/** Prepares a fixture-backed capability. DOES NOT detect/prove real FileCAS
 * implementation conformance: consumers must independently audit backend.
 * A failure is terminal for this factory; no AsyncStorage fallback. */
export async function prepareReminderV49FileCASReview(
  actor: PushActor,
  deps: NativeScopeDeps,
): Promise<V49FileCASReady | V49FileCASUnavailable> {
  const binding = () => {
    const b = deps.getVerifiedBinding();
    return !!b && b.principalId === actor.ownerId && b.authEpoch === actor.authEpoch;
  };
  if (!actor.ownerId || !actor.authEpoch || !binding()) return { state: "unavailable" };
  try {
    const proof = await deps.file.attest();
    if (
      !proof.interprocessAtomicCAS ||
      !proof.durableCommit ||
      !proof.revisionsNeverReused ||
      !proof.rollbackAndLossDetection ||
      !binding()
    )
      return { state: "unavailable" };
    const handle = await deps.deriveProtectedHmacOwnerScope(actor.ownerId);
    if (!HMAC.test(handle) || !binding()) return { state: "unavailable" };
    let image: FileCASImage | null = null;
    let loaded = false;
    let blocked = false;
    const guarded = () => !blocked && binding();
    const fail = (): never => {
      blocked = true;
      throw Error("V49_STORAGE_UNAVAILABLE");
    };
    const readImage = async (): Promise<V49AG4Record | null> => {
      if (!guarded()) return fail();
      const next = await deps.file.read(V49_REVIEW_SLOT);
      if (!guarded()) return fail();
      if (next !== null && (!REVI.test(next.revision) || typeof next.bytes !== "string"))
        return fail();
      if (next === null) {
        if (!(await deps.file.verifiedFreshEmptyEnrollment()) || !guarded()) return fail();
        image = null;
        loaded = true;
        return null;
      }
      const parsed = safeDecode(next.bytes);
      // A different owner/epoch is quarantined by the V49 review consumer;
      // never do any writes under the wrong verified actor.
      image = next;
      loaded = true;
      return parsed;
    };
    const mutate = async (expected: V49AG4Record | null, next: V49AG4Record): Promise<boolean> => {
      if (
        !guarded() ||
        !loaded ||
        !record(next) ||
        next.ownerScopeHandle !== handle ||
        next.authEpoch !== actor.authEpoch
      )
        return false;
      try {
        if (expected) {
          if (!image || !same(record(JSON.parse(image.bytes) as unknown), expected)) return false;
        } else if (image !== null) return false;
        const rev = image?.revision ?? null;
        const bytes = encode(next);
        const committed = await deps.file.compareExchange(V49_REVIEW_SLOT, rev, bytes);
        if (!guarded() || !committed.committed || !REVI.test(committed.revision)) {
          blocked = true;
          return false;
        }
        const observed = await deps.file.read(V49_REVIEW_SLOT);
        if (
          !guarded() ||
          !observed ||
          observed.revision !== committed.revision ||
          observed.bytes !== bytes ||
          !same(safeDecode(observed.bytes), next)
        ) {
          blocked = true;
          return false;
        }
        image = observed;
        return true;
      } catch {
        reportClientError(new Error("REMINDER_V49_FILE_CAS_UNKNOWN"), {
          issueKey: "ReminderV49FileCASReview",
          keys: { operation: "cas" },
        });
        blocked = true;
        return false;
      }
    };
    const store: V49AG4MockStore = {
      load: async () => {
        try {
          return await readImage();
        } catch {
          reportClientError(new Error("REMINDER_V49_FILE_READ_UNKNOWN"), {
            issueKey: "ReminderV49FileCASReview",
            keys: { operation: "load" },
          });
          return fail();
        }
      },
      reserve: async (next) => mutate(null, next),
      cas: async (expected, next) => mutate(expected, next),
    };
    return {
      state: "ready",
      ownerScopeHandle: handle,
      store,
      scopeHandle: (who) =>
        guarded() && who.ownerId === actor.ownerId && who.authEpoch === actor.authEpoch
          ? handle
          : "",
    };
  } catch {
    reportClientError(new Error("REMINDER_V49_FILE_PROVIDER_UNAVAILABLE"), {
      issueKey: "ReminderV49FileCASReview",
      keys: { operation: "prepare" },
    });
    return { state: "unavailable" };
  }
}
