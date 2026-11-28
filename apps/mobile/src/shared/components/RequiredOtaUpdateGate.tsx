import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { useOtaCheckOnOpen } from "@/shared/hooks/useOtaCheckOnOpen";
import { refreshOtaTesterGrant, selfHostedOtaActive } from "@/shared/lib/ota/installationIdentity";
import { fetchMandatoryOtaCohortDecision } from "@/shared/lib/ota/mandatoryPolicyQuery";
import { captureOtaSession, type OtaSession } from "@/shared/lib/ota/session";
import { trackOtaEvent, trackOtaLaunch } from "@/shared/lib/ota/telemetry";
import { createMandatoryOtaAttemptMonitor, detectOtaSignatureRejection, retireMandatoryOtaAttemptMarker } from "@/shared/lib/ota/operationalSignals";
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

type ConfirmedOta = { userId: string; epoch: string; generation: number; version: string };

let inFlight: { session: OtaSession; promise: Promise<void> } | undefined;

function runOtaCheck(session: OtaSession, check: () => Promise<void>): Promise<void> {
  if (inFlight) {
    if (
      inFlight.session.generation === session.generation &&
      inFlight.session.epoch === session.epoch &&
      inFlight.session.userId === session.userId
    ) {
      return inFlight.promise;
    }
    return inFlight.promise.then(() => runOtaCheck(session, check));
  }

  const promise = Promise.resolve().then(check).finally(() => { inFlight = undefined; });
  inFlight = { session, promise };
  return promise;
}

export function RequiredOtaUpdateGate({ children }: { children: ReactNode }) {
  const authScope = useAuthStore(s => {
    if (s.isLoading) return null;
    if (!s.isAuthenticated) return "guest";
    return s.verifiedSessionEpoch;
  });
  const userId = useAuthStore(s => s.isAuthenticated ? s.user?.id : null);
  const epoch = useAuthStore(s => s.verifiedSessionEpoch);
  const [confirmed, setConfirmed] = useState<ConfirmedOta | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [mainBundleBytes, setMainBundleBytes] = useState<number | null | undefined>(undefined);
  const mounted = useRef(false);
  const updatesState = Updates.useUpdates();
  const enabled = !__DEV__ && Updates.isEnabled;
  const target = confirmed && confirmed.userId === userId && confirmed.epoch === epoch
    ? confirmed.version : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function requestCheck(manual = false): boolean {
    const session = captureOtaSession();
    if (!session) return false;
    const isCurrent = () => mounted.current && session.isCurrent();
    const confirmedVersion = confirmed && confirmed.userId === session.userId &&
      confirmed.epoch === session.epoch && confirmed.generation === session.generation
      ? confirmed.version : null;
    if (manual && !confirmedVersion) return false;

    void runOtaCheck(session, async () => {
      if (!isCurrent()) return;
      void trackOtaLaunch();

      setPhase("checking");
      setError(null);
      setMainBundleBytes(undefined);

      let requiredTarget = confirmedVersion;
      let updateId: string | undefined;
      let finished = false;
      let failure: "CHECK_FAILED" | "FETCH_FAILED" | "RELOAD_FAILED" = "CHECK_FAILED";
      let nativeCheckStartedAt: number | undefined;
      let mandatoryMonitor: ReturnType<typeof createMandatoryOtaAttemptMonitor> | undefined;
      const diagnosticKey = "@gafus/forced-ota-diagnostic-v1:" + Platform.OS + ":" + (Updates.runtimeVersion ?? "unknown");
      const reportSignature = () => {
        if (nativeCheckStartedAt === undefined) return;
        void detectOtaSignatureRejection({
          startedAt: nativeCheckStartedAt, endedAt: Date.now(), updateId, isCurrent,
          readLogs: age => Updates.readLogEntriesAsync(age),
          report: () => {
            // A rejected manifest ID is not trusted; bind the event only to the verified native release.
            void trackOtaEvent("SIGNATURE_REJECTED");
            reportClientError(new Error("OTA_SIGNATURE_REJECTED"), { issueKey: "OtaSignatureRejected" });
          },
        });
      };
      try {
        if (!manual && session.userId && session.epoch &&
            Updates.channel === "production" && selfHostedOtaActive()) {
          const policy = await fetchMandatoryOtaCohortDecision(session);
          if (!isCurrent()) return;
          const revision = requiredOtaRevision({
            required: policy.required, version: policy.version,
            platform: Platform.OS === "ios" ? "ios" : "android", channel: "production",
          }, {
            platform: Platform.OS,
            nativeVersion: Application.nativeApplicationVersion,
            runtimeVersion: Updates.runtimeVersion,
            channel: Updates.channel,
            currentRevision: activeOtaRevision(),
            eligible: policy.required,
          });
          requiredTarget = revision === null ? null : policy.version;
          setConfirmed(requiredTarget ? {
            userId: session.userId, epoch: session.epoch,
            generation: session.generation, version: requiredTarget,
          } : null);
          if (!requiredTarget) {
            // A verified policy no longer blocks this build. Do not later
            // misclassify a successfully installed or superseded attempt.
            await retireMandatoryOtaAttemptMarker(AsyncStorage, diagnosticKey, isCurrent);
            if (!isCurrent()) return;
          }
        }

        const key = requiredTarget ? `${TRIED_PREFIX}${Platform.OS}:${requiredTarget}` : null;
        if (key && requiredTarget) {
          mandatoryMonitor = createMandatoryOtaAttemptMonitor({
            key: diagnosticKey, target: requiredTarget,
            storage: AsyncStorage, isCurrent,
            emit: event => { void trackOtaEvent(event, undefined, undefined, event === "MANDATORY_ATTEMPT"); },
            reportIncomplete: () => reportClientError(new Error("OTA_MANDATORY_INCOMPLETE"), {
              issueKey: "OtaMandatoryIncomplete",
            }),
          });
          await mandatoryMonitor.start();
          if (!isCurrent()) return;
        }
        // Avoid a reload loop if the bundle remains below the required revision.
        if (key && !manual && await AsyncStorage.getItem(key) === "reloaded") {
          throw new Error("Загруженная версия не соответствует требуемой. Попробуйте повторить позже.");
        }

        if (!isCurrent()) return;
        await refreshOtaTesterGrant(session);
        if (!isCurrent()) return;
        nativeCheckStartedAt = Date.now();
        const result = await Updates.checkForUpdateAsync();
        if (!isCurrent()) return;
        void trackOtaEvent("CHECKED");
        if (!result.isAvailable) {
          if (key) throw new Error("Обновление пока недоступно для устройства. Проверьте интернет или обратитесь в поддержку.");
          reportSignature();
          return;
        }

        updateId = result.manifest?.id;
        if (key) {
          // HEAD is optional; never wait for it before starting the OTA download.
          void getOtaMainBundleBytes(result.manifest).then(bytes => {
            if (!finished && isCurrent()) setMainBundleBytes(bytes);
          });
          setPhase("downloading");
        }
        failure = "FETCH_FAILED";
        await Updates.fetchUpdateAsync();
        if (!isCurrent()) return;
        await trackOtaEvent("DOWNLOADED", updateId, undefined, true);
        if (!isCurrent()) return;
        if (key) {
          await AsyncStorage.setItem(key, "reloaded");
          if (!isCurrent()) return;
          setPhase("installing");
        }
        failure = "RELOAD_FAILED";
        await Updates.reloadAsync();
      } catch (cause) {
        if (!isCurrent()) return;
        const problem = cause instanceof Error ? cause : new Error(String(cause));
        if (requiredTarget) {
          setPhase("error");
          setError(cause instanceof Error ? cause.message : "Не удалось скачать обновление. Проверьте интернет и повторите.");
        }
        mandatoryMonitor?.incomplete();
        // A reload/marker/policy error is not evidence of a native signature failure.
        if (failure !== "RELOAD_FAILED") reportSignature();
        void trackOtaEvent("UPDATE_ERROR", updateId, failure);
        reportClientError(problem, {
          issueKey: requiredTarget ? "ForcedOTA" : "OTAUpdate",
          keys: { operation: "check_fetch_reload", source: manual ? "manual" : "app_open" },
        });
      } finally {
        mandatoryMonitor?.dispose();
        finished = true;
      }
    });

    return true;
  }

  useOtaCheckOnOpen(enabled, authScope, requestCheck);

  if (!target) return children;
  return (
    <ForceOtaScreen
      version={target} phase={phase} error={error}
      progress={updatesState.downloadProgress}
      mainBundleBytes={mainBundleBytes}
      retry={() => { requestCheck(true); }}
    />
  );
}
