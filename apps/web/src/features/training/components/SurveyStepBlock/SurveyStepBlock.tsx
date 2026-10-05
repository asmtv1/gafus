"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCSRFStore } from "@gafus/csrf";
import {
  getSurveyScreeningResult,
  type SurveyAnswerValue,
  type SurveyComparisonDto,
  type SurveyResponseDto,
  type SurveyTemplate,
} from "@gafus/types";

import styles from "../AccordionStep/AccordionStep.module.css";

type Answers = Record<string, SurveyAnswerValue>;

interface SurveyStepBlockProps {
  courseId: string;
  stepId: string;
  userStepId?: string;
  surveySlug: string;
  onComplete: () => void;
}

interface SurveyLoadData {
  template: SurveyTemplate;
  response: SurveyResponseDto | null;
}

function draftKey(courseId: string, stepId: string, surveySlug: string): string {
  return `survey-draft:${courseId}:${stepId}:${surveySlug}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function hasAnswer(value: SurveyAnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return typeof value === "boolean";
}

function getStringAnswer(answers: Answers, questionId: string): string {
  const value = answers[questionId];
  return typeof value === "string" ? value : "";
}

export function SurveyStepBlock({
  courseId,
  stepId,
  userStepId,
  surveySlug,
  onComplete,
}: SurveyStepBlockProps) {
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [data, setData] = useState<SurveyLoadData | null>(null);
  const [comparison, setComparison] = useState<SurveyComparisonDto | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfLoading, csrfToken, fetchToken]);

  useEffect(() => {
    let cancelled = false;
    async function loadSurvey() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/surveys/${encodeURIComponent(surveySlug)}?stepId=${encodeURIComponent(stepId)}`,
          { cache: "no-store" },
        );
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Не удалось загрузить анкету");
        }
        if (cancelled) return;
        const loaded = json.data as SurveyLoadData;
        setData(loaded);
        const savedDraft = window.localStorage.getItem(draftKey(courseId, stepId, surveySlug));
        const draftAnswers = savedDraft ? (JSON.parse(savedDraft) as Answers) : null;
        setAnswers(loaded.response?.answers ?? draftAnswers ?? {});

        if (loaded.template.phase === "FINAL") {
          const comparisonResponse = await fetch(
            `/api/v1/surveys/comparison?courseId=${encodeURIComponent(courseId)}&familySlug=${encodeURIComponent(loaded.template.familySlug)}`,
            { cache: "no-store" },
          );
          const comparisonJson = await comparisonResponse.json();
          if (!cancelled && comparisonResponse.ok && comparisonJson.success) {
            setComparison(comparisonJson.data ?? null);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить анкету");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadSurvey();
    return () => {
      cancelled = true;
    };
  }, [courseId, stepId, surveySlug]);

  const canEdit = !data?.response || data.response.canEdit;
  const template = data?.template ?? null;
  const screeningResult = data?.response
    ? getSurveyScreeningResult(surveySlug, data.response.answers)
    : null;

  useEffect(() => {
    if (!template || !canEdit) return;
    window.localStorage.setItem(draftKey(courseId, stepId, surveySlug), JSON.stringify(answers));
  }, [answers, canEdit, courseId, stepId, surveySlug, template]);

  const missingRequired = useMemo(() => {
    if (!template) return [];
    return template.questions.filter((question) => question.required && !hasAnswer(answers[question.id]));
  }, [answers, template]);

  const setAnswer = useCallback((questionId: string, value: SurveyAnswerValue) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }, []);

  const toggleMulti = useCallback((questionId: string, value: string) => {
    setAnswers((current) => {
      const existing = Array.isArray(current[questionId]) ? (current[questionId] as string[]) : [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      return { ...current, [questionId]: next };
    });
  }, []);

  const handleSubmit = async () => {
    if (!template || !userStepId || missingRequired.length > 0 || !csrfToken) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/surveys/${encodeURIComponent(surveySlug)}/response`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ courseId, stepId, userStepId, answers }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Не удалось сохранить анкету");
      }
      window.localStorage.removeItem(draftKey(courseId, stepId, surveySlug));
      setData((current) =>
        current ? { ...current, response: json.response as SurveyResponseDto } : current,
      );
      onComplete();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить анкету");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.stepInfo}>
        <LoadingState message="Загрузка анкеты…" />
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className={styles.stepInfo}>
        <div className={styles.cardSection}>{error}</div>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className={styles.stepInfo}>
      <div>
        <div className={styles.sectionTitle}>{template.title}</div>
        <div className={styles.cardSection}>
          <p>{template.description}</p>
          {data?.response && (
            <p>
              Ответ отправлен: {formatDateTime(data.response.submittedAt)}.{" "}
              {data.response.canEdit
                ? `Можно редактировать до ${formatDateTime(data.response.editableUntil)}.`
                : "Редактирование закрыто."}
            </p>
          )}

          {screeningResult && (
            <section>
              <h4>Результат анкеты</h4>
              <p>{screeningResult}</p>
            </section>
          )}

          {template.sections.map((section) => {
            const questions = template.questions.filter((question) => question.sectionId === section.id);
            if (questions.length === 0) return null;
            return (
              <section key={section.id}>
                <h4>{section.title}</h4>
                {questions.map((question) => (
                  <div key={question.id} style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      {question.title}
                      {question.required ? " *" : ""}
                    </label>
                    {question.description && <p>{question.description}</p>}
                    {(question.type === "text" || question.type === "petSelect") && (
                      <input
                        value={getStringAnswer(answers, question.id)}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        placeholder={question.placeholder}
                        disabled={!canEdit}
                        style={{ width: "100%", padding: 10 }}
                      />
                    )}
                    {question.type === "textarea" && (
                      <textarea
                        value={getStringAnswer(answers, question.id)}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        placeholder={question.placeholder}
                        disabled={!canEdit}
                        rows={4}
                        style={{ width: "100%", padding: 10 }}
                      />
                    )}
                    {question.type === "singleChoice" && (
                      <div>
                        {question.options?.map((option) => (
                          <label key={option.value} style={{ display: "block", marginBottom: 6 }}>
                            <input
                              type="radio"
                              name={question.id}
                              checked={answers[question.id] === option.value}
                              onChange={() => setAnswer(question.id, option.value)}
                              disabled={!canEdit}
                            />{" "}
                            {option.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {question.type === "multiChoice" && (
                      <div>
                        {question.options?.map((option) => (
                          <label key={option.value} style={{ display: "block", marginBottom: 6 }}>
                            <input
                              type="checkbox"
                              checked={Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.value)}
                              onChange={() => toggleMulti(question.id, option.value)}
                              disabled={!canEdit}
                            />{" "}
                            {option.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {question.type === "boolean" && (
                      <label>
                        <input
                          type="checkbox"
                          checked={answers[question.id] === true}
                          onChange={(event) => setAnswer(question.id, event.target.checked)}
                          disabled={!canEdit}
                        />{" "}
                        Да
                      </label>
                    )}
                  </div>
                ))}
              </section>
            );
          })}

          {comparison && (
            <section>
              <h4>Динамика до и после</h4>
              {comparison.items.filter((item) => item.changed).slice(0, 8).map((item) => (
                <p key={item.questionId}>
                  <strong>{item.questionId}</strong>: {JSON.stringify(item.before)} {"->"}{" "}
                  {JSON.stringify(item.after)}
                </p>
              ))}
            </section>
          )}

          {error && <p>{error}</p>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || missingRequired.length > 0 || !userStepId || !csrfToken}
            >
              {isSubmitting ? "Сохранение..." : "Отправить анкету"}
            </button>
          )}
          {missingRequired.length > 0 && <p>Заполните обязательные поля: {missingRequired.length}</p>}
        </div>
      </div>
    </div>
  );
}
