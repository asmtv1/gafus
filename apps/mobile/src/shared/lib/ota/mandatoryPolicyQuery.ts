import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { apiClient } from "@/shared/lib/api/client";
import { ensureOtaInstallationIdentity } from "@/shared/lib/ota/installationIdentity";

export type MandatoryOtaCohortDecision = {
  required: boolean;
  version: string | null;
  selectedRevision: number | null;
};

/** The backend uses the *same* native fingerprint, signed-manifest and stable
 * rollout cohort as the Expo OTA endpoint. Never authorize a required update
 * by username or by a global flag alone. */
export async function fetchMandatoryOtaCohortDecision(): Promise<MandatoryOtaCohortDecision> {
  const installationId = await ensureOtaInstallationIdentity();
  const nativeFingerprint = Constants.expoConfig?.extra?.otaNativeFingerprint;
  const runtimeVersion = Updates.runtimeVersion;
  if (!installationId || !nativeFingerprint || typeof nativeFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/i.test(nativeFingerprint) ||
      typeof runtimeVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(runtimeVersion) ||
      (Platform.OS !== "android" && Platform.OS !== "ios")) {
    throw new Error("Невозможно проверить совместимость обязательного OTA с устройством.");
  }
  const result = await apiClient<MandatoryOtaCohortDecision>(
    "/api/v1/mobile-ota-tester/mandatory-policy", {
      method: "POST", timeoutMs: 10_000, skipAuthRefreshReplay: true,
      body: { installationId, platform: Platform.OS, runtimeVersion, nativeFingerprint,
        nativeReleaseId: Constants.expoConfig?.extra?.otaNativeReleaseId },
    },
  );
  const policy = result.data;
  if (!result.success || !policy || typeof policy.required !== "boolean" ||
      !(policy.version === null || typeof policy.version === "string") ||
      !(policy.selectedRevision === null ||
        (Number.isSafeInteger(policy.selectedRevision) && policy.selectedRevision >= 1))) {
    throw new Error("Сервер не подтвердил политику обязательного OTA.");
  }
  return policy;
}

/** Public OTA policy is not sufficient: this scoped authenticated query must
 * confirm that the server would actually send the required signed release. */
export function useMandatoryOtaCohortDecision(enabled: boolean, userId: string | null) {
  return useQuery({
    queryKey: ["mandatory-ota-rollout-cohort", userId, Platform.OS, Updates.runtimeVersion,
      Constants.expoConfig?.extra?.otaNativeFingerprint],
    queryFn: fetchMandatoryOtaCohortDecision,
    networkMode: "always",
    enabled: enabled && !!userId,
    retry: 1,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
