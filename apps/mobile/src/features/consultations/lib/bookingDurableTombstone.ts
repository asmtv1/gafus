/** New-only local booking marker. NOT an offline queue or authorization to resend POST. */
export type BookingTombstone = Readonly<{
  version: 1;
  ownerId: string;
  authEpoch: string;
  idempotencyKey: string;
  state: "UNKNOWN" | "CONFIRMED" | "REJECTED";
  createdAt: number;
}>;
export type BookingTombstoneRead =
  | { status: "CLEAR" | "UNAVAILABLE" }
  | { status: "UNKNOWN" | "EXPIRED" | "CONFIRMED" | "REJECTED"; record: BookingTombstone };
export type BookingTombstoneStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
export type BookingTombstoneBinding = { principalId: string; authEpoch: string } | null;
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const PREFIX = "gafus-consultation-booking-tombstone-v1:";
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
function isValidRecord(v: unknown, ownerId: string, epoch: string): v is BookingTombstone {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const record = v as Record<string, unknown>;
  // Reject any unexpected fields: never persist intake, phone, names, token, or slot.
  if (
    Object.keys(record).sort().join(",") !==
    "authEpoch,createdAt,idempotencyKey,ownerId,state,version"
  )
    return false;
  return (
    record.version === 1 &&
    record.ownerId === ownerId &&
    record.authEpoch === epoch &&
    typeof record.idempotencyKey === "string" &&
    UUID_V4.test(record.idempotencyKey) &&
    (record.state === "UNKNOWN" || record.state === "CONFIRMED" || record.state === "REJECTED") &&
    typeof record.createdAt === "number" &&
    Number.isSafeInteger(record.createdAt) &&
    record.createdAt > 0
  );
}
export function createBookingTombstoneStore(deps: {
  storage: BookingTombstoneStorage;
  getBinding(): BookingTombstoneBinding;
  now(): number;
}) {
  const attested = (ownerId: string, epoch: string) => {
    const b = deps.getBinding();
    return (
      OWNER.test(ownerId) &&
      UUID_V4.test(epoch) &&
      b?.principalId === ownerId &&
      b.authEpoch === epoch
    );
  };
  const storageKey = (ownerId: string, epoch: string) => `${PREFIX}${ownerId}:${epoch}`;
  async function read(ownerId: string, epoch: string): Promise<BookingTombstoneRead> {
    if (!attested(ownerId, epoch)) return { status: "UNAVAILABLE" };
    try {
      const raw = await deps.storage.getItem(storageKey(ownerId, epoch));
      if (!attested(ownerId, epoch)) return { status: "UNAVAILABLE" };
      if (raw === null) return { status: "CLEAR" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { status: "UNAVAILABLE" };
      }
      if (!isValidRecord(parsed, ownerId, epoch)) return { status: "UNAVAILABLE" };
      const now = deps.now();
      if (!Number.isFinite(now) || parsed.createdAt > now + 5 * 60_000)
        return { status: "UNAVAILABLE" };
      if (parsed.state === "CONFIRMED" || parsed.state === "REJECTED")
        return { status: parsed.state, record: parsed };
      return {
        status: now - parsed.createdAt >= RECEIPT_TTL_MS ? "EXPIRED" : "UNKNOWN",
        record: parsed,
      };
    } catch {
      return { status: "UNAVAILABLE" };
    }
  }
  /** A conservative UNKNOWN is committed and read back BEFORE any booking POST. */
  async function prepareBeforePost(
    ownerId: string,
    epoch: string,
    uuid: string,
  ): Promise<"READY" | "BLOCKED" | "UNAVAILABLE"> {
    if (!attested(ownerId, epoch) || !UUID_V4.test(uuid)) return "UNAVAILABLE";
    const prior = await read(ownerId, epoch);
    if (prior.status === "UNAVAILABLE") return "UNAVAILABLE";
    if (prior.status === "UNKNOWN" || prior.status === "EXPIRED") return "BLOCKED";
    if (!attested(ownerId, epoch)) return "UNAVAILABLE";
    const value: BookingTombstone = {
      version: 1,
      ownerId,
      authEpoch: epoch,
      idempotencyKey: uuid,
      state: "UNKNOWN",
      createdAt: deps.now(),
    };
    if (!Number.isSafeInteger(value.createdAt) || value.createdAt <= 0) return "UNAVAILABLE";
    try {
      await deps.storage.setItem(storageKey(ownerId, epoch), JSON.stringify(value));
    } catch {
      return "UNAVAILABLE";
    }
    if (!attested(ownerId, epoch)) return "UNAVAILABLE";
    const check = await read(ownerId, epoch);
    if (
      check.status !== "UNKNOWN" ||
      check.record.idempotencyKey !== uuid ||
      check.record.createdAt !== value.createdAt
    )
      return "UNAVAILABLE";
    return attested(ownerId, epoch) ? "READY" : "UNAVAILABLE";
  }
  /** Positive HTTP acknowledgement only; 404/empty mylist never calls this. */
  async function confirmAcknowledged(
    ownerId: string,
    epoch: string,
    uuid: string,
  ): Promise<boolean> {
    const prior = await read(ownerId, epoch);
    if (prior.status === "CONFIRMED")
      return prior.record.idempotencyKey === uuid && attested(ownerId, epoch);
    if (
      (prior.status !== "UNKNOWN" && prior.status !== "EXPIRED") ||
      prior.record.idempotencyKey !== uuid ||
      !attested(ownerId, epoch)
    )
      return false;
    const value: BookingTombstone = { ...prior.record, state: "CONFIRMED" };
    try {
      await deps.storage.setItem(storageKey(ownerId, epoch), JSON.stringify(value));
    } catch {
      return false;
    }
    const check = await read(ownerId, epoch);
    return (
      attested(ownerId, epoch) &&
      check.status === "CONFIRMED" &&
      check.record.idempotencyKey === uuid &&
      check.record.createdAt === value.createdAt
    );
  }
  /** Explicit verified pre-commit refusal ONLY; never timeout/404/409/empty mylist. */
  async function rejectBeforeCommit(
    ownerId: string,
    epoch: string,
    uuid: string,
  ): Promise<boolean> {
    const prior = await read(ownerId, epoch);
    if (
      (prior.status !== "UNKNOWN" && prior.status !== "EXPIRED") ||
      prior.record.idempotencyKey !== uuid ||
      !attested(ownerId, epoch)
    )
      return false;
    const value: BookingTombstone = { ...prior.record, state: "REJECTED" };
    try {
      await deps.storage.setItem(storageKey(ownerId, epoch), JSON.stringify(value));
    } catch {
      return false;
    }
    const checked = await read(ownerId, epoch);
    return (
      attested(ownerId, epoch) &&
      checked.status === "REJECTED" &&
      checked.record.idempotencyKey === uuid &&
      checked.record.createdAt === value.createdAt
    );
  }
  return { read, prepareBeforePost, confirmAcknowledged, rejectBeforeCommit };
}
