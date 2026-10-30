import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { examApi, type ExamResultData } from "@/shared/lib/api/exam";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { reportClientError } from "@/shared/lib/tracer";
import { canRetakeRejectedExam } from "../lib/examRetake";

const TEST_PASS_THRESHOLD_RATIO = 0.5;
const UNCONFIRMED_EXAM_WRITE =
  "Не удалось подтвердить сдачу теста. Проверьте результат перед повторной отправкой.";

export interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  comment?: string;
}

interface TestQuestionsBlockProps {
  checklist: ChecklistQuestion[];
  userStepId: string;
  stepId: string;
  onComplete?: (answers: Record<string, number>) => void;
}

export function TestQuestionsBlock(props: TestQuestionsBlockProps) {
  // AccordionStep can reuse its child position for a different exam step.
  return <TestQuestionsTarget key={JSON.stringify([
    props.userStepId, props.stepId,
  ])} {...props} />;
}

function TestQuestionsTarget({
  checklist,
  userStepId,
  stepId,
  onComplete,
}: TestQuestionsBlockProps) {
  const active = useRef(true);
  const submitFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [submitUnknown, setSubmitUnknown] = useState(false);

  const loadResult = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await examApi.getResult(userStepId);
      if (!active.current) return;
      if (!res.success) {
        setLoadError(true);
        return;
      }
      setExamResult(res.data ?? null);
      if (res.data?.testAnswers) {
        setAnswers(res.data.testAnswers);
        setIsSubmitted(true);
        setShowResults(true);
      } else {
        // When a POST ACK was lost, a successful authoritative GET with no
        // submitted answers releases the lock but retains this user's draft.
        setIsSubmitted(false);
        setShowResults(false);
      }
      setSubmitUnknown(false);
      setSubmitError(null);
    } catch (error) {
      if (active.current) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TestQuestionsBlock", keys: { operation: "exam_get_result" },
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

  const handleAnswer = (questionId: string, answerIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answerIndex }));
  };

  const getScore = () => {
    let correct = 0;
    checklist.forEach((q) => {
      if (answers[q.id] === q.correctAnswer) correct++;
    });
    return { correct, total: checklist.length };
  };

  const handleSubmit = async () => {
    // A second native press can precede the isSubmitting render.
    if (submitFlight.current || isSubmitting || isLoading || loadError ||
        isSubmitted || submitUnknown || checklist.length === 0 ||
        Object.keys(answers).length !== checklist.length) return;
    const score = getScore();
    if (score.total === 0) return;
    submitFlight.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    const submittedAnswers = { ...answers };
    const overallScore = Math.round((score.correct / score.total) * 100);

    try {
      const res = await examApi.submit({
        userStepId,
        stepId,
        testAnswers: submittedAnswers,
        testScore: score.correct,
        testMaxScore: score.total,
        overallScore,
      });
      if (!active.current) return;
      if (res.success) {
        void hapticFeedback.success();
        setExamResult(null);
        setIsSubmitted(true);
        setShowResults(true);
        onComplete?.(submittedAnswers);
      } else if (res.code === "NETWORK_ERROR" || res.code === "REQUEST_TIMEOUT" ||
          res.code === "UNKNOWN_ERROR") {
        // The Mobile apiClient wraps lost network/timeout ACKs into success:false.
        // Without a request ID, another POST is unsafe until a fresh GET.
        setSubmitUnknown(true);
        setSubmitError(UNCONFIRMED_EXAM_WRITE);
      } else {
        // Explicit server rejection keeps the original manual retry behavior.
        setSubmitError(res.error ?? "Ошибка сохранения");
      }
    } catch (error) {
      if (active.current) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TestQuestionsBlock", keys: { operation: "exam_submit" },
        });
        // No idempotency token is available here. Do not replay an unknown POST.
        setSubmitUnknown(true);
        setSubmitError(UNCONFIRMED_EXAM_WRITE);
      }
    } finally {
      submitFlight.current = false;
      if (active.current) setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setIsSubmitted(false);
    setShowResults(false);
    setSubmitError(null);
    setExamResult((prev) =>
      prev
        ? {
            ...prev,
            testAnswers: null,
            testScore: null,
            testMaxScore: null,
            overallScore: null,
            isPassed: null,
            trainerComment: null,
            reviewedAt: null,
            reviewedById: null,
            reviewedBy: null,
          }
        : prev,
    );
  };

  const score = getScore();
  const autoIsPassed =
    score.total > 0 ? score.correct / score.total > TEST_PASS_THRESHOLD_RATIO : null;
  const isPassed = examResult?.isPassed ?? autoIsPassed;
  const hasAutoResult = isSubmitted && isPassed !== null;
  const hasComment = Boolean(examResult?.trainerComment?.trim());
  const canRetake = canRetakeRejectedExam(examResult) || (isSubmitted && isPassed === false);
  const allAnswered = checklist.length > 0 && Object.keys(answers).length === checklist.length;
  const canSubmit = !isSubmitted && allAnswered && !isSubmitting &&
    !submitUnknown && !isLoading && !loadError;
  const lockedOptions = isSubmitted || isSubmitting || submitUnknown;

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
    return (
      <View style={styles.container}>
        <Text accessibilityRole="alert">Не удалось загрузить результат теста.</Text>
        <Button label="Повторить загрузку" onPress={() => { void loadResult(); }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Тестовые вопросы</Text>

      {hasAutoResult && (
        <View style={[styles.alert, isPassed ? styles.alertSuccess : styles.alertError]}
          accessible accessibilityRole="text" accessibilityLiveRegion="polite"
          accessibilityLabel={[
            isPassed ? "Тест сдан" : "Тест не сдан",
            isPassed
              ? "Правильных ответов больше 50%. Зачёт поставлен автоматически."
              : "Правильных ответов 50% или меньше. Можно пройти тест заново.",
            hasComment ? examResult?.trainerComment?.trim() : null,
          ].filter(Boolean).join(". ")}>
          <MaterialCommunityIcons
            name={isPassed ? "check-circle" : "alert-circle"}
            size={20}
            color={isPassed ? COLORS.success : COLORS.error}
          />
          <Text style={[styles.alertText, styles.alertTitle]}>
            {isPassed ? "Тест сдан" : "Тест не сдан"}
          </Text>
          <Text style={styles.alertComment}>
            {isPassed
              ? "Правильных ответов больше 50%. Зачёт поставлен автоматически."
              : "Правильных ответов 50% или меньше. Можно пройти тест заново."}
          </Text>
          {hasComment && examResult?.trainerComment && (
            <Text style={styles.alertComment}>{examResult.trainerComment}</Text>
          )}
        </View>
      )}

      <ScrollView style={styles.questionsScroll} nestedScrollEnabled>
        {checklist.map((q, idx) => (
          <View key={q.id} style={styles.questionCard}>
            <Text style={styles.questionLabel}>
              Вопрос {idx + 1}: {q.question}
            </Text>
            {q.options.map((opt, optIdx) => {
              const selected = answers[q.id] === optIdx;
              return (
                <Pressable
                  key={optIdx}
                  style={styles.optionRow}
                  onPress={() => {
                    void hapticFeedback.selection();
                    handleAnswer(q.id, optIdx);
                  }}
                  disabled={lockedOptions}
                  accessibilityRole="radio"
                  accessibilityLabel={`Вопрос ${idx + 1}: ${q.question}, ${opt}`}
                  accessibilityState={{ checked: selected, disabled: lockedOptions }}
                >
                  <MaterialCommunityIcons
                    name={selected ? "radiobox-marked" : "radiobox-blank"}
                    size={22}
                    color={selected ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
            {showResults && answers[q.id] !== undefined && (
              <View
                style={[
                  styles.resultBadge,
                  answers[q.id] === q.correctAnswer ? styles.resultCorrect : styles.resultWrong,
                ]}
                accessible accessibilityRole="text" accessibilityLiveRegion="polite"
                accessibilityLabel={[
                  `Вопрос ${idx + 1}: ${q.question}`,
                  answers[q.id] === q.correctAnswer
                    ? "Правильно!"
                    : `Правильный ответ: ${q.options[q.correctAnswer]}`,
                  q.comment ? `Комментарий: ${q.comment}` : null,
                ].filter(Boolean).join(". ")}
              >
                <Text style={styles.resultText}>
                  {answers[q.id] === q.correctAnswer
                    ? "Правильно!"
                    : `Правильный ответ: ${q.options[q.correctAnswer]}`}
                </Text>
                {q.comment && <Text style={styles.commentText}>Комментарий: {q.comment}</Text>}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {submitError && (
        <View style={[styles.alert, styles.alertError]} accessible
          accessibilityRole="alert" accessibilityLiveRegion="assertive"
          accessibilityLabel={submitError}>
          <Text style={styles.alertText}>{submitError}</Text>
        </View>
      )}

      {submitUnknown && (
        <Button label="Проверить результат" onPress={() => { void loadResult(); }}
          disabled={isLoading} accessibilityRole="button"
          accessibilityLabel="Проверить результат теста"
          accessibilityState={{ disabled: isLoading }} />
      )}

      {!isSubmitted ? (
        <Button
          label="ЗАВЕРШИТЬ ТЕСТ"
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
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? "Отправляем тест" : "Завершить тест"}
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        />
      ) : (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreText} accessible accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Результат: ${score.correct} из ${score.total} правильных`}>
            Результат: {score.correct} из {score.total} правильных
          </Text>
          {canRetake && (
            <Pressable style={styles.retakeBtn} onPress={handleReset}
              accessibilityRole="button" accessibilityLabel="Пройти тест заново"
              accessibilityState={{ disabled: false }}>
              <MaterialCommunityIcons name="reload" size={18} color={COLORS.primary} />
              <Text style={styles.retakeBtnText}>ПРОЙТИ ЗАНОВО</Text>
            </Pressable>
          )}
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
  questionsScroll: { maxHeight: 400, marginBottom: SPACING.sm },
  questionCard: {
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  optionText: { fontSize: 14, color: COLORS.text, marginLeft: 8, flex: 1 },
  optionTextSelected: { fontWeight: "600" },
  resultBadge: {
    marginTop: SPACING.xs,
    padding: SPACING.xs,
    borderRadius: 8,
  },
  resultCorrect: { backgroundColor: "rgba(40, 167, 69, 0.15)" },
  resultWrong: { backgroundColor: "rgba(220, 53, 69, 0.15)" },
  resultText: { fontSize: 13, color: COLORS.text },
  commentText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  scoreRow: { marginTop: SPACING.sm, gap: SPACING.sm },
  scoreText: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  retakeBtn: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  retakeBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
});
