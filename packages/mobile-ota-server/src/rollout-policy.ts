/** Deterministic installation cohorts, never based on IP, account or session. */
import { createHash } from "node:crypto";

export const OTA_COHORT_HEADER = "expo-extra-params";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLLOUT = new Set([1, 10, 50, 100]);
export function validOtaPercent(value: unknown): value is 1 | 10 | 50 | 100 {
  return typeof value === "number" && ROLLOUT.has(value);
}
/** Expo `setExtraParamAsync` sends an SFV dictionary, not an arbitrary header. */
export function parseOtaInstallationId(value: string | undefined): string | null {
  if (!value || value.length > 1024 || /[\r\n]/.test(value)) return null;
  const values = [...value.matchAll(/(?:^|,)\s*gafus-installation-id\s*=\s*"([^"]{1,64})"\s*(?=,|$)/g)];
  if (values.length !== 1) return null;
  const candidate = values[0]?.[1];
  if (!candidate || !UUID.test(candidate)) return null;
  // Do not accept smuggled, duplicated or syntactically invalid fields.
  const expected = value.trim().split(",").filter(part => part.trim().startsWith("gafus-installation-id"));
  if (expected.length !== 1) return null;
  return candidate.toLowerCase();
}
/** Monotonic buckets: raising rollout from 1 to 10 to 50 keeps existing cohort. */
export function installationInOtaCohort(
  deploymentId: string,
  installationId: string | null,
  percent: number,
): boolean {
  if (!validOtaPercent(percent) || !UUID.test(deploymentId)) return false;
  if (percent === 100) return true;
  if (!installationId || !UUID.test(installationId)) return false;
  const digest = createHash("sha256").update(`gafus-ota-cohort-v1:${deploymentId.toLowerCase()}:${installationId.toLowerCase()}`).digest();
  const bucket = digest.readUInt32BE(0) % 10_000;
  return bucket < percent * 100;
}

/** A verified tester always sees the active revision; otherwise use the stable
 * deterministic installation cohort. Zero means *only* named testers.
 */
export function otaRolloutIncludesInstallation(
  deploymentId: string, installationId: string | null, percent: number, verifiedTester: boolean,
): boolean {
  if (percent === 0) return verifiedTester;
  return verifiedTester || installationInOtaCohort(deploymentId,installationId,percent);
}
