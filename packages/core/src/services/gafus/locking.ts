import { prisma } from "@gafus/prisma";
import type { GafusTx } from "./types";

/** Required for every Gafus wallet mutation, including bonuses and admin adjustments. */
export async function lockGafusUser(tx: GafusTx, userId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`gafus-wallet:${userId}`}))::text AS locked
  `;
}

/** Transaction-scoped lock; caller must use the same transaction for all its writes. */
export async function withGafusUserLock<T>(
  userId: string,
  operation: (tx: GafusTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockGafusUser(tx, userId);
    return operation(tx);
  });
}
