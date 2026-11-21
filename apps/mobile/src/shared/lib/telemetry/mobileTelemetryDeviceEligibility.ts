/** Only signed, registered native releases can obtain production ingestion grants.
 * Simulator/emulator builds must never bypass server-side verification. */
export function mayUploadMobileTelemetry(flag: boolean, isPhysicalDevice: boolean,
  platform: string): platform is "ios" | "android" {
  return flag && isPhysicalDevice && (platform === "ios" || platform === "android");
}
