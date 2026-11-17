/** Pure bridge between release policy and the exact signed-manifest cohort. */
export type MandatoryOtaPolicy = Readonly<{
  required: boolean;
  version: string | null;
  platform: "ios" | "android" | "all";
  channel: string;
}>;

export function resolveMandatoryOtaPolicy(
  policy: MandatoryOtaPolicy | null | undefined,
  context: Readonly<{ platform: "ios" | "android"; runtimeVersion: string; selectedRevision: number | null }>,
): { required: boolean; version: string | null; selectedRevision: number | null } {
  const chosen = context.selectedRevision;
  const none = { required: false, version: null, selectedRevision: chosen };
  if (!policy?.required || policy.channel !== "production" ||
      (policy.platform !== "all" && policy.platform !== context.platform) || !policy.version) return none;
  const match = /^(\d+\.\d+\.\d+)-ota\.([1-9]\d*)$/.exec(policy.version);
  if (!match || match[1] !== context.runtimeVersion ||
      !Number.isSafeInteger(chosen) || chosen === null || chosen < Number(match[2])) return none;
  return { required: true, version: policy.version, selectedRevision: chosen };
}
