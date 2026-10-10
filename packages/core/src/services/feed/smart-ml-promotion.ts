import { Prisma } from "@gafus/prisma";
import type { FeedDb } from "./ports";
import { isSmartMlModel, smartMlPassesOfflineGate } from "./smart-ml";

/** Explicit manual promotion after offline evaluation, never a training side-effect. */
export async function activateSmartFeedRanker(db: FeedDb, version: string, at = new Date()): Promise<string> {
  if (!/^lr-v1-[0-9]{12}$/.test(version)) throw new Error("Invalid ranker version");
  return db.$transaction(async tx => {
    const candidate = await tx.feedSmartRankerModel.findUnique({ where: { version } });
    if (!candidate || !isSmartMlModel(candidate.artifact) ||
        !smartMlPassesOfflineGate(candidate.artifact) ||
        candidate.artifact.version !== version ||
        candidate.trainedAt.getTime() > at.getTime() ||
        at.getTime() - candidate.trainedAt.getTime() > 30 * 86_400_000) {
      throw new Error("The requested ranker is missing, stale or failed offline validation");
    }
    await tx.feedSmartRankerModel.updateMany({ where: { active: true }, data: { active: false } });
    await tx.feedSmartRankerModel.update({ where: { version }, data: { active: true } });
    return version;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
