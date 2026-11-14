/** Only one authoritative Gafus wallet advisory-lock implementation exists.
 * Core receives an explicitly bound same-transaction Persistence port; this
 * facade never imports Prisma or a server package, and does not implement
 * a weaker parallel lock. Every write must fail closed if unbound.
 */
import type { GafusTx } from "./types";

export interface GafusLockPort {
  lockGafusUser(tx: GafusTx, userId: string): Promise<void>;
  withGafusUserLock<T>(userId: string, operation: (tx: GafusTx) => Promise<T>): Promise<T>;
}
let installedGafusLockPort: Readonly<GafusLockPort> | null = null;
export function registerGafusLockPort(port: GafusLockPort): void {
  if (installedGafusLockPort !== null && installedGafusLockPort !== port) {
    throw new Error("GAFUS_WALLET_LOCK_PORT_ALREADY_BOUND");
  }
  installedGafusLockPort = port;
}
function requireGafusLockPort(): Readonly<GafusLockPort> {
  if (!installedGafusLockPort) throw new Error("GAFUS_WALLET_LOCK_PORT_UNBOUND");
  return installedGafusLockPort;
}
/** Preserve the historical owner-required error even without composition. */
export async function lockGafusUser(tx: GafusTx, userId: string): Promise<void> {
  if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
  return requireGafusLockPort().lockGafusUser(tx, userId);
}
export async function withGafusUserLock<T>(
  userId: string, operation: (tx: GafusTx) => Promise<T>,
): Promise<T> {
  if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
  return requireGafusLockPort().withGafusUserLock(userId, operation);
}
