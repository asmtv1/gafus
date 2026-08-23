import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING } from "@/shared/config";
import { Button, MascotSpinner } from "@/shared/components/ui";
import { examApi, type ExamResultData } from "@/shared/lib/api/exam";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { canRetakeRejectedExam } from "../lib/examRetake";

const TEST_PASS_THRESHOLD_RATIO = 0.5;

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

export function TestQuestionsBlock({
  checklist,
  userStepId,
  stepId,
  onComplete,
}: TestQuestionsBlockProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [examResult, setExamResult] = useState<ExamResultData | null>(null);

  const loadResult = useCallback(async () => {
    setIsLoading(true);
    setSubmitError(null);
    const res = await examApi.getResult(userStepId);
    setIsLoading(false);
    if (res.success && res.data?.testAnswers) {
      setExamResult(res.data);
      setAnswers(res.data.testAnswers);
      setIsSubmitted(true);
      setShowResults(true);
    } else if (res.success && res.data) {
      setExamResult(res.data);
    }
  }, [userStepId]);

  useEffect(() => {
    loadResult();
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
    const score = getScore();
    if (score.correct + score.total === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    const overallScore = Math.round((score.correct / score.total) * 100);

    const res = await examApi.submit({
      userStepId,
      stepId,
      testAnswers: answers,
      testScore: score.correct,
      testMaxScore: score.total,
      overallScore,
    });
    setIsSubmitting(false);

    if (res.success) {
      void hapticFeedback.success();
      setExamResult(null);
      setIsSubmitted(true);
      setShowResults(true);
      onComplete?.(answers);
    } else {
      setSubmitError(res.error ?? "Ошибка сохранения");
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
  const canSubmit = !isSubmitted && allAnswered && !isSubmitting;

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
      <Text style={styles.title}>Тестовые вопросы</Text>

      {hasAutoResult && (
        <View style={[styles.alert, isPassed ? styles.alertSuccess : styles.alertError]}>
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
                  disabled={isSubmitted}
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
              >
                <Text style={styles.resultText}>
                  {answers[q.id] === q.correctAnswer
                    ? "Правильно!"
                    : `Правильный ответ: ${q.options[q.correctAnswer]}`}
                </Text>
                {q.comment && (
                  <Text style={styles.commentText}>Комментарий: {q.comment}</Text>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {submitError && (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText}>{submitError}</Text>
        </View>
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
        />
      ) : (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreText}>
            Результат: {score.correct} из {score.total} правильных
          </Text>
          {canRetake && (
            <Pressable style={styles.retakeBtn} onPress={handleReset}>
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
