import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { examApi, type ExamResultData } from "@/shared/lib/api/exam";
import { COLORS, SPACING } from "@/constants";

interface VideoReportBlockProps {
  userStepId: string;
  stepId: string;
}

/**
 * Блок видеообратной связи по экзамену.
 * Запись и загрузка видео в мобильном приложении не реализованы — доступны в веб-версии.
 * Показываем статус проверки (зачтён/не зачтён) и подсказку про веб.
 */
export function VideoReportBlock({ userStepId }: VideoReportBlockProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);

  const loadResult = useCallback(async () => {
    setIsLoading(true);
    const res = await examApi.getResult(userStepId);
    setIsLoading(false);
    if (res.success && res.data) {
      setExamResult(res.data);
    }
  }, [userStepId]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  const isReviewed = examResult?.reviewedAt != null;
  const isPassed = examResult?.isPassed === true;
  const hasVideo = Boolean(examResult?.videoReportUrl?.trim());
  const hasComment = Boolean(examResult?.trainerComment?.trim());

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
      <Text style={styles.title}>Видеообратная связь</Text>
      <View style={[styles.alert, styles.alertInfo]}>
        <MaterialCommunityIcons name="video-outline" size={20} color={COLORS.inProgress} />
        <Text style={styles.alertText}>
          Запись и отправка видеоэкзамена доступны в веб-версии. Откройте этот шаг в браузере, чтобы
          записать и загрузить видео.
        </Text>
      </View>
      {hasVideo && (
        <View style={[styles.alert, styles.alertSuccess]}>
          <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.success} />
          <Text style={styles.alertText}>Видео загружено и ожидает проверки тренером.</Text>
        </View>
      )}
      {isReviewed && (
        <View style={[styles.alert, isPassed ? styles.alertSuccess : styles.alertError]}>
          <MaterialCommunityIcons
            name={isPassed ? "check-circle" : "alert-circle"}
            size={20}
            color={isPassed ? COLORS.success : COLORS.error}
          />
          <Text style={[styles.alertText, styles.alertTitle]}>
            {isPassed ? "Экзамен зачтён" : "Экзамен не зачтён"}
          </Text>
          {hasComment && examResult?.trainerComment && (
            <Text style={styles.alertComment}>{examResult.trainerComment}</Text>
          )}
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
    marginBottom: SPACING.sm,
  },
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
  alertText: { fontSize: 14, color: COLORS.text, flex: 1 },
  alertTitle: { fontWeight: "600" },
  alertComment: { fontSize: 14, color: COLORS.text, width: "100%", marginTop: SPACING.xs },
});
