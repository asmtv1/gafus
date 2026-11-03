import { Loading } from "../../shared/ui";
import { BackButton } from "../../shared/ui";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shouldShowEstimatedDuration } from "@gafus/core-client/utils/training";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import { getTrainingDay, type TrainingDayDetail, type TrainingStepPreview } from "./trainingDayApi";
import { listTrainingDays, type TrainingDaySummary,
  type TrainingDaysOverview } from "./trainingDaysApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { DiaryEditor } from "./DiaryEditor";
import { TrainingProgressConnected } from "./TrainingProgressConnected";
import { TheoryReadingContext } from "./TheoryReadingContext";
import { SafeCourseDescriptionMarkdown } from "./SafeCourseDescriptionMarkdown";
import "./StepMarkdownNextParity.css";
import "./TheoryReadingEnd.css";
import { TrainingStepVideo } from "./TrainingStepVideo";
import { TrainingStepImage } from "./TrainingStepImage";
import { TrainingExamStep } from "./TrainingExamStep";
import { TrainingSurveyStep } from "./TrainingSurveyStep";
import { TrainingStepUnlock } from "./TrainingStepUnlock";
import { TrainingStepAccessCard } from "./TrainingStepAccessCard";
import type { AuthUser } from "../../shared/auth/authApi";

const labels: Record<TrainingStepPreview["type"], string> = {
  TRAINING: "Тренировка",
  PRACTICE: "Практика",
  THEORY: "Теория",
  BREAK: "Перерыв",
  EXAMINATION: "Проверка знаний",
  DIARY: "Дневник",
  SURVEY: "Опрос",
};
const statusLabels: Record<TrainingStepPreview["status"], string> = {
  NOT_STARTED: "Не начат",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Пройден",
  PAUSED: "На паузе",
  RESET: "Сброшен",
};
type ExamContext = { userId: string; courseType: string; day: TrainingDaySummary };
function StepCard({ step, index, examContext, onUnlockVerify,
  nextRoute = false, progressSlot, diarySlot, expandedByDay = false, onDayToggle,
  onStepExpand, onTheoryReadEnd }: {
  step: TrainingStepPreview; index: number; examContext?: ExamContext;
  onUnlockVerify?: (step: TrainingStepPreview) => Promise<boolean>;
  nextRoute?: boolean; progressSlot?: ReactNode; diarySlot?: ReactNode;
  expandedByDay?: boolean; onDayToggle?: () => void;
  onStepExpand?: () => void;
  onTheoryReadEnd?: () => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [lockedAccessOpen, setLockedAccessOpen] = useState(false);
  // The step's expansion state must exist before the reading effect's deps.
  const expanded = nextRoute ? expandedByDay : localExpanded;
  const [readReached, setReadReached] = useState(false);
  const readAttempted = useRef(false);
  const readEnd = useRef<HTMLDivElement>(null);
  // A pure read-only preview has no server command. Do not pretend its text
  // was saved when no bound progress slot or verified daily action exists.
  const canPersistTheory = Boolean(progressSlot || onTheoryReadEnd);
  const isTheoryToRead = canPersistTheory && step.type === "THEORY" && !step.locked &&
    step.status !== "COMPLETED";
  const markRead = useCallback(() => {
    if (readAttempted.current || !isTheoryToRead) return;
    readAttempted.current = true;
    setReadReached(true);
    onTheoryReadEnd?.();
  }, [isTheoryToRead, onTheoryReadEnd]);
  useEffect(() => {
    if (step.status === "COMPLETED") {
      readAttempted.current = false;
      setReadReached(false);
    }
  }, [step.status]);
  useEffect(() => {
    if (!expanded || !isTheoryToRead || readReached) return;
    const end = readEnd.current;
    if (!end) return;
    // Opening a short text must NOT complete it. Only a subsequent user scroll
    // from content that initially extends below the viewport can finish it.
    const initiallyBelowViewport = end.getBoundingClientRect().top >
      window.innerHeight - 24;
    if (!initiallyBelowViewport) return;
    const onScroll = () => {
      if (end.getBoundingClientRect().top <= window.innerHeight - 24) markRead();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, true);
  // The closure is for one opened step and one observed bottom marker.
  }, [expanded, isTheoryToRead, readReached, markRead]);
  // Original Next Day.tsx owns one openIndex for all the day's steps.
  const toggle = () => {
    if (!expanded) {
      readAttempted.current = false;
      setReadReached(false);
      onStepExpand?.();
    }
    if (nextRoute) onDayToggle?.();
    else setLocalExpanded(open => !open);
  };
  // A stable React instance ID avoids clashes between ordinary and Daily lists.
  const id = useId();
  const headingId = id + "-heading";
  const panelId = id + "-panel";
  return (
    <li data-status={step.status}
      className={nextRoute ? "training-step-card training-next-step-card" : "training-step-card"}>
      {nextRoute ? (
        step.locked ? <button id={headingId} type="button"
          className="training-next-step-header training-next-step-locked"
          aria-expanded={lockedAccessOpen}
          aria-controls={lockedAccessOpen ? panelId : undefined}
          aria-label={`Открыть закрытый шаг: ${step.title}`}
          onClick={() => setLockedAccessOpen(open => !open)}>
          <span className="training-next-step-more">Закрыт</span>
          <strong>«{step.title}»</strong>
          <span className="training-next-step-status">🔒 Закрыт</span>
        </button> : <button id={headingId} type="button" className="training-next-step-header"
          aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
          aria-label={`${expanded ? "Скрыть" : "Подробнее"}: ${step.title}`}
          onClick={toggle}>
          <span className="training-next-step-more">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"
              className={expanded ? "training-next-step-chevron expanded" : "training-next-step-chevron"}
              aria-hidden="true" focusable="false">
              <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
            </svg>{expanded ? "Скрыть" : "Подробнее"}
          </span>
          <strong className="training-next-step-title-lines">
            {(step.type === "BREAK" || step.type === "DIARY") && (
              <span>{step.type === "BREAK" ? "Перерыв" : "Дневник успехов"}</span>
            )}
            <span>{step.type === "BREAK" ? step.title : `«${step.title}»`}</span>
          </strong>
          <span className="training-next-step-status">{
            step.status === "NOT_STARTED" ? "⏳" :
              step.status === "COMPLETED" ? "✅" :
                step.status === "IN_PROGRESS" ? "🔄" :
                  step.status === "PAUSED" ? "⏸️" : "🔄"} {statusLabels[step.status]}
          </span>
        </button>
      ) : <>
      <div className="training-day-meta">
        <span>
          Шаг {index + 1} · {labels[step.type]}
        </span>
        <span className={step.locked ? "access-tag locked" : "access-tag"}>
          {step.locked ? "Закрыт" : statusLabels[step.status]}
        </span>
      </div>
      <h4 id={headingId}>{step.title}</h4>
      {step.durationSec > 0 && (
        <p className="note">Продолжительность: {Math.ceil(step.durationSec / 60)} мин</p>
      )}
      </>}
      {step.locked ? (nextRoute ? lockedAccessOpen &&
        <div id={panelId} role="region" aria-labelledby={headingId}
          className="training-day-detail training-next-step-content">
          {examContext && onUnlockVerify && step.unlockTargetId ? (
            <TrainingStepAccessCard
              userId={examContext.userId}
              dayOnCourseId={examContext.day.dayOnCourseId}
              stepOnDayId={step.unlockTargetId}
              onVerify={() => onUnlockVerify(step)} />
          ) : (
            <p className="note training-next-locked-note">
              Содержимое шага закрыто правилами доступа курса.
            </p>
          )}
        </div> : <>
          <p className="note">Содержимое шага закрыто правилами доступа курса.</p>
          {examContext && onUnlockVerify && step.unlockTargetId &&
            <TrainingStepUnlock userId={examContext.userId}
              dayOnCourseId={examContext.day.dayOnCourseId}
              stepOnDayId={step.unlockTargetId}
              onVerify={() => onUnlockVerify(step)} />}
        </>) : (
        <>
          {!nextRoute && <button
            type="button"
            id={id + "-trigger"}
            className="button-secondary"
            aria-expanded={expanded}
            aria-controls={expanded ? panelId : undefined}
            aria-label={`${expanded ? "Скрыть" : "Читать"} шаг ${index + 1}: ${step.title}`}
            onClick={toggle}
          >
            {expanded ? "Скрыть шаг" : "Читать шаг"}
          </button>}
          {expanded && (
            <div id={panelId} role="region" aria-labelledby={headingId}
              className={nextRoute ? "training-day-detail training-next-step-content" : "training-day-detail"}>
              {nextRoute && step.type !== "TRAINING" && (
                <div className="training-next-step-type-card" aria-label="Тип занятия">
                  <span>{labels[step.type]}</span>
                  {typeof step.estimatedDurationSec === "number" &&
                    step.estimatedDurationSec > 0 &&
                    shouldShowEstimatedDuration(step.type) &&
                    <span className="training-next-step-estimated">
                      {step.type === "PRACTICE"
                        ? `Примерное время: ~${Math.round(step.estimatedDurationSec / 60)} мин`
                        : `Этот шаг займёт ~ ${Math.round(step.estimatedDurationSec / 60)} мин`}
                    </span>}
                </div>
              )}
              {step.description && (
                <div className={nextRoute ? "training-next-step-info" : undefined}>
                  {nextRoute && <div className="training-next-step-section-title">Описание:</div>}
                  <div className={nextRoute
                    ? "training-step-description training-next-step-section"
                    : "training-step-description"}>
                    <SafeCourseDescriptionMarkdown description={step.description} kind="step" />
                  </div>
                </div>
              )}
              {step.imageUrls.length > 0 && step.type !== "BREAK" && (
                <div className={nextRoute ? "training-next-step-info" : undefined}>
                  {nextRoute && <div className="training-next-step-section-title">Изображения:</div>}
                  <div className={nextRoute
                    ? "training-step-media training-next-step-images"
                    : "training-step-media"}>
                    {step.imageUrls.map((url, mediaIndex) => (
                      <TrainingStepImage
                        key={url + mediaIndex}
                        src={url} priority={mediaIndex === 0}
                        alt={nextRoute
                          ? `Изображение ${mediaIndex + 1} для шага "${step.title}"`
                          : "Иллюстрация " + (mediaIndex + 1) + ": " + step.title}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(step.videoUrls?.length ? step.videoUrls : step.videoUrl ? [step.videoUrl] : [])
                .map((url, videoIndex) => (
                  <div key={url + videoIndex} className="training-step-video-attachment">
                    {step.videoUrls && step.videoUrls.length > 1 &&
                      <h5>Видео {videoIndex + 1} из {step.videoUrls.length}</h5>}
                    <TrainingStepVideo originalUrl={url} title={step.title} />
                  </div>
                ))}
              {step.pdfUrls && step.pdfUrls.length > 0 && <div
                className="training-step-attachments" aria-label="Материалы занятия">
                <h5>Материалы для занятия</h5>
                <ul>{step.pdfUrls.map((url, i) => <li key={url + i}>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    referrerPolicy="no-referrer">Открыть PDF {i + 1}</a>
                </li>)}</ul>
              </div>}
              {step.type === "EXAMINATION" && examContext &&
                <TrainingExamStep {...examContext} step={step} />}
              {step.type === "SURVEY" && examContext &&
                <TrainingSurveyStep {...examContext} step={step} />}
              {diarySlot && step.type === "DIARY" && (
                <div className="training-next-step-diary">{diarySlot}</div>
              )}
              {/* Completed read-only theory must still show the olive badge,
                  even if no mutation callback/owner progress slot is provided. */}
              {step.type === "THEORY" && !step.locked &&
                (canPersistTheory || step.status === "COMPLETED") && (
                <div className="training-theory-reading-end" aria-label="Конец теоретического шага">
                  <div ref={readEnd} aria-hidden="true" className="training-theory-end-marker" />
                  {step.status === "COMPLETED" ?
                    <span role="status" className="training-theory-read-badge">
                      Прочитано
                    </span> :
                    readReached ? <p role="status">Сохраняем прочтение…</p> :
                    <button className="button-secondary" type="button" onClick={markRead}>
                      Я дочитал шаг
                    </button>}
                </div>
              )}
              {progressSlot && <div className="training-next-step-progress">
                <TheoryReadingContext.Provider value={readReached}>
                  {progressSlot}
                </TheoryReadingContext.Provider>
              </div>}
              {!step.description && !step.videoUrl && !step.videoUrls?.length && !step.imageUrls.length &&
                !step.pdfUrls?.length &&
                !["EXAMINATION", "DIARY", "SURVEY"].includes(step.type) && (
                <p className="note">Дополнительных материалов нет.</p>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}
/** Share existing read-only step presentation across course and daily screens. */
export function ReadonlyTrainingStepList({ steps, examContext, onUnlockVerify,
  nextRoute = false, progressSlot, renderProgressSlot, renderDiarySlot,
  onStepExpand, onTheoryReadEnd, controlledOpenIndex, onOpenIndexChange }: {
  steps: TrainingStepPreview[]; examContext?: ExamContext;
  onUnlockVerify?: (step: TrainingStepPreview) => Promise<boolean>;
  nextRoute?: boolean; progressSlot?: ReactNode;
  renderProgressSlot?: (step: TrainingStepPreview, index: number) => ReactNode;
  onStepExpand?: (step: TrainingStepPreview, index: number) => void;
  onTheoryReadEnd?: (step: TrainingStepPreview, index: number) => void;
  controlledOpenIndex?: number | null;
  onOpenIndexChange?: (next: number | null) => void;
  renderDiarySlot?: (step: TrainingStepPreview, index: number) => ReactNode;
}) {
  const [localOpenIndex, setLocalOpenIndex] = useState<number | null>(null);
  const openIndex = controlledOpenIndex === undefined ? localOpenIndex : controlledOpenIndex;
  const toggleIndex = (index: number) => {
    const next = openIndex === index ? null : index;
    if (controlledOpenIndex === undefined) setLocalOpenIndex(next);
    else onOpenIndexChange?.(next);
  };
  return (
    <ol className={nextRoute ? "training-steps-list training-next-steps-list" : "training-steps-list"}>
      {steps.map((step, index) => (
        <StepCard key={`${step.order}:${step.id}`} step={step} index={index}
          nextRoute={nextRoute} examContext={examContext} onUnlockVerify={onUnlockVerify}
          expandedByDay={nextRoute && openIndex === index}
          onDayToggle={() => toggleIndex(index)}
          onStepExpand={() => onStepExpand?.(step, index)}
          onTheoryReadEnd={() => onTheoryReadEnd?.(step, index)}
          progressSlot={nextRoute && renderProgressSlot
            ? renderProgressSlot(step, index)
            : nextRoute && index === steps.findIndex(item => !item.locked)
              ? progressSlot : undefined}
          diarySlot={step.type === "DIARY" && !step.locked && renderDiarySlot
            ? renderDiarySlot(step, index) : undefined} />
      ))}
    </ol>
  );
}
export function TrainingDayViewer({
  userId,
  courseType,
  day,
  onBack,
  loadDay = getTrainingDay,
  showOnlineProgressSourceOptIn = false,
  loadDaysForProgress = listTrainingDays,
  enableConnectedProgress = false,
}: {
  userId: string;
  courseType: string;
  day: TrainingDaySummary;
  onBack: () => void;
  loadDay?: (type: string, day: TrainingDaySummary) => Promise<TrainingDayDetail>;
  /** AG2 LEARN032 source/mock READ reconciliation only; actions fail closed
   * until AG1 proves GET positional stepIndex binding. Default OFF. */
  showOnlineProgressSourceOptIn?: boolean;
  loadDaysForProgress?: (type: string) => Promise<TrainingDaysOverview>;
  /** Ordinary authenticated route only: exact StepOnDay binding or no writes. */
  enableConnectedProgress?: boolean;
}) {
  const cache=useQueryClient();
  const initialActor=useRef(cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id);
  const [retired,setRetired]=useState(false);
  const actorEpoch=useRef(0);
  useEffect(()=>{
    if(!showOnlineProgressSourceOptIn)return;
    return cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((value:unknown,i:number)=>
          value===CURRENT_USER_QUERY_KEY[i]))return;
      actorEpoch.current++;
      setRetired(true); // A->B->A and same-ID auth refresh cannot revive intents.
    });
  },[cache,showOnlineProgressSourceOptIn]);
  const [nextDescriptionOpen,setNextDescriptionOpen]=useState(false);
  // Progress refetches temporarily withhold sensitive step details; preserve
  // only the selected accordion index across their safe remounts.
  const [openStepIndex,setOpenStepIndex]=useState<number|null>(null);
  const [checking,setChecking]=useState(false);
  const checkingRef=useRef(false);
  const [readStatus,setReadStatus]=useState<string|null>(null);
  const [mappingChanged,setMappingChanged]=useState(false);
  const query = useQuery({
    queryKey: ["training", "day", userId, courseType, day.dayOnCourseId],
    queryFn: () => loadDay(courseType, day),
    enabled: !!userId && !day.isLocked,
    staleTime: 0,
    retry: false,
    gcTime: 0,
  });
  // Private step text/media remain hidden until this session's GET succeeds.
  const sourceSessionOk=!showOnlineProgressSourceOptIn||(
    !retired&&initialActor.current===userId&&
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId);
  // Core /training/days uses DayOnCourse.id as trainingDayId, whereas
  // /training/day returns the physical Day.id. Compare the shared, verified
  // course + occurrence link; never require these different ID namespaces
  // to be identical. The protected GET projector already checks both.
  const sameSelectedDay = query.isSuccess &&
    query.data.courseId === day.courseId &&
    query.data.dayOnCourseId === day.dayOnCourseId;
  const ready = sourceSessionOk && sameSelectedDay && !query.isFetching;
  // This is a READ-only current-state reconciliation. It does not unlock
  // positional POST commands, synthesize step indices or optimistic progress.
  async function reconcileOnlineRead(){
    if(!showOnlineProgressSourceOptIn||!sourceSessionOk||!ready||
      checkingRef.current||day.isLocked)return;
    checkingRef.current=true;
    setChecking(true);
    setReadStatus(null);
    const epoch=actorEpoch.current;
    const before=query.data.steps.map(step=>step.id);
    try{
      const [freshDay,freshDays]=await Promise.all([
        loadDay(courseType,day),loadDaysForProgress(courseType),
      ]);
      if(epoch!==actorEpoch.current||
        cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id!==userId)return;
      const current=freshDays.days.find(d=>d.dayOnCourseId===day.dayOnCourseId);
      if(!current||freshDays.courseId!==day.courseId||current.isLocked||
        current.courseId!==day.courseId||
        freshDay.courseId!==day.courseId||
        freshDay.dayOnCourseId!==day.dayOnCourseId){
        setMappingChanged(true);
        setReadStatus("Доступ или идентификаторы изменились. Команды заблокированы.");
        await query.refetch();
        return;
      }
      const after=freshDay.steps.map(step=>step.id);
      if(before.length!==after.length||before.some((id,i)=>id!==after[i])){
        setMappingChanged(true);
        setReadStatus("Порядок шагов изменился. Команды заблокированы.");
      }else{
        setReadStatus("Состояние перечитано. Связь позиции шага с серверной командой не подтверждена.");
      }
      // This owner-scoped GET updates the visible server truth; never copy
      // unverified private response fields into local React progress state.
      await query.refetch();
    }catch(error){
      if(epoch!==actorEpoch.current)return;
      setMappingChanged(true);
      setReadStatus(error instanceof ApiError&&[401,402,403,404,428].includes(error.status)
        ?"Доступ к текущему дню не подтверждён. Команды заблокированы.":
          "Не удалось сверить состояние с сервером. Команды заблокированы.");
      // A failed private GET must not expose stale successful-step text.
      await query.refetch().catch(()=>undefined);
    }finally{
      checkingRef.current=false;
      if(epoch===actorEpoch.current)setChecking(false);
    }
  }
  return (
    <section className={enableConnectedProgress
      ? "training-day-viewer training-day-viewer--next"
      : "training-day-viewer"} aria-label="Шаги тренировочного дня">
      {!enableConnectedProgress && <BackButton type="button" onClick={onBack}>К списку блоков</BackButton>}
      {enableConnectedProgress ? <h2 className="training-next-day-title">{
        ready ? (query.data.title.match(/^(?:День|Блок)\s+(\d+)/i)?.[1]
          ? "Блок " + query.data.title.match(/^(?:День|Блок)\s+(\d+)/i)?.[1]
          : query.data.title) : "Шаги тренировочного дня"
      }</h2> : <h3>{ready ? query.data.title : "Шаги тренировочного дня"}</h3>}
      {day.isLocked && <p role="alert">Этот блок закрыт. Шаги недоступны.</p>}
      {!day.isLocked && query.isPending && <Loading message="Загружаем шаги…" />}
      {!day.isLocked && query.isFetching && query.data && (
        <Loading variant="compact" message="Перепроверяем доступ к шагам…" />
      )}
      {!day.isLocked && query.isError && (
        <div className="empty-state" role="alert">
          <p>
            {query.error instanceof ApiError && query.error.status === 401
              ? "Сессия завершена. Войдите снова."
              : query.error instanceof ApiError && query.error.status === 403
                ? "Нет доступа к этому дню."
                : query.error instanceof ApiError && query.error.status === 404
                  ? "День не найден."
                  : query.error instanceof ApiError && query.error.status === 428
                    ? "Нужно заполнить персонализацию курса."
                    : "Не удалось загрузить шаги тренировочного дня."}
          </p>
          {query.error instanceof ApiError && query.error.status === 401 ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : query.error instanceof ApiError &&
            (query.error.status === 403 || query.error.status === 404) ? null : (
            <button type="button" onClick={() => void query.refetch()}>
              Повторить загрузку
            </button>
          )}
        </div>
      )}
      {showOnlineProgressSourceOptIn&&!sourceSessionOk&&(
        <p role="alert">Сессия изменилась. Просмотр прогресса заблокирован.</p>
      )}
      {!day.isLocked && sourceSessionOk && query.isSuccess &&
        !query.isFetching && !sameSelectedDay && (
        <p role="alert">Данные блока не совпадают с выбранным курсом. Обновите страницу.</p>
      )}
      {!day.isLocked && ready && (
        <>
          {(enableConnectedProgress || query.data.description.trim()) && (
            enableConnectedProgress ? (
              <section className="training-next-day-description" aria-label="Описание блока">
                <button type="button" className="training-next-day-description-toggle"
                  aria-expanded={nextDescriptionOpen}
                  aria-controls="training-next-day-description-body"
                  onClick={() => setNextDescriptionOpen(current => !current)}>
                  <strong>Описание блока</strong>
                  <span className="training-next-day-description-control">
                    <span>{nextDescriptionOpen ? "Скрыть" : "Подробнее"}</span>
                    <svg className={"training-next-day-description-icon" +
                      (nextDescriptionOpen ? " expanded" : "")}
                      viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor"
                        d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                    </svg>
                  </span>
                </button>
                {nextDescriptionOpen && (
                  <div id="training-next-day-description-body" className="training-next-day-description-body">
                    {query.data.description.trim()
                      ? <SafeCourseDescriptionMarkdown description={query.data.description} />
                      : <p role="status">Описание блока пока не опубликовано.</p>}
                  </div>
                )}
              </section>
            ) : (
              <div className="training-description" role="region"
                aria-label="Описание учебного дня">
                <SafeCourseDescriptionMarkdown description={query.data.description} />
              </div>
            )
          )}
          {enableConnectedProgress && query.data.steps.some(step =>
            !step.locked && ["TRAINING", "BREAK"].includes(step.type)) &&
            <TrainingProgressConnected userId={userId} courseType={courseType}
              day={day} monitorOnly />}
          {query.data.steps.length === 0 ? (
            <p role="status" className="empty-state">
              Шаги ещё не опубликованы.
            </p>
          ) : (
            <ReadonlyTrainingStepList steps={query.data.steps} nextRoute={enableConnectedProgress}
              controlledOpenIndex={enableConnectedProgress ? openStepIndex : undefined}
              onOpenIndexChange={setOpenStepIndex}
              renderProgressSlot={enableConnectedProgress && !day.isLocked
                ? (step, index) => ["EXAMINATION", "DIARY", "SURVEY"].includes(step.type)
                  ? null
                  : <TrainingProgressConnected userId={userId}
                      courseType={courseType} day={day} delegatedExpiry
                      stepSelection={{ index, id: step.id }} />
                : undefined}
              renderDiarySlot={query.data.courseId === day.courseId &&
                query.data.dayOnCourseId === day.dayOnCourseId
                ? () => <DiaryEditor userId={userId} courseId={day.courseId}
                    dayOnCourseId={day.dayOnCourseId} />
                : undefined}
              examContext={enableConnectedProgress ? { userId, courseType, day } : undefined}
              onUnlockVerify={enableConnectedProgress ? async previous => {
                const fresh = await query.refetch();
                if (!fresh.isSuccess || fresh.isFetching ||
                    fresh.data?.courseId !== day.courseId ||
                    fresh.data.dayOnCourseId !== day.dayOnCourseId) return false;
                const matching = fresh.data.steps.filter(next =>
                  next.id === previous.id && next.order === previous.order);
                return matching.length === 1 && !matching[0].locked;
              } : undefined} />
          )}
          {/* Like the original AccordionStep/StepDiaryBlock, DIARY editing now
              exists only inside the expanded unlocked diary step, never below
              the day as a second standalone form. The independently verified
              Core GET/POST and own draft/error/actor fences remain unchanged. */}
        </>
      )}
      {showOnlineProgressSourceOptIn&&sourceSessionOk&&!day.isLocked&&ready&&(
        <section aria-label="Сверка онлайн-прогресса" className="training-online-read-gate">
          <h4>Онлайн-прогресс: проверка доступности</h4>
          <p role="status">Запись прогресса заблокирована: сервер пока не гарантирует
            неизменность позиции шага между GET и POST.</p>
          {query.data.steps.filter(step=>!step.locked).map(step=>(
            <div key={`${step.order}:${step.id}`} className="training-day-meta">
              <span>{step.title}: {statusLabels[step.status]}</span>
              <button type="button" disabled title="Не подтверждена позиция шага">
                {step.status==="NOT_STARTED"||step.status==="RESET"?"Начать":
                  step.status==="IN_PROGRESS"?"Пауза / Завершить":
                    step.status==="PAUSED"?"Продолжить / Завершить":"Завершено"}
              </button>
            </div>
          ))}
          {readStatus&&<p role="status">{readStatus}</p>}
          {mappingChanged&&<p role="alert">Необходима новая проверка порядка и доступа.</p>}
          <button type="button" className="button-secondary"
            disabled={checking} onClick={()=>void reconcileOnlineRead()}>
            {checking?"Сверяем…":"Перечитать день и список блоков"}
          </button>
        </section>
      )}
      {/* Original Next day has no second bottom back button; the shared
          GafusHeader already renders the source-compatible Back action. */}
      {!enableConnectedProgress && <p className="note">
        Просмотр без изменения прогресса. Запуск, пауза и завершение шагов пока недоступны.
      </p>}
    </section>
  );
}
