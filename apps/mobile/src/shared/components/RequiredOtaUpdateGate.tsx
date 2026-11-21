import { useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import {
  ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text,
  useWindowDimensions, View, type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Button } from "@/shared/components/ui";
import { useOtaAutoApply } from "@/shared/hooks/useOtaAutoApply";
import { refreshOtaTesterGrant } from "@/shared/lib/ota/installationIdentity";
import { trackOtaEvent } from "@/shared/lib/ota/telemetry";
import { useMandatoryOtaCohortDecision } from "@/shared/lib/ota/mandatoryPolicyQuery";
import { selfHostedOtaActive } from "@/shared/lib/ota/installationIdentity";
import { useAuthStore } from "@/shared/stores/authStore";
import { activeOtaRevision, requiredOtaRevision } from "@/shared/lib/otaPolicy";
import { reportClientError } from "@/shared/lib/error-reporting";
import { formatOtaMegabytes, getOtaMainBundleBytes } from "@/shared/lib/otaDownloadSize";
import { getRequiredOtaProgressPresentation } from "@/shared/lib/otaProgressPresentation";

type Phase = "checking" | "downloading" | "installing" | "error";
const TRIED_PREFIX = "@gafus/forced-ota-attempt-v1:";

/**
 * Same uncropped poster as StartupLoader. Its lettering stays visible above
 * the lower-positioned card on different screen aspect ratios.
 */
function ForceOtaScreen({ version, phase, error, progress, mainBundleBytes, retry }: {
  version: string;
  phase: Phase;
  error: string | null;
  progress?: number;
  mainBundleBytes: number | null | undefined;
  retry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progressPresentation = getRequiredOtaProgressPresentation(phase, progress);
  const mb = typeof mainBundleBytes === "number" ? formatOtaMegabytes(mainBundleBytes) : null;
  // Raised above the system gesture area, but still visually in the bottom third.
  const bottomOffset = Math.max(insets.bottom + SPACING.lg, Math.min(height * 0.11, 94));

  return (
    <View style={styles.screen} testID="required-ota-screen">
      <Image
        // Unlike the splash poster this has no artwork/lettering under the card.
        // Its portrait aspect ratio matches tall Android screens (e.g. A53).
        source={require("../../../assets/images/sky-background.png")}
        style={styles.wallpaper}
        resizeMode="cover"
        accessibilityLabel="Небесный фон"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          paddingHorizontal: SPACING.lg,
          paddingTop: Math.max(insets.top + 12, SPACING.lg),
          paddingBottom: bottomOffset,
        }}
      >
        <View style={styles.card}>
          <View style={styles.versionPill}>
            <Text style={styles.versionPillText}>{phase === "checking" ? "ПРОВЕРКА ОБНОВЛЕНИЙ" : "ОБЯЗАТЕЛЬНОЕ ОБНОВЛЕНИЕ"} {version}</Text>
          </View>
          <Text style={styles.title}>Гафус становится лучше!</Text>
          <Text style={styles.description}>
            {phase === "checking"
              ? "Проверяем, требуется ли обновление перед запуском приложения."
              : "Для продолжения работы необходимо скачать обновление. После установки Гафус перезапустится, а ваши данные останутся на месте."}
          </Text>

          {phase === "error" ? (
            <>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error ?? "Не удалось установить обновление. Проверьте интернет и повторите."}
              </Text>
              <Button
                label="Повторить загрузку"
                height={52}
                onPress={retry}
                accessibilityLabel="Повторить OTA-обновление"
              />
            </>
          ) : (
            <View style={styles.progressSection}>
              <View style={styles.progressTitleRow}>
                <Text style={styles.progressLabel}>
                  {phase === "checking" ? "Проверяем обновление…"
                    : phase === "installing" ? "Устанавливаем обновление…"
                    : progressPresentation.finishing ? "Завершаем загрузку и проверку ресурсов…"
                    : "Загружаем обновление…"}
                </Text>
                {progressPresentation.percent !== null ? (
                  <Text style={styles.progressPercent}>{progressPresentation.percent}%</Text>
                ) : (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                )}
              </View>

              {progressPresentation.percent !== null && (
                <View
                  style={styles.progressTrack}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: progressPresentation.percent }}
                >
                  <View style={[styles.progressFill, {
                    width: (String(progressPresentation.percent) + "%") as DimensionValue,
                  }]} />
                </View>
              )}
              {progressPresentation.finishing && (
                <Text style={styles.installingHint} testID="ota-finalizing-hint">
                  Основной файл загружен. Дополнительные ресурсы могут загружаться несколько минут.
                  Не закрывайте приложение — установка продолжится автоматически.
                </Text>
              )}

              <Text style={styles.downloadSize} testID="ota-download-size">
                {mb !== null
                  ? "Основной файл: " + mb + " МБ · доп. ресурсы отдельно"
                  : mainBundleBytes === undefined
                    ? "Уточняем размер файла…"
                    : "Размер файла не предоставлен сервером"}
              </Text>
              {phase === "installing" && (
                <Text style={styles.installingHint}>Перезапускаем Гафус…</Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#B5E5EB",
    overflow: "hidden",
  },
  wallpaper: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%", height: "100%",
  },
  scroll: {
    flex: 1,
  },
  card: {
    alignItems: "stretch",
    backgroundColor: "rgba(250, 247, 238, 0.97)",
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: 26,
    borderColor: "rgba(77, 92, 45, 0.24)",
    borderWidth: 1,
    gap: SPACING.md,
    shadowColor: "#263219",
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  versionPill: {
    alignSelf: "center",
    borderRadius: 100,
    backgroundColor: "rgba(77, 92, 45, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  versionPillText: {
    color: COLORS.primary,
    fontFamily: FONTS.montserratBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  title: {
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    fontSize: 23,
    lineHeight: 29,
    textAlign: "center",
  },
  description: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  progressSection: {
    gap: 10,
    marginTop: SPACING.xs,
  },
  progressTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  progressLabel: {
    color: COLORS.text,
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    flexShrink: 1,
  },
  progressPercent: {
    color: COLORS.primary,
    fontFamily: FONTS.montserratBold,
    fontSize: 16,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "rgba(77, 92, 45, 0.16)",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  downloadSize: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  installingHint: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    textAlign: "center",
  },
  errorText: {
    color: COLORS.error,
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});

/** Kept separate from RequiredAppUpdateGate: native Store force-update is untouched. */
export function RequiredOtaUpdateGate({ children }: { children: ReactNode }) {
  const authSettled = useAuthStore(s =>
    !s.isLoading && (!s.isAuthenticated || !!s.verifiedSessionEpoch),
  );
  const verifiedUserId = useAuthStore(s =>
    s.isAuthenticated && !s.isLoading && !!s.verifiedSessionEpoch ? s.user?.id ?? null : null,
  );
  const isSignedProduction = !__DEV__ && Updates.isEnabled &&
    Updates.channel === "production" && selfHostedOtaActive();
  const checkRequired = !!verifiedUserId && isSignedProduction;
  const policyQuery = useMandatoryOtaCohortDecision(checkRequired, verifiedUserId);
  const updatesState = Updates.useUpdates();
  const policy = policyQuery.data;
  const requiredRevision = checkRequired && policy && (policyQuery.isSuccess || policyQuery.isError)
    ? requiredOtaRevision({
        required: policy.required, version: policy.version,
        platform: Platform.OS === "ios" ? "ios" : "android", channel: "production",
      }, {
        platform: Platform.OS,
        nativeVersion: Application.nativeApplicationVersion,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        currentRevision: activeOtaRevision(),
        eligible: policy.required,
      }) : null;

  // A signed-in app cannot start a racing background download before its
  // authoritative server cohort/policy decision is known.
  useOtaAutoApply(authSettled && (!checkRequired ||
    (policyQuery.isSuccess && requiredRevision === null)));
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [mainBundleBytes, setMainBundleBytes] = useState<number | null | undefined>(undefined);
  const target = policy?.version;

  useEffect(() => {
    if (requiredRevision === null || !target) return;
    let cancelled = false;
    const key = `${TRIED_PREFIX}${Platform.OS}:${target}`;
    const run = async () => {
      setPhase("checking");
      setError(null);
      setMainBundleBytes(undefined);
      try {
        // Avoid indefinite reload cycles if the published bundle is still below the policy.
        if (attempt === 0 && await AsyncStorage.getItem(key) === "reloaded") {
          throw new Error("Загруженная версия не соответствует требуемой. Попробуйте повторить позже.");
        }
        if (updatesState.isUpdatePending) {
          await AsyncStorage.setItem(key, "reloaded");
          if (cancelled) return;
          setPhase("installing");
          await Updates.reloadAsync();
          return;
        }
        await refreshOtaTesterGrant();
        const result = await Updates.checkForUpdateAsync();
        void trackOtaEvent("CHECKED");
        if (cancelled) return;
        if (!result.isAvailable) {
          throw new Error("Обновление пока недоступно для устройства. Проверьте интернет или обратитесь в поддержку.");
        }
        // HEAD is optional; never wait for it before starting the OTA download.
        void getOtaMainBundleBytes(result.manifest).then(bytes => {
          if (!cancelled) setMainBundleBytes(bytes);
        });
        setPhase("downloading");
        await Updates.fetchUpdateAsync();
        await trackOtaEvent("DOWNLOADED", "manifest" in result ? result.manifest?.id : undefined, undefined, true);
        if (cancelled) return;
        await AsyncStorage.setItem(key, "reloaded");
        setPhase("installing");
        await Updates.reloadAsync();
      } catch (cause) {
        if (cancelled) return;
        setPhase("error");
        setError(cause instanceof Error ? cause.message : "Не удалось скачать обновление. Проверьте интернет и повторите.");
        void trackOtaEvent("UPDATE_ERROR",undefined,"OTHER");
        reportClientError(cause instanceof Error ? cause : new Error(String(cause)), {
          issueKey: "ForcedOTA", keys: { operation: "download_reload", version: target },
        });
      }
    };
    void run();
    return () => { cancelled = true; };
    // Do not rerun on download status notifications from expo-updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredRevision, target, attempt]);

  // Keep the loading gate while the policy is pending. An actual policy error
  // without a confirmed mandatory revision must not lock out a valid app.
  // A cached confirmed mandatory revision still blocks below, including on error.
  // Native minimum-version enforcement is handled by RequiredAppUpdateGate.
  if (checkRequired && !policyQuery.isSuccess && !policyQuery.isError) {
    return <ForceOtaScreen
      version={Application.nativeApplicationVersion ?? "1.7.5"}
      phase="checking"
      error={null}
      mainBundleBytes={undefined}
      retry={() => { void policyQuery.refetch(); }}
    />;
  }
  if (requiredRevision === null || !target) return children;
  return (
    <ForceOtaScreen
      version={target} phase={phase} error={error}
      progress={updatesState.downloadProgress}
      mainBundleBytes={mainBundleBytes}
      retry={() => {
        // Reflect the tap immediately, even when a second network request is slow.
        setError(null);
        setPhase("checking");
        setAttempt(current => current + 1);
      }}
    />
  );
}
