/** API process binding for exact PostgreSQL transaction-scoped advisory lock.
 * Server adapter uses gafus-wallet:<ownerId> advisory key inside the SAME Tx.
 * Do not use JS mutexes or spawn another transaction during a wallet write.
 */
import { registerGafusLockPort, type GafusLockPort } from "@gafus/core/services/gafus";
import { lockGafusUser, withGafusUserLock } from "@gafus/gafus-server/wallet-lock";

const walletLockPort: GafusLockPort = {
  lockGafusUser: lockGafusUser as unknown as GafusLockPort["lockGafusUser"],
  withGafusUserLock: withGafusUserLock as unknown as GafusLockPort["withGafusUserLock"],
};
registerGafusLockPort(walletLockPort);
