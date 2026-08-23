import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING } from "@/shared/config";
import { Button, MascotSpinner } from "@/shared/components/ui";
import { examApi, type ExamResultData } from "@/shared/lib/api/exam";

const MIN_FEEDBACK_LENGTH = 10;

interface WrittenFeedbackBlockProps {
  userStepId: string;
  stepId: string;
  onComplete?: () => void;
}

export function WrittenFeedbackBlock({
  userStepId,
  stepId,
  onComplete,
}: WrittenFeedbackBlockProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);

  const loadResult = useCallback(async () => {
    setIsLoading(true);
    setSubmitError(null);
    const res = await examApi.getResult(userStepId);
    setIsLoading(false);
    if (res.success && res.data) {
      setExamResult(res.data);
      if (res.data.writtenFeedback) {
        setFeedback(res.data.writtenFeedback);
        setIsSubmitted(true);
      }
    }
  }, [userStepId]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  const handleSubmit = async () => {
    const trimmed = feedback.trim();
    if (trimmed.length < MIN_FEEDBACK_LENGTH) return;

    setIsSubmitting(true);
    setSubmitError(null);
    const res = await examApi.submit({
      userStepId,
      stepId,
      writtenFeedback: trimmed,
      overallScore: 100,
      isPassed: true,
    });
    setIsSubmitting(false);

    if (res.success) {
      setIsSubmitted(true);
      onComplete?.();
    } else {
      setSubmitError(res.error ?? "Ошибка сохранения");
    }
  };

  const isReviewed = examResult?.reviewedAt != null;
  const isPassed = examResult?.isPassed === true;
  const hasComment = Boolean(examResult?.trainerComment?.trim());
  const canSubmit = !isSubmitted && feedback.trim().length >= MIN_FEEDBACK_LENGTH && !isSubmitting;

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <MascotSpinner size="small" />
        <Text style={styles.loadingText}>Загрузка данных...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Письменная обратная связь</Text>
      <Text style={styles.hint}>
        Пожалуйста, напишите ваши мысли о пройденном материале, что вы поняли, какие у вас есть
        вопросы или комментарии.
      </Text>

      {isSubmitted && !isReviewed && (
        <View style={[styles.alert, styles.alertInfo]}>
          <Text style={styles.alertText}>
            Ваша обратная связь сохранена. Ожидайте проверки тренером.
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
          <Text style={[styles.alertText, styles.alertTitle]}>
            {isPassed ? "Экзамен зачтён" : "Экзамен не зачтён"}
          </Text>
          {hasComment && examResult?.trainerComment && (
            <Text style={styles.alertComment}>{examResult.trainerComment}</Text>
          )}
        </View>
      )}

      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={feedback}
          onChangeText={setFeedback}
          placeholder="Введите вашу обратную связь..."
          placeholderTextColor={COLORS.placeholder}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          editable={!isSubmitted}
        />
        <Text style={styles.caption}>Минимум 10 символов</Text>
      </View>

      {submitError && (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText}>{submitError}</Text>
        </View>
      )}

      {!isSubmitted ? (
        <Button
          label="ОТПРАВИТЬ ОБРАТНУЮ СВЯЗЬ"
          height={46}
          fontFamily={null}
          fontWeight="600"
          fontSize={14}
          lineHeight={18}
          horizontalPadding={20}
          verticalPadding={14}
          borderRadius={12}
          loading={isSubmitting}
          onPress={handleSubmit}
          disabled={!canSubmit}
        />
      ) : (
        <View style={[styles.alert, styles.alertSuccess]}>
          <Text style={styles.alertText}>Обратная связь успешно отправлена!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
  },
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
  alertText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  alertTitle: {
    fontWeight: "600",
  },
  alertComment: {
    fontSize: 14,
    color: COLORS.text,
    width: "100%",
    marginTop: SPACING.xs,
    paddingLeft: 0,
  },
  inputWrap: {
    marginBottom: SPACING.sm,
  },
  input: {
    minHeight: 120,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(99, 97, 40, 0.2)",
    backgroundColor: COLORS.surface,
    fontSize: 14,
    color: COLORS.text,
  },
  caption: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
