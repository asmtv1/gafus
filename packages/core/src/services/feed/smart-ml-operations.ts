import { prisma } from "@gafus/prisma";
import { trainSmartFeedRanker } from "./smart-ml-training";
import { activateSmartFeedRanker } from "./smart-ml-promotion";

/** Operators pass intent; core injects its own database implementation. */
export async function trainCurrentSmartFeedRanker() {
  return trainSmartFeedRanker(prisma);
}

export async function activateCurrentSmartFeedRanker(version: string) {
  return activateSmartFeedRanker(prisma, version);
}

import { refreshSmartFeedStats } from "./smart-aggregation";
import { refreshSmartAuthorAffinities } from "./smart-affinity";
import { getSmartFeedHealth } from "./smart-health";
import { pruneSmartImpressions, pruneSmartRankingEvents } from "./smart-retention";

export async function refreshCurrentSmartFeedStats() {
  return refreshSmartFeedStats(prisma);
}
export async function refreshCurrentSmartAuthorAffinities() {
  return refreshSmartAuthorAffinities(prisma);
}
export async function getCurrentSmartFeedHealth() {
  return getSmartFeedHealth(prisma);
}
export async function pruneCurrentSmartFeedSignals() {
  const [impressions, outcomes] = await Promise.all([
    pruneSmartImpressions(prisma),
    pruneSmartRankingEvents(prisma),
  ]);
  return { impressions, outcomes };
}
