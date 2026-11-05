import type { MobileAppPublicConfig } from "./api/public-config";
import { OTA_COMPILED_REVISION } from "./otaRevision.generated";

export const OTA_BASE_VERSION = "1.7.3";

/** OTA revisions are independent of store versions and native build numbers. */
export function activeOtaRevision(): number {
  return OTA_COMPILED_REVISION;
}

/** Must be within the same native runtime/channel, otherwise Store gate owns the update. */
export function requiredOtaRevision(
  policy: MobileAppPublicConfig["ota"],
  context: {
    platform: string;
    nativeVersion: string | null;
    runtimeVersion: string | null;
    channel: string | null;
    currentRevision: number;
  },
): number | null {
  if (!policy?.required || !policy.version || policy.channel !== "production") return null;
  if (context.platform !== "ios" && context.platform !== "android") return null;
  if (policy.platform !== "all" && policy.platform !== context.platform) return null;
  if (context.channel !== policy.channel) return null;
  const match = /^(\d+\.\d+\.\d+)-ota\.([1-9]\d*)$/.exec(policy.version);
  if (!match || match[1] !== context.nativeVersion ||
    match[1] !== context.runtimeVersion) return null;
  if (match[1] !== OTA_BASE_VERSION) return null;
  const revision = Number(match[2]);
  return Number.isSafeInteger(revision) && revision > context.currentRevision ? revision : null;
}
