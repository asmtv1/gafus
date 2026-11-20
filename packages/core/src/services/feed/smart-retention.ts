/** Stateless retention policy; the feed-server adapter owns the SQL read/delete
 * and ensures each bounded cleanup is scoped to the same cutoff/ids. */
export interface SmartRetentionPort {
  pruneImpressions(cutoff: Date, batchSize: number): Promise<number>;
  pruneRankingEvents(cutoff: Date, batchSize: number): Promise<number>;
}
function retentionWindow(days: number,batchSize:number) {
  return {cutoff:new Date(Date.now()-Math.max(1,days)*86_400_000),
    limit:Math.max(1,Math.min(5000,batchSize))};
}
export async function pruneSmartImpressions(
  port: SmartRetentionPort, days=90,batchSize=2000,
): Promise<number> {
  const {cutoff,limit}=retentionWindow(days,batchSize);
  return port.pruneImpressions(cutoff,limit);
}
export async function pruneSmartRankingEvents(
  port: SmartRetentionPort,days=90,batchSize=2000,
): Promise<number> {
  const {cutoff,limit}=retentionWindow(days,batchSize);
  return port.pruneRankingEvents(cutoff,limit);
}
