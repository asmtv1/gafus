/** The original Prisma-only wallet repository is the sole SQL owner.
 * Advisory lock is bound separately, and MUST be acquired by the caller
 * within this same transaction before idempotency and balance CAS writes.
 * History remains read-only and scoped to the supplied actor user ID.
 */
import {
  createGafusWalletService,
  type GafusLedgerRowsPort,
} from "@gafus/core/services/gafus";
import {
  ensureWalletRow, findLedgerEntry, updateWalletBalanceRow,
  appendLedgerEntry, readWalletBalanceRow, readWalletLedgerRows,
} from "@gafus/gafus-server/wallet-records";

export const ledgerRows: GafusLedgerRowsPort = {
  ensureWalletRow: ensureWalletRow as unknown as GafusLedgerRowsPort["ensureWalletRow"],
  findLedgerEntry: findLedgerEntry as unknown as GafusLedgerRowsPort["findLedgerEntry"],
  updateWalletBalanceRow: updateWalletBalanceRow as unknown as GafusLedgerRowsPort["updateWalletBalanceRow"],
  appendLedgerEntry: appendLedgerEntry as unknown as GafusLedgerRowsPort["appendLedgerEntry"],
  readWalletBalanceRow,
  readWalletLedgerRows,
};
export const gafusWallet = createGafusWalletService(ledgerRows);
