/** Worker-only SQL and model lifecycle. Never loaded by browser or Core. */
export { refreshSmartFeedStats } from "./smart-aggregation.js";
export { refreshSmartAuthorAffinities } from "./smart-affinity.js";
export { getSmartFeedHealth } from "./smart-health.js";
export { getSmartExperimentReport, wilson95 } from "./smart-experiment-report.js";
export { trainSmartFeedRanker } from "./smart-ml-training.js";
export { activateSmartFeedRanker } from "./smart-ml-promotion.js";
export {
  trainCurrentSmartFeedRanker, activateCurrentSmartFeedRanker,
  refreshCurrentSmartFeedStats, refreshCurrentSmartAuthorAffinities,
  getCurrentSmartFeedHealth, pruneCurrentSmartFeedSignals,
} from "./smart-ml-operations.js";
