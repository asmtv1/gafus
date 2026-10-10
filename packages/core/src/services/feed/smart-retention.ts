import type { FeedDb } from "./ports";

/** Remove old qualified-exposure logs in small batches; keep public lifetime views. */
export async function pruneSmartImpressions(
  db: FeedDb, days = 90, batchSize = 2000,
): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86_400_000);
  const expired = await db.feedImpression.findMany({
    where: { occurredAt: { lt: cutoff } },
    select: { id: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(5000, batchSize)),
  });
  if (!expired.length) return 0;
  const result = await db.feedImpression.deleteMany({
    where: { id: { in: expired.map(row => row.id) } },
  });
  return result.count;
}


/** Outcome data expires on the same bounded 90-day retention schedule. */
export async function pruneSmartRankingEvents(
  db: FeedDb, days = 90, batchSize = 2000,
): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86_400_000);
  const expired = await db.feedRankingEvent.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { eventId: true },
    orderBy: [{ createdAt: "asc" }, { eventId: "asc" }],
    take: Math.max(1, Math.min(5000, batchSize)),
  });
  if (!expired.length) return 0;
  return (await db.feedRankingEvent.deleteMany({
    where: { eventId: { in: expired.map(row => row.eventId) } },
  })).count;
}
