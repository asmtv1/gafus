import {
  createGafusWalletService, createGafusRewardService, createGafusLockService,
  type GafusLedgerRowsPort, type GafusLockPort,
} from "@gafus/core/services/gafus";
import * as ledgerRows from "@gafus/gafus-server/wallet-records";
import * as lockRows from "@gafus/gafus-server/wallet-lock";

// These are type bridges only. The SQL adapter receives the original transaction.
export const gafusReward = createGafusRewardService(
  createGafusWalletService(ledgerRows as unknown as GafusLedgerRowsPort),
  createGafusLockService(lockRows as unknown as GafusLockPort),
);
