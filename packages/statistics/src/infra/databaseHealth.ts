/** DB lifecycle belongs to the server infrastructure boundary. */
import { prisma } from "@gafus/prisma";
export async function checkCoreDatabaseReady(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
export async function disconnectCoreDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function readDatabasePoolWaitHistograms() {
  const { histograms } = await prisma.$metrics.json();
  return histograms;
}
