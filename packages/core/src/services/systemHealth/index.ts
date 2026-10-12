import { prisma } from "@gafus/prisma";

/** Infrastructure-only DB lifecycle. External adapters retain Redis/HTTP ownership. */
export async function checkCoreDatabaseReady(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectCoreDatabase(): Promise<void> {
  await prisma.$disconnect();
}
