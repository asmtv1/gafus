import { useEffect, useMemo, useRef, useState } from "react";
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

import { Button, Loading } from "@/shared/components/ui";
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

/** Display only known template titles/option labels; never surface opaque old IDs. */
function formatComparisonAnswer(value: SurveyAnswerValue, question?: SurveyQuestion): string {
  if (value === null || (Array.isArray(value) && value.length === 0)) return "Нет ответа";
  if (!question) return "Ответ из предыдущей анкеты";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  const formatOption = (optionValue: string) =>
    question.options?.find((option) => option.value === optionValue)?.label ?? "Неизвестный вариант";
  if (Array.isArray(value)) return value.map(formatOption).join(", ");
  if (question.type === "singleChoice" || question.type === "multiChoice") {
    return formatOption(value);
  }
  return value.trim() || "Нет ответа";
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
  const questionName = question.title + (question.required ? ", обязательный вопрос" : "");
  if (question.type === "text" || question.type === "petSelect") {
    return (
      <TextInput
        style={styles.input}
        value={typeof value === "string" ? value : ""}
        onChangeText={(text) => setAnswer(question.id, text)}
        placeholder={question.placeholder}
        placeholderTextColor={COLORS.placeholder}
        editable={editable}
        accessibilityLabel={questionName}
        accessibilityHint={question.description}
        accessibilityState={{ disabled: !editable }}
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
        accessibilityLabel={questionName}
        accessibilityHint={question.description}
        accessibilityState={{ disabled: !editable }}
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
              accessibilityRole="radio"
              accessibilityLabel={`${questionName}, ${option.label}`}
              accessibilityHint={question.description}
              accessibilityState={{ checked: selected, disabled: !editable }}
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
              accessibilityRole="checkbox"
              accessibilityLabel={`${questionName}, ${option.label}`}
              accessibilityHint={question.description}
              accessibilityState={{ checked: selected, disabled: !editable }}
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
      accessibilityRole="checkbox"
      accessibilityLabel={`${questionName}, Да`}
      accessibilityHint={question.description}
      accessibilityState={{ checked: value === true, disabled: !editable }}
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
  const retryReadFlight = useRef(false);
  // Separate submit flight: two native press events can precede isPending.
  const submitFlight = useRef(false);

  const surveyQuery = useQuery({
    queryKey: ["survey", surveySlug, stepId],
    queryFn: () => surveyApi.getSurvey(surveySlug, stepId),
    enabled: Boolean(surveySlug && stepId),
  });

  const template = surveyQuery.data?.success ? (surveyQuery.data.data?.template ?? null) : null;
  const response: SurveyResponseDto | null = surveyQuery.data?.success
    ? (surveyQuery.data.data?.response ?? null)
    : null;
  const editable = !response || response.canEdit;
  // The mobile API returns SESSION_EXPIRED or G05_SESSION_CHANGED for a
  // retired session. A manual GET must not silently bypass either fence.
  const readTerminal = surveyQuery.data?.code === "SESSION_EXPIRED" ||
    surveyQuery.data?.code === "G05_SESSION_CHANGED";
  const readFailed = surveyQuery.isError || (surveyQuery.isSuccess &&
    (surveyQuery.data?.success !== true || !template));
  const readReady = surveyQuery.isSuccess && !surveyQuery.isFetching &&
    surveyQuery.data?.success === true && !!template;
  const readErrorMessage = surveyQuery.data?.error?.trim() || "Не удалось загрузить анкету";
  const retryRead = () => {
    if (!surveySlug || !stepId || readTerminal || retryReadFlight.current ||
      surveyQuery.isFetching) return;
    retryReadFlight.current = true;
    void surveyQuery.refetch().catch(() => undefined).finally(() => {
      retryReadFlight.current = false;
    });
  };

  const comparisonQuery = useQuery({
    queryKey: ["surveyComparison", courseId, template?.familySlug],
    queryFn: () => surveyApi.getComparison(courseId, template!.familySlug),
    enabled: template?.phase === "FINAL",
    // A terminal code in a thrown error must never trigger another GET.
    // Other failures are retried only by the existing visible manual control.
    retry: false,
  });
  const comparisonResponse = comparisonQuery.data;
  const comparison: SurveyComparisonDto | null | undefined = comparisonResponse?.success
    ? comparisonResponse.data
    : undefined;
  const comparisonValid = comparison === null ||
    (comparison !== undefined && Array.isArray(comparison.items));
  const changedItems = comparison && comparisonValid
    ? comparison.items.filter((item) => item.changed).slice(0, 8)
    : [];
  const comparisonError = comparisonQuery.isError ||
    (comparisonQuery.isSuccess &&
      (comparisonResponse?.success !== true || !comparisonValid));
  // Both typed thrown failures and ApiResponse failures carry existing codes.
  // Never render the remote error string, including in accessibility labels.
  const thrownComparisonCode = comparisonQuery.error &&
    typeof comparisonQuery.error === "object" && "code" in comparisonQuery.error
    ? comparisonQuery.error.code : null;
  const comparisonTerminal = comparisonResponse?.code === "SESSION_EXPIRED" ||
    comparisonResponse?.code === "G05_SESSION_CHANGED" ||
    thrownComparisonCode === "SESSION_EXPIRED" ||
    thrownComparisonCode === "G05_SESSION_CHANGED";
  const comparisonErrorMessage = comparisonTerminal
    ? "Сессия изменилась или истекла. Войдите снова, чтобы увидеть сравнение."
    : "Не удалось загрузить сравнение анкет. Попробуйте повторить загрузку.";
  const screeningResult = response ? getSurveyScreeningResult(surveySlug, response.answers) : null;

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

  if (surveyQuery.isLoading || !draftLoaded || (surveyQuery.isFetching && !!template)) {
    return (
      <Loading
        variant="inline"
        message="Загрузка анкеты..."
        style={styles.loadingWrap}
      />
    );
  }

  if (readFailed || !template) {
    return (
      <View style={styles.alert}>
        <View accessible accessibilityRole="alert"
          accessibilityLiveRegion="assertive" accessibilityLabel={readErrorMessage}>
          <Text style={styles.alertText}>{readErrorMessage}</Text>
        </View>
        {!readTerminal && surveySlug && stepId ? (
          <Pressable accessibilityRole="button"
            accessibilityLabel="Повторить загрузку анкеты"
            accessibilityState={{
              disabled: surveyQuery.isFetching, busy: surveyQuery.isFetching,
            }}
            disabled={surveyQuery.isFetching}
            onPress={retryRead}>
            <Text style={styles.alertText}>
              {surveyQuery.isFetching ? "Загружаем анкету…" : "Повторить загрузку анкеты"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const canSubmit =
    readReady &&
    editable &&
    !isOffline &&
    Boolean(userStepId) &&
    missingRequired.length === 0 &&
    !submitMutation.isPending;

  const submitFailureMessage = submitMutation.data?.success === false
    ? submitMutation.data.code === "SURVEY_EDIT_WINDOW_EXPIRED"
      ? "Срок редактирования анкеты истёк. Изменения больше нельзя отправить."
      : submitMutation.data.code === "SESSION_EXPIRED" ||
          submitMutation.data.code === "G05_SESSION_CHANGED"
        ? "Сессия истекла или изменилась. Войдите снова, чтобы отправить анкету."
        : "Не удалось отправить анкету. Попробуйте ещё раз."
    : null;

  const submit = () => {
    // Recheck all original permissions/readiness even if the native disabled
    // prop has not painted yet or its handler is invoked directly.
    if (submitFlight.current || !canSubmit) return;
    submitFlight.current = true;
    void submitMutation.mutateAsync().catch(() => undefined).finally(() => {
      submitFlight.current = false;
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{template.title}</Text>
      <Text style={styles.hint}>{template.description}</Text>

      {response && (
        <View style={styles.alert} accessible accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Ответ отправлен: ${formatDateTime(response.submittedAt)}. ${
            response.canEdit
              ? `Можно редактировать до ${formatDateTime(response.editableUntil)}.`
              : "Редактирование закрыто."
          }`}>
          <Text style={styles.alertText}>
            Ответ отправлен: {formatDateTime(response.submittedAt)}.{" "}
            {response.canEdit
              ? `Можно редактировать до ${formatDateTime(response.editableUntil)}.`
              : "Редактирование закрыто."}
          </Text>
        </View>
      )}

      {screeningResult ? (
        <View style={styles.resultCard} accessible accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Результат анкеты. ${screeningResult}`}>
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

      {template.phase === "FINAL" ? (
        <View style={styles.section} accessible accessibilityLabel="Динамика до и после">
          <Text style={styles.sectionTitle}>Динамика до и после</Text>
          {comparisonQuery.isPending || comparisonQuery.isFetching ? (
            <View accessible accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel="Загружаем сравнение анкет">
              <Text style={styles.comparisonText}>Загружаем сравнение анкет…</Text>
            </View>
          ) : comparisonError ? (
            <View style={[styles.alert, styles.alertError]} accessible
              accessibilityRole="alert" accessibilityLiveRegion="assertive"
              accessibilityLabel={comparisonErrorMessage}>
              <Text style={styles.alertText}>{comparisonErrorMessage}</Text>
              {!comparisonTerminal ? (
                <Pressable accessibilityRole="button"
                  accessibilityLabel="Повторить загрузку сравнения"
                  onPress={() => {
                    if (comparisonQuery.isFetching) return;
                    void comparisonQuery.refetch();
                  }}>
                  <Text style={styles.comparisonText}>Повторить загрузку сравнения</Text>
                </Pressable>
              ) : null}
            </View>
          ) : comparison === null ? (
            <Text style={styles.comparisonText} accessibilityLiveRegion="polite">
              Недостаточно двух анкет для сравнения: нужны ответы до и после.
            </Text>
          ) : changedItems.length === 0 ? (
            <Text style={styles.comparisonText} accessibilityLiveRegion="polite">
              Изменений в ответах нет.
            </Text>
          ) : changedItems.map((item, index) => {
            const question = template.questions.find((entry) => entry.id === item.questionId);
            const label = question?.title || "Вопрос из предыдущей анкеты";
            const before = formatComparisonAnswer(item.before, question);
            const after = formatComparisonAnswer(item.after, question);
            return (
              <View key={`${item.questionId}-${index}`} style={styles.questionCard} accessible
                accessibilityRole="text"
                accessibilityLabel={`${label}. До: ${before}. После: ${after}.`}>
                <Text style={styles.questionTitle}>{label}</Text>
                <Text style={styles.comparisonText}>До: {before}</Text>
                <Text style={styles.comparisonText}>После: {after}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {isOffline && editable ? (
        <View style={styles.alert} accessible accessibilityLiveRegion="polite"
          accessibilityLabel="Черновик сохранится на устройстве. Для отправки анкеты нужно подключение к интернету.">
          <Text style={styles.alertText}>
            Черновик сохранится на устройстве. Для отправки анкеты нужно подключение к интернету.
          </Text>
        </View>
      ) : null}

      {submitFailureMessage ? (
        <View style={[styles.alert, styles.alertError]} accessible
          accessibilityRole="alert" accessibilityLiveRegion="assertive"
          accessibilityLabel={submitFailureMessage}>
          <Text style={styles.alertText}>{submitFailureMessage}</Text>
        </View>
      ) : null}
      {submitMutation.isError ? (
        <View style={[styles.alert, styles.alertError]} accessible
          accessibilityRole="alert" accessibilityLiveRegion="assertive"
          accessibilityLabel="Не удалось отправить анкету.">
          <Text style={styles.alertText}>Не удалось отправить анкету.</Text>
        </View>
      ) : null}

      {editable ? (
        <Button
          label="ОТПРАВИТЬ АНКЕТУ"
          accessibilityLabel={submitMutation.isPending ? "Отправка анкеты" : "Отправить анкету"}
          accessibilityHint={missingRequired.length > 0
            ? `Заполните обязательные поля: ${missingRequired.length}`
            : isOffline ? "Для отправки нужно подключение к интернету" : undefined}
          accessibilityState={{ disabled: !canSubmit, busy: submitMutation.isPending }}
          height={46}
          fontFamily={null}
          fontWeight="700"
          fontSize={14}
          lineHeight={18}
          horizontalPadding={20}
          verticalPadding={14}
          borderRadius={12}
          loading={submitMutation.isPending}
          onPress={submit}
          disabled={!canSubmit}
        />
      ) : null}
      {missingRequired.length > 0 ? (
        <Text style={styles.caption} accessibilityRole="alert"
          accessibilityLiveRegion="polite">
          Заполните обязательные поля: {missingRequired.length}
        </Text>
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
  caption: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
});
