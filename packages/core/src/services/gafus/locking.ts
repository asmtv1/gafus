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
/** No process-global registration or substitute JavaScript lock. */
export function createGafusLockService(port: GafusLockPort) {
  if (!port) throw new Error("GAFUS_WALLET_LOCK_DEPENDENCIES_REQUIRED");
  return {
    async lockGafusUser(tx: GafusTx, userId: string): Promise<void> {
      if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
      return port.lockGafusUser(tx, userId);
    },
    async withGafusUserLock<T>(userId: string, operation: (tx: GafusTx) => Promise<T>): Promise<T> {
      if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
      return port.withGafusUserLock(userId, operation);
    },
  };
}
