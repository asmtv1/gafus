import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSurveyScreeningResult,
  type SurveyAnswerValue,
  type SurveyComparisonDto,
  type SurveyQuestion,
  type SurveyResponseDto,
} from "@gafus/types";

import { MascotSpinner } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { surveyApi } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { zustandStorage } from "@/shared/stores/storage";

type Answers = Record<string, SurveyAnswerValue>;

interface SurveyBlockProps {
  courseId: string;
  stepId: string;
  userStepId?: string | null;
  surveySlug: string;
  onComplete?: () => void;
}

function draftKey(courseId: string, stepId: string, surveySlug: string): string {
  return `survey-draft:${courseId}:${stepId}:${surveySlug}`;
}

function hasAnswer(value: SurveyAnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return typeof value === "boolean";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function QuestionControl({
  question,
  value,
  editable,
  setAnswer,
  toggleMulti,
}: {
  question: SurveyQuestion;
  value: SurveyAnswerValue | undefined;
  editable: boolean;
  setAnswer: (questionId: string, value: SurveyAnswerValue) => void;
  toggleMulti: (questionId: string, value: string) => void;
}) {
  if (question.type === "text" || question.type === "petSelect") {
    return (
      <TextInput
        style={styles.input}
        value={typeof value === "string" ? value : ""}
        onChangeText={(text) => setAnswer(question.id, text)}
        placeholder={question.placeholder}
        placeholderTextColor={COLORS.placeholder}
        editable={editable}
      />
    );
  }

  if (question.type === "textarea") {
    return (
      <TextInput
        style={[styles.input, styles.textArea]}
        value={typeof value === "string" ? value : ""}
        onChangeText={(text) => setAnswer(question.id, text)}
        placeholder={question.placeholder}
        placeholderTextColor={COLORS.placeholder}
        editable={editable}
        multiline
        textAlignVertical="top"
      />
    );
  }

  if (question.type === "singleChoice") {
    return (
      <View style={styles.options}>
        {question.options?.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              style={styles.optionRow}
              onPress={() => {
                void hapticFeedback.selection();
                setAnswer(question.id, option.value);
              }}
              disabled={!editable}
            >
              <MaterialCommunityIcons
                name={selected ? "radiobox-marked" : "radiobox-blank"}
                size={22}
                color={selected ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (question.type === "multiChoice") {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <View style={styles.options}>
        {question.options?.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <Pressable
              key={option.value}
              style={styles.optionRow}
              onPress={() => {
                void hapticFeedback.selection();
                toggleMulti(question.id, option.value);
              }}
              disabled={!editable}
            >
              <MaterialCommunityIcons
                name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                size={22}
                color={selected ? COLORS.primary : COLORS.textSecondary}
              />
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Pressable
      style={styles.optionRow}
      onPress={() => setAnswer(question.id, value !== true)}
      disabled={!editable}
    >
      <MaterialCommunityIcons
        name={value === true ? "checkbox-marked" : "checkbox-blank-outline"}
        size={22}
        color={value === true ? COLORS.primary : COLORS.textSecondary}
      />
      <Text style={styles.optionText}>Да</Text>
    </Pressable>
  );
}

export function SurveyBlock({
  courseId,
  stepId,
  userStepId,
  surveySlug,
  onComplete,
}: SurveyBlockProps) {
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const [answers, setAnswers] = useState<Answers>({});
  const [draftLoaded, setDraftLoaded] = useState(false);

  const surveyQuery = useQuery({
    queryKey: ["survey", surveySlug, stepId],
    queryFn: () => surveyApi.getSurvey(surveySlug, stepId),
    enabled: Boolean(surveySlug && stepId),
  });

  const template = surveyQuery.data?.success ? surveyQuery.data.data?.template ?? null : null;
  const response: SurveyResponseDto | null = surveyQuery.data?.success
    ? surveyQuery.data.data?.response ?? null
    : null;
  const editable = !response || response.canEdit;

  const comparisonQuery = useQuery({
    queryKey: ["surveyComparison", courseId, template?.familySlug],
    queryFn: () => surveyApi.getComparison(courseId, template!.familySlug),
    enabled: template?.phase === "FINAL",
  });
  const comparison: SurveyComparisonDto | null = comparisonQuery.data?.success
    ? comparisonQuery.data.data ?? null
    : null;
  const screeningResult = response
    ? getSurveyScreeningResult(surveySlug, response.answers)
    : null;

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      const raw = await zustandStorage.getItem(draftKey(courseId, stepId, surveySlug));
      if (cancelled) return;
      const draft = raw ? (JSON.parse(raw) as Answers) : {};
      setAnswers(response?.answers ?? draft);
      setDraftLoaded(true);
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [courseId, response, stepId, surveySlug]);

  useEffect(() => {
    if (!template || !editable || !draftLoaded) return;
    void zustandStorage.setItem(draftKey(courseId, stepId, surveySlug), JSON.stringify(answers));
  }, [answers, courseId, draftLoaded, editable, stepId, surveySlug, template]);

  const missingRequired = useMemo(() => {
    if (!template) return [];
    return template.questions.filter(
      (question) => question.required && !hasAnswer(answers[question.id]),
    );
  }, [answers, template]);

  const submitMutation = useMutation({
    mutationFn: () =>
      surveyApi.submit(surveySlug, {
        courseId,
        stepId,
        userStepId: userStepId ?? "",
        answers,
      }),
    onSuccess: async (result) => {
      if (!result.success) return;
      await zustandStorage.removeItem(draftKey(courseId, stepId, surveySlug));
      await queryClient.invalidateQueries({ queryKey: ["survey", surveySlug, stepId] });
      onComplete?.();
    },
  });

  const setAnswer = (questionId: string, value: SurveyAnswerValue) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const toggleMulti = (questionId: string, value: string) => {
    setAnswers((current) => {
      const existing = Array.isArray(current[questionId]) ? (current[questionId] as string[]) : [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      return { ...current, [questionId]: next };
    });
  };

  if (surveyQuery.isLoading || !draftLoaded) {
    return (
      <View style={styles.loadingWrap}>
        <MascotSpinner size="small" />
        <Text style={styles.loadingText}>Загрузка анкеты...</Text>
      </View>
    );
  }

  if (!template) {
    return (
      <View style={styles.alert}>
        <Text style={styles.alertText}>
          {surveyQuery.data?.error ?? "Не удалось загрузить анкету"}
        </Text>
      </View>
    );
  }

  const canSubmit =
    editable &&
    !isOffline &&
    Boolean(userStepId) &&
    missingRequired.length === 0 &&
    !submitMutation.isPending;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{template.title}</Text>
      <Text style={styles.hint}>{template.description}</Text>

      {response && (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            Ответ отправлен: {formatDateTime(response.submittedAt)}.{" "}
            {response.canEdit
              ? `Можно редактировать до ${formatDateTime(response.editableUntil)}.`
              : "Редактирование закрыто."}
          </Text>
        </View>
      )}

      {screeningResult ? (
        <View style={styles.resultCard}>
          <Text style={styles.sectionTitle}>Результат анкеты</Text>
          <Text style={styles.alertText}>{screeningResult}</Text>
        </View>
      ) : null}

      {template.sections.map((section) => {
        const questions = template.questions.filter(
          (question) => question.sectionId === section.id,
        );
        if (questions.length === 0) return null;
        return (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {questions.map((question) => (
              <View key={question.id} style={styles.questionCard}>
                <Text style={styles.questionTitle}>
                  {question.title}
                  {question.required ? " *" : ""}
                </Text>
                {question.description ? (
                  <Text style={styles.questionDescription}>{question.description}</Text>
                ) : null}
                <QuestionControl
                  question={question}
                  value={answers[question.id]}
                  editable={editable}
                  setAnswer={setAnswer}
                  toggleMulti={toggleMulti}
                />
              </View>
            ))}
          </View>
        );
      })}

      {comparison ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Динамика до и после</Text>
          {comparison.items
            .filter((item) => item.changed)
            .slice(0, 8)
            .map((item) => (
              <Text key={item.questionId} style={styles.comparisonText}>
                {item.questionId}: {JSON.stringify(item.before)} {"->"} {JSON.stringify(item.after)}
              </Text>
            ))}
        </View>
      ) : null}

      {isOffline && editable ? (
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            Черновик сохранится на устройстве. Для отправки анкеты нужно подключение к интернету.
          </Text>
        </View>
      ) : null}

      {!submitMutation.data?.success && submitMutation.data?.error ? (
        <View style={[styles.alert, styles.alertError]}>
          <Text style={styles.alertText}>{submitMutation.data.error}</Text>
        </View>
      ) : null}

      {editable ? (
        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={() => submitMutation.mutate()}
          disabled={!canSubmit}
        >
          {submitMutation.isPending ? (
            <MascotSpinner size="small" />
          ) : (
            <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
              ОТПРАВИТЬ АНКЕТУ
            </Text>
          )}
        </Pressable>
      ) : null}
      {missingRequired.length > 0 ? (
        <Text style={styles.caption}>Заполните обязательные поля: {missingRequired.length}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  loadingWrap: {
    alignItems: "center",
    padding: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  questionCard: {
    backgroundColor: COLORS.surface,
    borderColor: "rgba(99, 97, 40, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    gap: SPACING.xs,
    padding: SPACING.sm,
  },
  questionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  questionDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderColor: "rgba(99, 97, 40, 0.25)",
    borderRadius: 10,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 96,
  },
  options: {
    gap: SPACING.xs,
  },
  optionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: SPACING.xs,
    minHeight: 34,
  },
  optionText: {
    color: COLORS.text,
    flex: 1,
    fontSize: 14,
  },
  alert: {
    backgroundColor: "rgba(0, 157, 207, 0.12)",
    borderColor: COLORS.inProgress,
    borderRadius: 10,
    borderWidth: 1,
    padding: SPACING.sm,
  },
  alertError: {
    backgroundColor: "rgba(220, 53, 69, 0.12)",
    borderColor: COLORS.error,
  },
  resultCard: {
    backgroundColor: "rgba(99, 97, 40, 0.08)",
    borderColor: COLORS.primary,
    borderRadius: 10,
    borderWidth: 1,
    gap: SPACING.xs,
    padding: SPACING.sm,
  },
  alertText: {
    color: COLORS.text,
    fontSize: 14,
  },
  comparisonText: {
    color: COLORS.text,
    fontSize: 13,
  },
  submitBtn: {
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.disabled,
    opacity: 0.7,
  },
  submitText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: "700",
  },
  submitTextDisabled: {
    color: COLORS.placeholder,
  },
  caption: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
});
