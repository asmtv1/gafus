import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { apiClient } from "@/shared/lib/api/client";
import { ensureOtaInstallationIdentity } from "@/shared/lib/ota/installationIdentity";
import { useAuthStore } from "@/shared/stores/authStore";
import type { OtaSession } from "./session";

export type MandatoryOtaCohortDecision = {
  required: boolean;
  version: string | null;
  selectedRevision: number | null;
};

/** The backend uses the *same* native fingerprint, signed-manifest and stable
 * rollout cohort as the Expo OTA endpoint. Never authorize a required update
 * by username or by a global flag alone. */
export async function fetchMandatoryOtaCohortDecision(
  session: OtaSession,
): Promise<MandatoryOtaCohortDecision> {
  const { userId, isCurrent } = session;
  if (!isCurrent()) throw new Error("Сессия изменилась.");
  const installationId = await ensureOtaInstallationIdentity();
  const nativeFingerprint = Constants.expoConfig?.extra?.otaNativeFingerprint;
  const runtimeVersion = Updates.runtimeVersion;
  if (!installationId || !nativeFingerprint || typeof nativeFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/i.test(nativeFingerprint) ||
      typeof runtimeVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(runtimeVersion) ||
      (Platform.OS !== "android" && Platform.OS !== "ios")) {
    throw new Error("Невозможно проверить совместимость обязательного OTA с устройством.");
  }
  if (!isCurrent()) throw new Error("Сессия изменилась.");
  const result = await apiClient<MandatoryOtaCohortDecision>(
    userId ? "/api/v1/mobile-ota-tester/mandatory-policy" : "/api/v1/public/mobile-ota/mandatory-policy", {
      ...(userId ? {} : { skipAuth: true, skipAuthRefreshReplay: true }),
      method: "POST", timeoutMs: 10_000,
      // Safe to replay after refreshing an expired JWT, but never across account changes.
      requestGuard: isCurrent,
      body: { installationId, platform: Platform.OS, runtimeVersion, nativeFingerprint,
        nativeReleaseId: Constants.expoConfig?.extra?.otaNativeReleaseId },
    },
  );
  if (!isCurrent()) throw new Error("Сессия изменилась.");
  if (userId && !result.success && result.code === "SESSION_EXPIRED") {
    useAuthStore.getState().handleSessionExpired();
  }
  const policy = result.data;
  if (!result.success || !policy || typeof policy.required !== "boolean" ||
      !(policy.version === null || typeof policy.version === "string") ||
      !(policy.selectedRevision === null ||
        (Number.isSafeInteger(policy.selectedRevision) && policy.selectedRevision >= 1))) {
    throw new Error("Сервер не подтвердил политику обязательного OTA.");
  }
  return policy;
}
