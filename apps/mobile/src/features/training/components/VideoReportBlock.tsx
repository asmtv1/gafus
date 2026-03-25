import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { getInfoAsync } from "expo-file-system/legacy";

import { VideoPlayer } from "@/shared/components/VideoPlayer";
import { examApi, type ExamResultData } from "@/shared/lib/api/exam";
import { reportClientError } from "@/shared/lib/tracer";
import { COLORS, SPACING } from "@/constants";

const MAX_RECORDING_SEC = 120;
const MAX_CLIENT_BYTES = 50 * 1024 * 1024;

interface VideoReportBlockProps {
  userStepId: string;
  stepId: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ru-RU");
}

function getTrainerName(result: ExamResultData | null): string | null {
  if (!result?.reviewedBy) return null;
  return result.reviewedBy.profile?.fullName || result.reviewedBy.username || null;
}

function pickUploadMimeAndName(uri: string): { name: string; type: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".mov") || lower.includes(".mov")) {
    return { name: `exam-${Date.now()}.mov`, type: "video/quicktime" };
  }
  if (lower.endsWith(".webm")) {
    return { name: `exam-${Date.now()}.webm`, type: "video/webm" };
  }
  return { name: `exam-${Date.now()}.mp4`, type: "video/mp4" };
}

/**
 * Видеоотчёт по экзамену: запись до 120 с, превью, загрузка на API, submit как на вебе.
 */
export function VideoReportBlock({ userStepId, stepId }: VideoReportBlockProps) {
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadResult = useCallback(async () => {
    setIsLoading(true);
    setSubmitError(null);
    try {
      const res = await examApi.getResult(userStepId);
      if (res.success && res.data) {
        setExamResult(res.data);
        setIsSubmitted(Boolean(res.data.videoReportUrl?.trim()));
      }
    } catch (error) {
      reportClientError(error, {
        issueKey: "VideoReportBlock",
        keys: { operation: "exam_video_load" },
      });
    } finally {
      setIsLoading(false);
    }
  }, [userStepId]);

  useEffect(() => {
    void loadResult();
  }, [loadResult]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        // eslint-disable-next-line react-hooks/exhaustive-deps -- при unmount нужен актуальный ref камеры
        cameraRef.current?.stopRecording();
      } catch {
        /* уже остановлена */
      }
    };
  }, []);

  const ensurePermissions = async (): Promise<boolean> => {
    let cam = cameraPermission?.granted === true;
    let mic = micPermission?.granted === true;
    if (!cam) {
      const r = await requestCameraPermission();
      cam = r.granted === true;
    }
    if (!mic) {
      const r = await requestMicPermission();
      mic = r.granted === true;
    }
    if (!cam || !mic) {
      setSubmitError("Нужны доступ к камере и микрофону. Проверьте настройки приложения.");
      return false;
    }
    return true;
  };

  const handleStartRecording = async () => {
    setSubmitError(null);
    const ok = await ensurePermissions();
    if (!ok) return;

    const ref = cameraRef.current;
    if (!ref || !cameraReady) {
      setSubmitError("Камера ещё не готова. Подождите секунду и попробуйте снова.");
      return;
    }

    setLocalVideoUri(null);
    setVideoSize(0);
    setRecordingSec(0);
    setIsRecording(true);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingSec((prev) => Math.min(prev + 1, MAX_RECORDING_SEC));
    }, 1000);

    const finishRecording = async (uri: string | undefined) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setRecordingSec(0);
      if (!uri) {
        setSubmitError("Не удалось получить файл записи. Попробуйте ещё раз.");
        return;
      }
      setLocalVideoUri(uri);
      try {
        const info = await getInfoAsync(uri);
        if (info.exists && "size" in info && typeof info.size === "number") {
          setVideoSize(info.size);
        }
      } catch (error) {
        reportClientError(error, {
          issueKey: "VideoReportBlock",
          keys: { operation: "exam_video_file_info" },
        });
      }
    };

    try {
      const recordingPromise = ref.recordAsync({
        maxDuration: MAX_RECORDING_SEC,
        maxFileSize: MAX_CLIENT_BYTES,
      });
      recordingPromise
        .then((result) => void finishRecording(result?.uri))
        .catch((error) => {
          reportClientError(error, {
            issueKey: "VideoReportBlock",
            keys: { operation: "exam_video_record" },
          });
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsRecording(false);
          setRecordingSec(0);
          setSubmitError("Не удалось записать видео. Попробуйте ещё раз.");
        });
    } catch (error) {
      reportClientError(error, {
        issueKey: "VideoReportBlock",
        keys: { operation: "exam_video_record_start" },
      });
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setSubmitError("Не удалось начать запись. Попробуйте ещё раз.");
    }
  };

  const handleStopRecording = () => {
    try {
      cameraRef.current?.stopRecording();
    } catch (error) {
      reportClientError(error, {
        issueKey: "VideoReportBlock",
        keys: { operation: "exam_video_record_stop" },
      });
    }
  };

  const handleSubmitVideo = async () => {
    if (!localVideoUri) return;
    if (videoSize > MAX_CLIENT_BYTES) {
      setSubmitError(
        `Размер видео (${formatSize(videoSize)}) больше лимита ${formatSize(MAX_CLIENT_BYTES)}. Запишите короче.`,
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setStatusMessage("Загружаем видео на сервер…");

    try {
      const { name, type } = pickUploadMimeAndName(localVideoUri);

      const uploadRes = await examApi.uploadVideo(userStepId, {
        uri: localVideoUri,
        name,
        type,
      });

      if (!uploadRes.success || !uploadRes.data?.videoUrl) {
        throw new Error(uploadRes.error || "Не удалось загрузить видео");
      }

      setStatusMessage("Сохраняем результат экзамена…");
      const submitRes = await examApi.submit({
        userStepId,
        stepId,
        videoReportUrl: uploadRes.data.videoUrl,
        overallScore: 100,
        isPassed: true,
      });

      if (!submitRes.success) {
        throw new Error(submitRes.error || "Не удалось сохранить результат");
      }

      setLocalVideoUri(null);
      setVideoSize(0);
      setIsSubmitted(true);
      setStatusMessage(null);
      await loadResult();
    } catch (error) {
      reportClientError(error, {
        issueKey: "VideoReportBlock",
        keys: { operation: "exam_video_submit" },
      });
      setStatusMessage(null);
      setSubmitError(
        error instanceof Error ? error.message : "Ошибка при сохранении видеоотчёта",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setLocalVideoUri(null);
    setVideoSize(0);
    setSubmitError(null);
    setStatusMessage(null);
    setIsRecording(false);
    setRecordingSec(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isSubmitted) {
      try {
        const res = await examApi.submit({
          userStepId,
          stepId,
          videoReportUrl: null,
          overallScore: undefined,
          isPassed: false,
        });
        if (!res.success) {
          setSubmitError(res.error ?? "Не удалось сбросить видео");
          return;
        }
        setIsSubmitted(false);
        setExamResult((prev) =>
          prev ? { ...prev, videoReportUrl: null } : prev,
        );
        await loadResult();
      } catch (error) {
        reportClientError(error, {
          issueKey: "VideoReportBlock",
          keys: { operation: "exam_video_reset" },
        });
        setSubmitError("Ошибка при сбросе видео. Попробуйте ещё раз.");
      }
    }
  };

  const isReviewed = examResult?.reviewedAt != null;
  const isPassed = examResult?.isPassed === true;
  const hasComment = Boolean(examResult?.trainerComment?.trim());
  const oversized = videoSize > MAX_CLIENT_BYTES;

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Загрузка данных...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Видео отчёт о работе</Text>
      <Text style={styles.hint}>
        Запишите видео, где вы рассказываете о пройденном материале, демонстрируете выполнение
        упражнений или делитесь своими мыслями.
      </Text>

      {isSubmitted && !isReviewed && (
        <View style={[styles.alert, styles.alertInfo]}>
          <Text style={styles.alertText}>
            Ваш видео отчёт сохранен. Ожидайте проверки тренером.
          </Text>
        </View>
      )}

      {isReviewed && (
        <View style={[styles.alert, isPassed ? styles.alertSuccess : styles.alertError]}>
          <MaterialCommunityIcons
            name={isPassed ? "check-circle" : "alert-circle"}
            size={20}
            color={isPassed ? COLORS.success : COLORS.error}
          />
          <View style={styles.alertBody}>
            <Text style={[styles.alertText, styles.alertTitle]}>
              {isPassed ? "Экзамен зачтён" : "Экзамен не зачтён"}
            </Text>
            {hasComment && examResult?.trainerComment && (
              <Text style={styles.alertComment}>{examResult.trainerComment}</Text>
            )}
            {(examResult?.reviewedAt || getTrainerName(examResult)) && (
              <Text style={styles.alertCaption}>
                {[
                  formatDateTime(examResult?.reviewedAt) &&
                    `Проверено: ${formatDateTime(examResult?.reviewedAt)}`,
                  getTrainerName(examResult) && `Тренер: ${getTrainerName(examResult)}`,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </Text>
            )}
          </View>
        </View>
      )}

      {isSubmitted ? (
        <View style={styles.card}>
          <View style={styles.sentPlaceholder}>
            <MaterialCommunityIcons name="cloud-check-outline" size={48} color={COLORS.success} />
            <Text style={styles.sentTitle}>Видео отправлено</Text>
            <Text style={styles.sentSubtitle}>Ожидайте проверки тренером</Text>
          </View>
          <Pressable style={styles.outlineBtn} onPress={handleReset}>
            <MaterialCommunityIcons name="video-outline" size={20} color={COLORS.primary} />
            <Text style={styles.outlineBtnText}>Записать заново</Text>
          </Pressable>
        </View>
      ) : !localVideoUri ? (
        <View style={styles.card}>
          <View style={styles.cameraWrap}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              mode="video"
              mute={false}
              onCameraReady={() => setCameraReady(true)}
            />
          </View>

          {isRecording && (
            <View style={styles.timerRow}>
              <Text
                style={[
                  styles.timerText,
                  recordingSec >= MAX_RECORDING_SEC * 0.9 && styles.timerWarn,
                ]}
              >
                {formatTime(recordingSec)} / {formatTime(MAX_RECORDING_SEC)}
              </Text>
              <Text style={styles.timerCaption}>Максимальная длительность: 2 минуты</Text>
            </View>
          )}

          {!isRecording ? (
            <Pressable style={styles.primaryBtn} onPress={handleStartRecording}>
              <MaterialCommunityIcons name="record-circle" size={22} color={COLORS.surface} />
              <Text style={styles.primaryBtnText}>Начать запись</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.dangerBtn} onPress={handleStopRecording}>
              <MaterialCommunityIcons name="stop-circle" size={22} color={COLORS.surface} />
              <Text style={styles.primaryBtnText}>Остановить запись</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.previewWrap}>
            <VideoPlayer uri={localVideoUri} autoPlay={false} />
          </View>
          {videoSize > 0 && (
            <Text style={[styles.sizeCaption, oversized && styles.sizeError]}>
              Размер видео: {formatSize(videoSize)}
              {oversized ? " — превышен лимит 50 МБ" : ""}
            </Text>
          )}
          <View style={styles.rowBtns}>
            <Pressable
              style={[
                styles.primaryBtn,
                styles.flexBtn,
                styles.primaryBtnInRow,
                (isSubmitting || oversized) && styles.btnDisabled,
              ]}
              onPress={handleSubmitVideo}
              disabled={isSubmitting || oversized}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <>
                  <MaterialCommunityIcons name="cloud-upload" size={20} color={COLORS.surface} />
                  <Text style={styles.primaryBtnText}>Отправить видео</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.outlineBtn, styles.flexBtn, styles.outlineBtnInRow]}
              onPress={handleReset}
              disabled={isSubmitting}
            >
              <Text style={styles.outlineBtnText}>Записать заново</Text>
            </Pressable>
          </View>
        </View>
      )}

      {statusMessage && (
        <View style={[styles.alert, styles.alertInfo]}>
          <Text style={styles.alertText}>{statusMessage}</Text>
        </View>
      )}

      {submitError && (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText}>{submitError}</Text>
        </View>
      )}

      {isSubmitted && (
        <View style={[styles.alert, styles.alertSuccess]}>
          <Text style={styles.alertText}>
            Видео отчёт успешно отправлен и сохранён. Ожидайте проверки тренером.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: SPACING.md },
  loadingWrap: {
    padding: SPACING.md,
    alignItems: "center",
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  hint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  card: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(99, 97, 40, 0.2)",
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  cameraWrap: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: SPACING.sm,
  },
  camera: {
    width: "100%",
    minHeight: 220,
  },
  timerRow: { alignItems: "center", marginBottom: SPACING.sm },
  timerText: {
    fontSize: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: COLORS.primary,
  },
  timerWarn: { color: COLORS.error },
  timerCaption: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  previewWrap: {
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 200,
    marginBottom: SPACING.sm,
  },
  sentPlaceholder: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  sentTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.success,
    marginTop: SPACING.xs,
  },
  sentSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  rowBtns: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  flexBtn: { flex: 1, minWidth: 140 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: SPACING.xs,
  },
  primaryBtnInRow: { marginBottom: 0 },
  outlineBtnInRow: { marginBottom: 0 },
  primaryBtnText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: "600",
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.error,
    paddingVertical: 14,
    borderRadius: 12,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  outlineBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.6 },
  sizeCaption: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  sizeError: { color: COLORS.error },
  alert: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  alertInfo: {
    backgroundColor: "rgba(0, 157, 207, 0.12)",
    borderWidth: 1,
    borderColor: COLORS.inProgress,
  },
  alertSuccess: {
    backgroundColor: "rgba(40, 167, 69, 0.12)",
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  alertError: {
    backgroundColor: "rgba(220, 53, 69, 0.12)",
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  alertBody: { flex: 1 },
  alertText: { fontSize: 14, color: COLORS.text, flex: 1 },
  alertTitle: { fontWeight: "600" },
  alertComment: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  alertCaption: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
