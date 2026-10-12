import { disconnectCoreDatabase } from "@gafus/core/services/systemHealth";
import { activateCurrentSmartFeedRanker } from "@gafus/core/services/feed";

/**
 * Operator-only command. Training never calls this.
 * Example (staging): FEED_SMART_ML_PROMOTE_CONFIRM=yes pnpm --filter @gafus/worker smart-ml:promote lr-v1-202610101200
 */
async function main() {
  const version = process.argv[2];
  if (process.env.FEED_SMART_ML_PROMOTE_CONFIRM !== "yes" || !version) {
    throw new Error("Explicit FEED_SMART_ML_PROMOTE_CONFIRM=yes and model version are required");
  }
  const activated = await activateCurrentSmartFeedRanker(version);
  process.stdout.write(`ML ranker activated: ${activated}\n`);
}
void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Activation failed\n");
  process.exitCode = 1;
}).finally(async () => { await disconnectCoreDatabase(); });
