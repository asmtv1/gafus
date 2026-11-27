import * as Application from "expo-application";
import { Platform } from "react-native";
import { OTA_COMPILED_REVISION } from "../otaRevision.generated";

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function getMobileClientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Client-Platform": Platform.OS,
  };
  const version = Application.nativeApplicationVersion?.trim() ?? "";
  if (SEMANTIC_VERSION_PATTERN.test(version)) {
    headers["X-Client-Version"] = version;
  }
  // This is diagnostic release identity only, never a permission or OTA gate.
  const build = "nativeBuildVersion" in Application ? Application.nativeBuildVersion?.trim() ?? "" : "";
  if (/^[1-9]\d{0,9}$/.test(build) && Number(build) <= 2100000000) headers["X-Client-Build"] = build;
  if (Number.isSafeInteger(OTA_COMPILED_REVISION) && OTA_COMPILED_REVISION >= 0 && OTA_COMPILED_REVISION <= 1_000_000_000)
    headers["X-Client-Ota-Revision"] = String(OTA_COMPILED_REVISION);
  return headers;
}
