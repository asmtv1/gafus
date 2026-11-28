import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Text } from "react-native";
import { API_BASE_URL } from "@/shared/config";
import { activeOtaRevision } from "@/shared/lib/otaPolicy";

export function QaRuntimeIdentity() {
  const serverCommit = process.env.EXPO_PUBLIC_GAFUS_QA_SERVER_SHA;
  if (!serverCommit || !/^[a-f0-9]{40}$/.test(serverCommit)) return null;
  let origin: string;
  try { origin = new URL(API_BASE_URL).origin; } catch { /* diagnostic: expected QA runtime identity is optional and cannot block rendering. */  return null; }
  if (!/^https?:\/\/(?:127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|[a-z0-9.-]+\.test)(?::\d+)?$/.test(origin)) {
    return null;
  }
  const identity = [
    "qa-runtime", Application.nativeApplicationVersion, Application.nativeBuildVersion,
    Updates.runtimeVersion, activeOtaRevision(), Updates.updateId ?? "embedded", serverCommit,
  ].join("/");
  return <Text testID={identity} accessibilityLabel={identity}>{identity}</Text>;
}
