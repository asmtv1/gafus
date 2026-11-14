/** Every wallet writer must acquire this same transaction-scoped advisory key. */
import { prisma, type Prisma } from "@gafus/prisma";
export type GafusWalletTransaction = Prisma.TransactionClient;

export async function lockGafusUser(tx: GafusWalletTransaction, userId: string): Promise<void> {
  if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`gafus-wallet:${userId}`}))::text AS locked
  `;
}

/** Callbacks run in the SAME locked transaction; no cross-connection lock leakage. */
export async function withGafusUserLock<T>(
  userId: string, operation: (tx: GafusWalletTransaction) => Promise<T>,
): Promise<T> {
  if (!userId) throw new Error("GAFUS_WALLET_OWNER_REQUIRED");
  return prisma.$transaction(async tx => {
    await lockGafusUser(tx,userId);
    return operation(tx);
  });
}
