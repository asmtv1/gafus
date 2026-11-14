import { changeGafusBalanceTx } from "./walletService";

/** The operator import policy is independent of SQL/Prisma. API composition
 * injects the current server repository; each credit remains in its own
 * owner-and-admin-row-locked transaction, including audit and replay fencing. */
export interface LegacyGafusImportPorts {
  readActorRole: (actorId: string) => Promise<string | null>;
  readPreflightRows: () => Promise<{
    activeWallets: number; credits: number; pendingRefundWallets: number;
    pendingRefundCredits: number; unsettledSessions: number; imported: number;
  }>;
  readCandidates: (cursor: string | undefined, limit: number) => Promise<{
    userId: string; balance: number;
  }[]>;
  runOneTransaction: (
    actorId: string, candidate: { userId: string; balance: number },
    credit: typeof changeGafusBalanceTx,
  ) => Promise<{ imported: boolean; replay: boolean; amount: number }>;
}

function requireCutover() {
  if (process.env.GAFUS_LEGACY_REWARDED_DISABLED !== "true" ||
      process.env.GAFUS_LEGACY_IMPORT_ENABLED !== "true") {
    throw new Error("LEGACY_IMPORT_DISABLED");
  }
}

async function requireAdmin(actorId: string, persistence: LegacyGafusImportPorts) {
  const role = await persistence.readActorRole(actorId);
  if (role !== "ADMIN") throw new Error("FORBIDDEN");
}

/** Read-only preflight, including unsettled refunds and unfinished ad sessions. */
export async function getLegacyGafusImportPreflight(actorId: string, persistence: LegacyGafusImportPorts) {
  await requireAdmin(actorId, persistence);
  const {activeWallets,credits,pendingRefundWallets,pendingRefundCredits,
    unsettledSessions,imported}=await persistence.readPreflightRows();
  return {
    activeWallets, credits, pendingRefundWallets, pendingRefundCredits,
    unsettledSessions,
    imported,
    cutoverDisabled: process.env.GAFUS_LEGACY_REWARDED_DISABLED === "true",
    importEnabled: process.env.GAFUS_LEGACY_IMPORT_ENABLED === "true",
  };
}

/**
 * Operator-triggered batches; never run in requests, cron or app startup.
 * Old rows remain untouched for audit. The ledger key ensures retries are free.
 * Each user import is a separate atomic transaction.
 */
export async function importLegacyRewardedBatch(input: {
  actorId: string;
  confirmed: boolean;
  batchSize?: number;
  cursor?: string;
}, persistence: LegacyGafusImportPorts) {
  await requireAdmin(input.actorId, persistence);
  requireCutover();
  if (!input.confirmed) throw new Error("LEGACY_IMPORT_CONFIRMATION_REQUIRED");
  const batchSize = Math.min(Math.max(1, input.batchSize ?? 50), 100);
  const preflight = await getLegacyGafusImportPreflight(input.actorId, persistence);
  if (preflight.pendingRefundCredits !== 0 || preflight.unsettledSessions !== 0) {
    throw new Error("LEGACY_IMPORT_UNSETTLED_STATE");
  }
  const rows = await persistence.readCandidates(input.cursor,batchSize);
  const batch = rows.slice(0, batchSize);
  const nextCursor = rows.length > batchSize ? batch[batch.length - 1]?.userId ?? null : null;
  let imported = 0;
  let credits = 0;
  let replays = 0;
  const actorId = input.actorId;
  for (const wallet of batch) {
    const result = await persistence.runOneTransaction(actorId,wallet,changeGafusBalanceTx);
    if (result.imported) {
      imported++;
      credits += result.amount;
    } else if (result.replay) replays++;
  }
  return { processed: batch.length, imported, credits, replays, nextCursor };
}
