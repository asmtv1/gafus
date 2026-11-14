import { disconnectCoreDatabase } from "@gafus/statistics/database-health";
import { trainCurrentSmartFeedRanker } from "@gafus/feed-server/smart-persistence";

/** Manual offline training, never auto-promotes artifacts. */
async function main() {
  if (process.env.FEED_SMART_ML_TRAIN_CONFIRM !== "yes") {
    throw new Error("Set FEED_SMART_ML_TRAIN_CONFIRM=yes explicitly to run offline training");
  }
  const result = await trainCurrentSmartFeedRanker();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Training failed\n");
  process.exitCode = 1;
}).finally(async () => { await disconnectCoreDatabase(); });
