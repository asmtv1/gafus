import { prisma } from "@gafus/prisma";

/** One-way, concurrent-safe cutover of NPD fiscalization, never contacting NPD providers. */
export async function applyNpdFiscalizationCutover(now = new Date()): Promise<Date> {
  const existing = await prisma.npdConnection.findUnique({
    where: { id: "default" },
    select: { fiscalizationStartedAt: true },
  });
  if (!existing) throw new Error("NPD connection is not bootstrapped");
  if (existing.fiscalizationStartedAt) return existing.fiscalizationStartedAt;

  const result = await prisma.npdConnection.updateMany({
    where: { id: "default", fiscalizationStartedAt: null },
    data: { fiscalizationStartedAt: now },
  });
  if (result.count === 1) return now;
  // Another instance may have set the cutover after our initial read.
  const latest = await prisma.npdConnection.findUnique({
    where: { id: "default" },
    select: { fiscalizationStartedAt: true },
  });
  if (latest?.fiscalizationStartedAt) return latest.fiscalizationStartedAt;
  throw new Error("NPD cutover could not be recorded");
}
