/** One atomic Gafus content unlock: PG advisory lock, replay lookup,
 * signed ledger debit and target grant all share the exact same transaction.
 * Core still owns occurrence-aware eligibility, cost and public error code.
 */
import { registerGafusUnlockRowsPort, type GafusUnlockRowsPort } from "@gafus/core/services/gafus";
import {
  withGafusUnlockTransaction,
  readGafusUnlockReplayTx,
  insertGafusUnlockGrantTx,
} from "@gafus/gafus-server/unlock-records";

const unlockRows: GafusUnlockRowsPort = {
  withGafusUnlockTransaction: withGafusUnlockTransaction as unknown as GafusUnlockRowsPort["withGafusUnlockTransaction"],
  readGafusUnlockReplayTx: readGafusUnlockReplayTx as unknown as GafusUnlockRowsPort["readGafusUnlockReplayTx"],
  insertGafusUnlockGrantTx: insertGafusUnlockGrantTx as unknown as GafusUnlockRowsPort["insertGafusUnlockGrantTx"],
};
registerGafusUnlockRowsPort(unlockRows);
