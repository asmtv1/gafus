import * as Application from "expo-application";
import { Platform } from "react-native";

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function getMobileClientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Client-Platform": Platform.OS,
  };
  const version = Application.nativeApplicationVersion?.trim() ?? "";
  if (SEMANTIC_VERSION_PATTERN.test(version)) {
    headers["X-Client-Version"] = version;
  }
  return headers;
}
