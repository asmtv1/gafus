import type { GafusTx } from "./types";

/** Transaction-scoped, owner-locked Gafus content unlock port. Persistence
 * retains the only PostgreSQL advisory lock and grants+debit atomicity.
 * The Core callback sees the SAME GafusTx, never a nested connection.
 */
export type GafusUnlockGrant = {
  userId: string;
  targetType: "COURSE_STEP" | "MINI_GUIDE" | "ARTICLE";
  targetKey: string;
  courseId: string | null;
  dayOnCourseId: string | null;
  stepOnDayId: string | null;
  transactionId: string;
  settingsRevision: number;
  grantedAt: Date;
  expiresAt: Date;
};
export type GafusUnlockReplayRow = {
  userId: string;
  kind: "EARN" | "SPEND" | "ADMIN_CREDIT" | "ADMIN_DEBIT" | "LEGACY_IMPORT";
  targetType: "COURSE_STEP" | "MINI_GUIDE" | "ARTICLE" | null;
  targetKey: string | null;
  delta: number;
  balanceAfter: number;
  targetAccess: { expiresAt: Date } | null;
};
export interface GafusUnlockRowsPort {
  withGafusUnlockTransaction<T>(userId: string, action: (tx: GafusTx) => Promise<T>): Promise<T>;
  readGafusUnlockReplayTx(tx: GafusTx, key: string): Promise<GafusUnlockReplayRow | null>;
  insertGafusUnlockGrantTx(tx: GafusTx, grant: GafusUnlockGrant): Promise<unknown>;
}
let bound: Readonly<GafusUnlockRowsPort> | null = null;
export function registerGafusUnlockRowsPort(port: GafusUnlockRowsPort): void {
  if (bound !== null && bound !== port) throw new Error("GAFUS_UNLOCK_PORT_ALREADY_BOUND");
  bound = port;
}
export function requireGafusUnlockRowsPort(): Readonly<GafusUnlockRowsPort> {
  if (!bound) throw new Error("GAFUS_UNLOCK_PORT_UNBOUND");
  return bound;
}
