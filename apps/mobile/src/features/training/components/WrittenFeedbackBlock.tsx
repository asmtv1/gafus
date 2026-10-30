import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { examApi, type ExamResultData } from "@/shared/lib/api/exam";
import { reportClientError } from "@/shared/lib/tracer";

const MIN_FEEDBACK_LENGTH = 10;
const UNKNOWN_WRITTEN_WRITE =
  "Не удалось подтвердить сохранение ответа. Проверьте результат перед повторной отправкой.";

interface WrittenFeedbackBlockProps {
  userStepId: string;
  stepId: string;
  onComplete?: () => void;
}

export function WrittenFeedbackBlock(props: WrittenFeedbackBlockProps) {
  return <WrittenFeedbackTarget key={JSON.stringify([
    props.userStepId, props.stepId,
  ])} {...props} />;
}

function WrittenFeedbackTarget({
  userStepId,
  stepId,
  onComplete,
}: WrittenFeedbackBlockProps) {
  const active = useRef(true);
  const submitFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [feedback, setFeedback] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitUnknown, setSubmitUnknown] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);

  const loadResult = useCallback(async () => {
    if (!active.current || submitFlight.current) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await examApi.getResult(userStepId);
      if (!active.current) return;
      if (!res.success || res.data === undefined) {
        setLoadError(true);
        return;
      }
      const result = res.data;
      setExamResult(result);
      if (result?.writtenFeedback) {
        // Preserve the server's text and trainer-reviewed result as authoritative.
        setFeedback(result.writtenFeedback);
        setIsSubmitted(true);
      } else {
        // A confirmed GET with no submitted text releases an ambiguous POST
        // without discarding the user's unsent text or automatically retrying.
        setIsSubmitted(false);
      }
      setSubmitUnknown(false);
      setSubmitError(null);
    } catch (error) {
      if (active.current) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "WrittenFeedbackBlock", keys: { operation: "exam_get_result" },
        });
        setLoadError(true);
      }
    } finally {
      if (active.current) setIsLoading(false);
    }
  }, [userStepId]);

  useEffect(() => {
    void loadResult();
  }, [loadResult]);

  const handleSubmit = async () => {
    const trimmed = feedback.trim();
    if (submitFlight.current || isSubmitting || isLoading || loadError ||
      isSubmitted || examResult?.reviewedAt != null || submitUnknown ||
      trimmed.length < MIN_FEEDBACK_LENGTH) return;
    submitFlight.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await examApi.submit({
        userStepId,
        stepId,
        writtenFeedback: trimmed,
        overallScore: 100,
        isPassed: true,
      });
      if (!active.current) return;
      if (res.success && typeof res.data?.id === "string" && res.data.id.length > 0) {
        setIsSubmitted(true);
        onComplete?.();
      } else if (res.success || res.code === "NETWORK_ERROR" ||
        res.code === "REQUEST_TIMEOUT" || res.code === "UNKNOWN_ERROR" ||
        res.code === "INVALID_RESPONSE" || res.code === "G05_SESSION_CHANGED") {
        // Mobile apiClient returns success:false for lost network/timeouts.
        // No idempotency key is available: only a deliberate GET can unlock.
        setSubmitUnknown(true);
        setSubmitError(UNKNOWN_WRITTEN_WRITE);
      } else {
        setSubmitError(res.error ?? "Ошибка сохранения");
      }
    } catch (error) {
      if (active.current) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "WrittenFeedbackBlock", keys: { operation: "exam_submit" },
        });
        setSubmitUnknown(true);
        setSubmitError(UNKNOWN_WRITTEN_WRITE);
      }
    } finally {
      submitFlight.current = false;
      if (active.current) setIsSubmitting(false);
    }
  };

  const isReviewed = examResult?.reviewedAt != null;
  const isPassed = examResult?.isPassed === true;
  const hasComment = Boolean(examResult?.trainerComment?.trim());
  const locked = isSubmitted || isReviewed || isSubmitting || submitUnknown;
  const canSubmit = !locked && !isLoading && !loadError &&
    feedback.trim().length >= MIN_FEEDBACK_LENGTH;

  if (isLoading) {
    return (
      <Loading
        variant="inline"
        message="Загрузка данных..."
        style={styles.loadingWrap}
      />
    );
  }

  if (loadError) {
    return <View style={styles.container}>
      <Text accessibilityRole="alert">Не удалось загрузить письменный ответ.</Text>
      <Button label="Повторить загрузку" accessibilityLabel="Повторить загрузку"
        onPress={() => { void loadResult(); }} />
    </View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Письменная обратная связь</Text>
      <Text style={styles.hint}>
        Пожалуйста, напишите ваши мысли о пройденном материале, что вы поняли, какие у вас есть
        вопросы или комментарии.
      </Text>

      {isSubmitted && !isReviewed && (
        <View style={[styles.alert, styles.alertInfo]}
          accessible accessibilityRole="text" accessibilityLiveRegion="polite"
          accessibilityLabel="Ответ сохранён. Ожидайте проверки тренером.">
          <Text style={styles.alertText}>
            Ваша обратная связь сохранена. Ожидайте проверки тренером.
          </Text>
        </View>
      )}

      {isReviewed && (
        <View style={[styles.alert, isPassed ? styles.alertSuccess : styles.alertError]}
          accessible accessibilityRole="text" accessibilityLiveRegion="polite"
          accessibilityLabel={isPassed ? "Экзамен зачтён" : "Экзамен не зачтён"}>
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
          accessible
          accessibilityLabel="Письменная обратная связь"
          accessibilityHint="Минимум 10 символов. Опишите ваши мысли о пройденном материале."
          accessibilityState={{ disabled: locked }}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          editable={!locked}
        />
        <Text style={styles.caption}>Минимум 10 символов</Text>
      </View>

      {submitError && (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText} accessibilityRole="alert">{submitError}</Text>
        </View>
      )}

      {submitUnknown && <Button
        label="Проверить сохранённый ответ"
        accessibilityLabel="Проверить сохранённый ответ"
        disabled={isSubmitting || isLoading}
        onPress={() => { void loadResult(); }}
      />}

      {!isSubmitted && !isReviewed ? (
        <Button
          label="ОТПРАВИТЬ ОБРАТНУЮ СВЯЗЬ"
          accessibilityLabel="Отправить письменную обратную связь"
          accessibilityHint="Доступно после ввода минимум 10 символов"
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
          height={46}
          fontFamily={null}
          fontWeight="600"
          fontSize={14}
          lineHeight={18}
          horizontalPadding={20}
          verticalPadding={14}
          borderRadius={12}
          loading={isSubmitting}
          onPress={() => { void handleSubmit(); }}
          disabled={!canSubmit}
        />
      ) : !isReviewed ? (
        <View style={[styles.alert, styles.alertSuccess]}
          accessible accessibilityRole="text" accessibilityLiveRegion="polite"
          accessibilityLabel="Обратная связь успешно отправлена">
          <Text style={styles.alertText}>Обратная связь успешно отправлена!</Text>
        </View>
      ) : null}
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
