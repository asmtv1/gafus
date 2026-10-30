import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./TrainingLearnerExtras.css";
import "./TrainingLearnerForms.css";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { ExamResultWire } from "@gafus/types";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingStepPreview } from "./trainingDayApi";
import {
  initializeLearnerExam, readLearnerExamPreview, readLearnerExam,
  submitLearnerExam, uploadLearnerExamVideo,
  type LearnerExam, type LearnerExamPreview,
} from "./trainingExamApi";
import {PrimaryButton} from "../../shared/ui";

type Props = {
  userId: string;
  courseType: string;
  day: TrainingDaySummary;
  step: TrainingStepPreview;
};
type Draft = Record<string, number>;

/** No guessed UserStep IDs, client-only completion, or replayed POST.
 * Initial accordion expansion uses read-only Core preview and DOES NOT create
 * missing progress. First explicit submission initializes the exact occurrence,
 * checks that the protected question contract is unchanged, then POSTs once.
 */
export function TrainingExamStep(props: Props) {
  return <TrainingExamContent key={JSON.stringify([
    props.userId, props.courseType, props.day.dayOnCourseId,
    props.step.order, props.step.id,
  ])} {...props} />;
}

function TrainingExamContent({ userId, courseType, day, step }: Props) {
  const cache = useQueryClient();
  const [exam, setExam] = useState<LearnerExam | null>(null);
  const [preview, setPreview] = useState<LearnerExamPreview | null>(null);
  const [result, setResult] = useState<ExamResultWire | null>(null);
  const [answers, setAnswers] = useState<Draft>({});
  const [feedback, setFeedback] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [retired, setRetired] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryQuiz, setRetryQuiz] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const flight = useRef(false);
  const epoch = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const actorEpoch = epoch;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((value: unknown, i: number) =>
          value === CURRENT_USER_QUERY_KEY[i])) return;
      epoch.current++;
      setExam(null); setPreview(null); setResult(null);
      setAnswers({}); setFeedback(""); setFile(null);
      setRetired(true);
    });
    return () => { active.current = false; actorEpoch.current++; unsubscribe(); };
  }, [cache]);
  const current = useCallback(() => active.current && !retired &&
    cache.getQueryData<{ id: string } | null>(CURRENT_USER_QUERY_KEY)?.id === userId,
  [retired, cache, userId]);
  const ownerOK = current();

  // Next renders examination questions immediately upon disclosure.
  // The protected initial preview only calls createIfMissing=false; an
  // explicit user submit initializes a missing UserStep transactionally.
  useEffect(() => {
    if (step.locked || !current() || flight.current ||
        exam?.stepId === step.id || preview?.stepId === step.id) return;
    const generation = epoch.current;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await readLearnerExamPreview(courseType, day, step);
        if (cancelled || generation !== epoch.current || !current()) return;
        const saved = existing.userStepId
          ? await readLearnerExam(existing.userStepId) : null;
        if (cancelled || generation !== epoch.current || !current()) return;
        setPreview(existing);
        if (existing.userStepId) setExam({
          ...existing, userStepId: existing.userStepId,
        });
        setResult(saved);
        setAnswers(saved?.testAnswers ?? {});
        setFeedback(saved?.writtenFeedback ?? "");
      } catch {
        // No existing row or an inaccessible/changed step is NOT authority
        // to create it or reveal private content. Manual owner action remains.
      }
    })();
    return () => { cancelled = true; };
  }, [courseType, day, step, current, exam?.stepId, preview?.stepId]);

  const open = async () => {
    if (!ownerOK || flight.current || step.locked) return;
    flight.current = true;
    const generation = epoch.current;
    setWorking(true); setError(""); setMessage("");
    try {
      const binding = await initializeLearnerExam(courseType, day, step);
      if (generation !== epoch.current || !current()) return;
      const saved = await readLearnerExam(binding.userStepId);
      if (generation !== epoch.current || !current()) return;
      setExam(binding); setPreview(binding); setResult(saved);
      setAnswers(saved?.testAnswers ?? {});
      setFeedback(saved?.writtenFeedback ?? "");
      setUncertain(false); setRetryQuiz(false);
    } catch {
      if (generation === epoch.current && current())
        setError("Не удалось открыть экзамен. Проверьте доступ и повторите.");
    } finally {
      flight.current = false;
      if (generation === epoch.current && current()) setWorking(false);
    }
  };

  const recheck = async () => {
    if (!exam || !ownerOK || flight.current) return;
    flight.current = true;
    const generation = epoch.current;
    setChecking(true); setError(""); setMessage("");
    try {
      const currentBinding = await initializeLearnerExam(courseType, day, step);
      if (currentBinding.userStepId !== exam.userStepId ||
          currentBinding.stepId !== exam.stepId) throw Error("STALE_EXAM_BINDING");
      const fresh = await readLearnerExam(exam.userStepId);
      if (generation !== epoch.current || !current()) return;
      setResult(fresh);
      setAnswers(fresh?.testAnswers ?? {});
      setFeedback(fresh?.writtenFeedback ?? "");
      setRetryQuiz(false); setUncertain(false);
      setMessage("Проверено текущее состояние экзамена на сервере.");
    } catch {
      if (generation === epoch.current && current()) {
        setUncertain(true);
        setError("Не удалось подтвердить результат. Повторная отправка заблокирована.");
      }
    } finally {
      flight.current = false;
      if (generation === epoch.current && current()) setChecking(false);
    }
  };

  const visibleExam = exam ?? preview;
  const commit = async (kind: "test" | "written" | "video") => {
    if (!visibleExam || !ownerOK || step.locked || flight.current || uncertain) return;
    if (kind === "test" && (
      !visibleExam.questions.length || visibleExam.questions.some(question =>
        !Number.isSafeInteger(answers[question.id]) ||
        answers[question.id] < 0 || answers[question.id] >= question.options.length))) return;
    if (kind === "written" && (feedback.trim().length < 10 || feedback.length > 10000)) return;
    if (kind === "video" && (!file || !file.type.startsWith("video/") ||
        file.size < 1 || file.size > 100 * 1024 * 1024)) return;
    flight.current = true;
    const generation = epoch.current;
    setWorking(true); setError(""); setMessage("");
    let writeAttempted = false;
    try {
      const verified = await initializeLearnerExam(courseType, day, step);
      if (generation !== epoch.current || !current()) return;
      if ((exam && verified.userStepId !== exam.userStepId) ||
          verified.stepId !== visibleExam.stepId ||
          verified.requiresWrittenFeedback !== visibleExam.requiresWrittenFeedback ||
          verified.requiresVideoReport !== visibleExam.requiresVideoReport ||
          JSON.stringify(verified.questions) !== JSON.stringify(visibleExam.questions))
        throw Error("STALE_EXAM_BINDING");
      if (!exam) {
        // An initial preview might have been submitted elsewhere. Refuse to
        // overwrite an existing server answer from an obsolete preview.
        const already = await readLearnerExam(verified.userStepId);
        if (generation !== epoch.current || !current()) return;
        if (already?.testAnswers || already?.writtenFeedback || already?.videoReportUrl)
          throw Error("EXAM_PREVIEW_STALE_RESULT");
        setExam(verified);
      }
      const expectedAnswers = kind === "test" ? { ...answers } : undefined;
      const expectedText = kind === "written" ? feedback.trim() : undefined;
      let videoUrl: string | undefined;
      if (kind === "video" && file) {
        writeAttempted = true;
        videoUrl = await uploadLearnerExamVideo(verified.userStepId, file);
      }
      if (generation !== epoch.current || !current()) return;
      writeAttempted = true;
      await submitLearnerExam({
        userStepId: verified.userStepId, stepId: verified.stepId,
        ...(expectedAnswers && { testAnswers: expectedAnswers }),
        ...(expectedText && { writtenFeedback: expectedText }),
        ...(videoUrl && { videoReportUrl: videoUrl }),
      });
      if (generation !== epoch.current || !current()) return;
      const latest = await readLearnerExam(verified.userStepId);
      if (generation !== epoch.current || !current()) return;
      const matches = latest && (kind === "test"
        ? verified.questions.every(q => latest.testAnswers?.[q.id] === expectedAnswers?.[q.id])
        : kind === "written" ? latest.writtenFeedback === expectedText
          : latest.videoReportUrl === videoUrl);
      if (!matches) throw Error("EXAM_ACK_UNCONFIRMED");
      setResult(latest); setUncertain(false); setRetryQuiz(false);
      setMessage("Результат экзамена сохранён и перечитан с сервера.");
      if (kind === "video") setFile(null);
    } catch {
      if (generation === epoch.current && current()) {
        // Even a lost ACK might have committed. Never automatically retry
        // upload/submit and never clear a draft until explicit recheck.
        if (writeAttempted) setUncertain(true);
        setError(writeAttempted
          ? "Результат отправки неизвестен. Нажмите «Проверить результат» перед повтором."
          : "Состояние шага изменилось или недоступно. Перечитайте экзамен.");
      }
    } finally {
      flight.current = false;
      if (generation === epoch.current && current()) setWorking(false);
    }
  };

  const onTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); void commit("test");
  };
  const onWritten = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); void commit("written");
  };
  const onVideo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); void commit("video");
  };

  if (!ownerOK) return <p role="alert">Сессия изменилась. Откройте экзамен заново.</p>;
  if (!visibleExam) return <section aria-label="Экзамен" className="training-exam">
    <header className="training-exam-header">
      <span className="training-exam-header-icon" aria-hidden="true">✓</span>
      <div><span className="training-learner-eyebrow">Проверка знаний</span>
        <h5>Экзамен</h5>
        <p>Тест и отчёты сохраняются в вашем личном прогрессе.</p>
      </div>
    </header>
    <button type="button" className="button-secondary" disabled={working}
      onClick={() => void open()}>{working ? "Открываем…" : "Открыть экзамен"}</button>
    {error && <p role="alert">{error}</p>}
  </section>;

  const answered = result?.testAnswers && !retryQuiz;
  const canWrite = !working && !checking && !uncertain;
  return <section className="training-exam" aria-label="Экзамен">
    <header className="training-exam-header">
      <span className="training-exam-header-icon" aria-hidden="true">✓</span>
      <div>
        <span className="training-learner-eyebrow">Проверка знаний</span>
        <h5>Экзамен</h5>
        <p>Пройдите задания и поделитесь своими выводами.</p>
      </div>
    </header>
    {result?.reviewedAt && <p role="status">
      {result.isPassed ? "Экзамен зачтён" : "Экзамен не зачтён"}
      {result.reviewedBy?.profile?.fullName &&
        ` · ${result.reviewedBy.profile.fullName}`}
    </p>}
    {result?.trainerComment && <p>{result.trainerComment}</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {uncertain && <p role="alert">Отправка заблокирована до серверной проверки.</p>}
    {exam && <button type="button" className="button-secondary"
      disabled={working || checking} onClick={() => void recheck()}>
      {checking ? "Проверяем…" : "Проверить результат"}
    </button>}

    {visibleExam.questions.length > 0 && <form className="training-exam-form" onSubmit={onTest}>
      <div className="training-exam-form-title">
        <span className="training-exam-form-icon" aria-hidden="true">?</span>
        <div><h6>Тестовые вопросы</h6>
          <p>Выберите один ответ для каждого вопроса.</p>
        </div>
      </div>
      {visibleExam.questions.map((question, index) => <fieldset key={question.id}>
        <legend>Вопрос {index + 1}: {question.question}</legend>
        {question.options.map((option, answerIndex) =>
          <label key={answerIndex} className="training-exam-option">
            <input type="radio" name={`exam-${visibleExam.userStepId ?? visibleExam.stepId}-${question.id}`}
              checked={answers[question.id] === answerIndex}
              disabled={!canWrite || !!answered}
              onChange={() => setAnswers(previous => ({
                ...previous, [question.id]: answerIndex,
              }))} />
            {option}
          </label>)}
        {answered && <p role="status">
          {answers[question.id] === question.correctAnswer
            ? "Ответ верный" : "Ответ неверный"}
        </p>}
      </fieldset>)}
      {answered && <p role="status">
        Правильных ответов: {result?.testScore ?? "—"} из {result?.testMaxScore ?? "—"}.
        {result?.isPassed === true ? " Тест сдан." : result?.isPassed === false
          ? " Тест не сдан." : " Ожидайте оценки."}
      </p>}
      {answered && result?.isPassed === false &&
        <button type="button" className="button-secondary" disabled={!canWrite}
          onClick={() => { setRetryQuiz(true); setAnswers({}); }}>
          Перепройти тест
        </button>}
      {!answered && <PrimaryButton type="submit" disabled={!canWrite ||
        visibleExam.questions.some(question => answers[question.id] === undefined)}>
        {working ? "Отправляем…" : "Отправить тест"}
      </PrimaryButton>}
    </form>}

    {visibleExam.requiresWrittenFeedback && <form className="training-exam-form training-exam-form--written"
      onSubmit={onWritten}>
      <div className="training-exam-form-title">
        <span className="training-exam-form-icon" aria-hidden="true">✎</span>
        <div><h6>Письменная обратная связь</h6>
          <p>Поделитесь тем, что узнали, и задайте оставшиеся вопросы.</p>
        </div>
      </div>
      <label htmlFor={`exam-feedback-${visibleExam.userStepId ?? visibleExam.stepId}`}>Ваши выводы и вопросы</label>
      <textarea id={`exam-feedback-${visibleExam.userStepId ?? visibleExam.stepId}`} rows={5}
        value={feedback} onChange={event => setFeedback(event.target.value)}
        placeholder="Напишите, что было полезным и о чём вы хотели бы спросить…"
        disabled={!canWrite || !!result?.writtenFeedback} maxLength={10000} />
      <div className="training-learner-form-footer">
        <span className="training-learner-counter">
          {feedback.length.toLocaleString("ru-RU")} / 10 000 · минимум 10 символов
        </span>
        {result?.writtenFeedback ? <p role="status">Обратная связь сохранена.</p> :
          <PrimaryButton type="submit" disabled={!canWrite || feedback.trim().length < 10}>
            Отправить обратную связь
          </PrimaryButton>}
      </div>
    </form>}

    {visibleExam.requiresVideoReport && <form className="training-exam-form" onSubmit={onVideo}>
      <div className="training-exam-form-title">
        <span className="training-exam-form-icon" aria-hidden="true">▶</span>
        <div><h6>Видеоотчёт</h6>
          <p>Прикрепите видео, если это предусмотрено заданием.</p>
        </div>
      </div>
      {result?.videoReportUrl ? <p role="status">Видеоотчёт отправлен.</p> : <>
        <label htmlFor={`exam-video-${visibleExam.userStepId ?? visibleExam.stepId}`}>Выберите видео (до 100 МБ)</label>
        <input id={`exam-video-${visibleExam.userStepId ?? visibleExam.stepId}`} type="file" accept="video/*"
          disabled={!canWrite} onChange={event =>
            setFile(event.target.files?.[0] ?? null)} />
        <PrimaryButton type="submit" disabled={!canWrite || !file ||
          !file.type.startsWith("video/") || file.size > 100 * 1024 * 1024}>
          Отправить видеоотчёт
        </PrimaryButton>
      </>}
    </form>}
  </section>;
}
