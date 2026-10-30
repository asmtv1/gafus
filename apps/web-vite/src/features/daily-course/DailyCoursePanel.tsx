import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import { useState } from "react";
import "./DailyCourseNextParity.css";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { RouteLink, navigate, dailyCoursePath } from "../../shared/router/location";
import { ReadonlyTrainingStepList } from "../training/TrainingDayViewer";
import { SafeCourseDescriptionMarkdown } from "../training/SafeCourseDescriptionMarkdown";
import { DailyBoundProgress } from "./DailyBoundProgress";
import { getTodayDailyCourse, type DailyDay, type DailyToday } from "./dailyCourseApi";
import sourceCard from "../../brand/LegacyCoursesPage.module.css";
// Exact public asset from @gafus/metadata DAILY_COURSE_LOGO. Do not import
// metadata's Next-only SITE_CONFIG here: it reads process.env at module load,
// which crashes browser Vite without a Node `process` global.
const DAILY_COURSE_LOGO = {
  url: "https://storage.yandexcloud.net/gafus-media/uploads/courses/course-day-logo.png?v=20260505-1620",
  alt: "Курс дня",
} as const;

export type DailyReadOnlyLoader = (today: DailyToday) => Promise<DailyDay>;
const statusLabels: Record<DailyToday["userStatus"], string> = {
  NOT_STARTED: "Не начат",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Пройден",
  PAUSED: "На паузе",
  RESET: "Сброшен",
};
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Нет доступа к курсу дня.";
    if (error.status === 404) return "Курс дня больше недоступен.";
  }
  return "Не удалось загрузить курс дня.";
}
function isTerminalDailyError(error: unknown): boolean {
  return error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404);
}
function isExpiredSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
function DayContent({
  userId,
  today,
  loadDay,
  onBack,
  enableConnectedProgress = false,
  showBack = false,
}: {
  userId: string;
  today: DailyToday;
  loadDay: DailyReadOnlyLoader;
  onBack: () => void;
  enableConnectedProgress?: boolean;
  showBack?: boolean;
}) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const result = useQuery({
    queryKey: ["daily-course", "day", userId, today.mskDate, today.scheduleId],
    queryFn: async () => {
      const data = await loadDay(today);
      // Reject even an injected loader returning stale/wrong owner's day.
      if (
        !today.day ||
        data.scheduleId !== today.scheduleId ||
        data.mskDate !== today.mskDate ||
        data.trainingDayId !== today.day.id ||
        data.bundleId !== today.day.id
      )
        throw Error("STALE_OR_WRONG_DAILY_DAY");
      return data;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // A cached daily step success must not publish signed media or content
  // while the current protected GET is revalidating.
  const ready = result.isSuccess && !result.isFetching;
  return (
    <section aria-label="День курса" className="daily-course-day daily-course-day--next">
      {showBack && <BackButton className="daily-course-local-back" type="button" onClick={onBack}>К заданию дня</BackButton>}
      {result.isPending && <Loading message="Загружаем шаги курса дня…" />}
      {result.isFetching && result.data && <Loading variant="compact" message="Перепроверяем шаги курса дня…" />}
      {result.isError && (
        <div className="empty-state" role="alert">
          <p>{errorMessage(result.error)}</p>
          {isExpiredSession(result.error) && <RouteLink to="/login">Войти</RouteLink>}
          {!isTerminalDailyError(result.error) &&
            <PrimaryButton type="button" onClick={() => void result.refetch()}>
              Повторить загрузку
            </PrimaryButton>}
        </div>
      )}
      {ready && <div className="daily-next-day" data-next-daily-course-day>
        <h2 className="daily-next-title">Курс дня</h2>
        <div className="daily-next-description">
          <button type="button" className="daily-next-description-header"
            aria-expanded={descriptionOpen} aria-controls="daily-next-description-content"
            onClick={() => setDescriptionOpen(value => !value)}>
            <strong>Описание блока</strong>
            <span className="daily-next-description-more">
              {descriptionOpen ? "Скрыть" : "Подробнее"}
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
                className={descriptionOpen ? "daily-next-chevron expanded" : "daily-next-chevron"}>
                <path fill="none" stroke="currentColor" d="m6 9 6 6 6-6"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
          {descriptionOpen && <div id="daily-next-description-content"
            className="daily-next-description-body" role="region">
            <SafeCourseDescriptionMarkdown description={result.data.description} />
          </div>}
        </div>
        {result.data.steps.length === 0 ? (
          <p className="empty-state" role="status">Шаги ещё не опубликованы.</p>
        ) : enableConnectedProgress ? (
          <DailyBoundProgress userId={userId} today={today} steps={result.data.steps}/>
        ) : (
          <ReadonlyTrainingStepList nextRoute steps={result.data.steps}/>
        )}
      </div>}
    </section>
  );
}
/** Functional source/mock screen; current schedule read from real Hono GET.
 * All detail loads require an explicit injected fixture due to AG1 Core GET
 * row-insertion hazard. Opt-in never writes or requests step status changes.
 */
export function DailyCoursePanel({
  userId,
  loadToday = getTodayDailyCourse,
  loadDay,
  routeMode = false,
  routeScheduleId = null,
  enableConnectedProgress = false,
  catalogCard = false,
}: {
  userId: string;
  loadToday?: () => Promise<DailyToday>;
  loadDay?: DailyReadOnlyLoader;
  routeMode?: boolean;
  routeScheduleId?: string | null;
  enableConnectedProgress?: boolean;
  catalogCard?: boolean;
}) {
  const [openScheduleKey, setOpenScheduleKey] = useState<string | null>(null);
  const today = useQuery({
    queryKey: ["daily-course", "today", userId],
    queryFn: loadToday,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // A cached schedule/entitlement is not authorization for this date.
  // Never open a new Moscow day merely because an older date was open.
  const ready = today.isSuccess && !today.isFetching;
  const scheduleKey =
    ready && today.data.scheduleId && today.data.day
      ? today.data.scheduleId + ":" + today.data.mskDate
      : null;
  const open =
    !!scheduleKey &&
    (routeMode ? routeScheduleId === today.data?.scheduleId : openScheduleKey === scheduleKey);
  const mismatch =
    routeMode &&
    !!routeScheduleId &&
    ready &&
    (!today.data.day || today.data.scheduleId !== routeScheduleId);
  // Live authenticated Next shows its daily assignment above search/filters.
  // The source visual card is rendered only from a fresh, authenticated Today GET.
  // No catalog card or owner summary is exposed during revalidation.
  // Next omits the hero entirely if no assignment was published for the day.
  if (catalogCard && routeMode && !routeScheduleId && ready && !today.data.day)
    return null;
  if (catalogCard && routeMode && !routeScheduleId && ready &&
      today.data.day && today.data.scheduleId) {
    const data = today.data;
    const scheduleId = data.scheduleId!;
    const day = data.day!;
    const total = data.stepsSummary.total;
    const percent = total === 0 ? 0 : Math.round(data.stepsSummary.completed / total * 100);
    return <section className={sourceCard.dailyCourseSection}
      aria-label="Курс дня" data-next-daily-course-card>
      <RouteLink to={dailyCoursePath(scheduleId)}
        className={sourceCard.dailyCourseCard}>
        <div className={sourceCard.dailyCourseMedia}>
          <img className={sourceCard.dailyCourseImage} src={DAILY_COURSE_LOGO.url}
            alt={DAILY_COURSE_LOGO.alt} width={245} height={140}
            loading="eager" fetchPriority="high"/>
        </div>
        <div className={sourceCard.dailyCourseContent}>
          <div className={sourceCard.dailyCourseHeader}>
            <div className={sourceCard.dailyCourseTitleRow}>
              <svg className={sourceCard.dailyCourseTitleIcon} aria-hidden="true"
                viewBox="0 0 24 24" width="19" height="19" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7z"/>
              </svg>
              <span className={sourceCard.dailyCourseTitle}>Задание дня</span>
            </div>
            <span className={sourceCard.dailyCourseRefreshStatus}>
              <svg className={sourceCard.dailyCourseRefreshIcon} aria-hidden="true"
                viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.93 9h-2.02A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/>
              </svg>
              Ежедневно
            </span>
          </div>
          <p className={sourceCard.dailyCourseDescription}>
            Каждый день — новая короткая связка упражнений для спокойного прогресса с собакой.
          </p>
          <div className={sourceCard.dailyCourseProgressRow}>
            <span>{day.stepsCount} упражнения</span>
            <span>{data.stepsSummary.completed}/{total} выполнено</span>
          </div>
          <div className={sourceCard.dailyCourseProgressTrack}
            aria-label={`Прогресс курса дня: ${percent}%`}>
            <span className={sourceCard.dailyCourseProgressFill} style={{width: percent + "%"}}/>
          </div>
        </div>
      </RouteLink>
    </section>;
  }
  return (
    <section aria-label="Курс дня" className="daily-course-panel">
      {(!open || !routeMode) && <div className="daily-course-heading">
        <div>
          <h2>Задание дня</h2>
          <p className="note">Ежедневные упражнения GAFUS</p>
        </div>
        <RouteLink to="/courses">Все курсы</RouteLink>
      </div>}
      {today.isPending && <Loading message="Загружаем курс дня…" />}
      {today.isFetching && today.data && <Loading variant="compact" message="Перепроверяем курс дня…" />}
      {today.isError && (
        <div role="alert" className="empty-state">
          <p>{errorMessage(today.error)}</p>
          {isExpiredSession(today.error) && <RouteLink to="/login">Войти</RouteLink>}
          {!isTerminalDailyError(today.error) &&
            <PrimaryButton type="button" onClick={() => void today.refetch()}>
              Повторить загрузку
            </PrimaryButton>}
        </div>
      )}
      {mismatch && <p role="alert">Задание не найдено или недоступно.</p>}
      {ready && !mismatch && today.data.day === null && (
        <p role="status" className="empty-state">
          На {today.data.mskDate} (МСК) задание дня не опубликовано.
        </p>
      )}
      {ready && !mismatch && today.data.day && (
        <>
          {!open && <p className="note">Дата задания (Москва): {today.data.mskDate}</p>}
          {!open && (
            <article className="daily-course-summary">
              <h3>{today.data.day.title}</h3>
              {today.data.day.description.trim() && (
                <div className="training-description" role="region"
                  aria-label="Описание задания дня">
                  <SafeCourseDescriptionMarkdown description={today.data.day.description} />
                </div>
              )}
              <p>
                Статус: <strong>{statusLabels[today.data.userStatus]}</strong>
              </p>
              <div className="training-duration">
                <span>Практика · {today.data.day.estimatedDuration} мин</span>
                <span>Теория · {today.data.day.theoryMinutes} мин</span>
              </div>
              <p>Упражнений: {today.data.day.stepsCount}</p>
              <p>
                Выполнено: {today.data.stepsSummary.completed} из {today.data.stepsSummary.total}
              </p>
              <progress
                aria-label="Прогресс курса дня"
                value={today.data.stepsSummary.completed}
                max={today.data.stepsSummary.total || 1}
              />
              {loadDay ? (
                routeMode ? (
                  <RouteLink to={dailyCoursePath(today.data.scheduleId!)}>
                    Посмотреть шаги
                  </RouteLink>
                ) : (
                  <button type="button" onClick={() => setOpenScheduleKey(scheduleKey)}>
                    Посмотреть шаги
                  </button>
                )
              ) : (
                <p className="note">
                  Просмотр шагов пока ожидает проверку серверного read-only контракта.
                </p>
              )}
            </article>
          )}
          {open && loadDay && (
            <DayContent
              key={today.data.scheduleId + ":" + today.data.mskDate}
              userId={userId}
              today={today.data}
              loadDay={loadDay}
              enableConnectedProgress={enableConnectedProgress}
              showBack={!routeMode}
              onBack={() => (routeMode ? navigate("/courses") : setOpenScheduleKey(null))}
            />
          )}
        </>
      )}
      {!enableConnectedProgress && <p className="note">
        Просмотр без изменения прогресса, таймеров и открытия платного контента.
      </p>}
    </section>
  );
}
