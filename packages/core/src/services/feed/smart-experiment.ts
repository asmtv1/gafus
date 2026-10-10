import { createHash } from "node:crypto";

/**
 * Deterministic user-level assignment. Cohorts never change between sessions.
 * A disabled experiment yields "off", leaving the current smart feed untouched.
 */
export type SmartExperimentVariant = "off" | "control" | "treatment";
export const SMART_EXPERIMENT_KEY = "feed-for-you-v1";

export function assignSmartExperiment(
  actorId: string,
  config: { enabled: boolean; enrollmentPercent: number; treatmentPercent: number; key?: string },
): SmartExperimentVariant {
  if (!config.enabled) return "off";
  const { enrollmentPercent, treatmentPercent } = config;
  if (![enrollmentPercent, treatmentPercent].every(value =>
    Number.isFinite(value) && value >= 0 && value <= 100,
  )) return "off";
  const key = config.key ?? SMART_EXPERIMENT_KEY;
  const bucket = (scope: string) => createHash("sha256")
    .update(JSON.stringify([scope, key, actorId])).digest().readUInt32BE(0) / 0x100000000;
  if (bucket("enrollment") >= enrollmentPercent / 100) return "off";
  return bucket("variant") < treatmentPercent / 100 ? "treatment" : "control";
}

export function configuredSmartExperiment(actorId: string): SmartExperimentVariant {
  return assignSmartExperiment(actorId, {
    enabled: process.env.FEED_SMART_AB_ENABLED === "true",
    enrollmentPercent: Number(process.env.FEED_SMART_AB_PERCENT ?? "0"),
    treatmentPercent: Number(process.env.FEED_SMART_AB_TREATMENT_PERCENT ?? "50"),
  });
}
