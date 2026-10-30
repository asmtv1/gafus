import { Loading } from "../../shared/ui";
import { BackButtonLink, CaramelButton, PrimaryButton } from "../../shared/ui";
import { CourseShareButton } from "./CourseShareButton";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./TrainingNextMainGeometry.css";
import { useQuery } from "@tanstack/react-query";
import { DAY_TYPE_LABELS } from "@gafus/core-client/utils/training";
import { ApiError } from "../../shared/api/client";
import {
  RouteLink,
  navigate,
  trainingDayPath,
  trainingCoursePath,
} from "../../shared/router/location";
import {
  listTrainingDays,
  type TrainingDaysOverview,
  type TrainingDaySummary,
} from "./trainingDaysApi";
import { TrainingDayViewer } from "./TrainingDayViewer";
import { getTrainingDay, type TrainingDayDetail } from "./trainingDayApi";
import {TrainingPersonalizationForm} from "./TrainingPersonalizationForm";
// Reuse the Next Markdown/GFM stack without loading it on every Web screen.
const SafeCourseDescriptionMarkdown=lazy(()=>import("./SafeCourseDescriptionMarkdown")
  .then(mod=>({default:mod.SafeCourseDescriptionMarkdown})));

const statusLabels: Record<TrainingDaySummary["userStatus"], string> = {
  NOT_STARTED: "Не начат",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Пройден",
  PAUSED: "На паузе",
  RESET: "Сброшен",
};
const typeLabels: Record<string, string> = {
  practice: "Практика",
  theory: "Теория",
  summary: "Итоги",
};
const titleFor = (title: string) => title.replace(/^День\s+(?=\d)/i, "Блок ");
const levelLabels: Record<string,string> = {
  BEGINNER: "Начальный", INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый", EXPERT: "Экспертный",
};
function DayCard({
  day,
  position,
  onOpenSteps,
  routeToDay,
  nextRoute = false,
}: {
  routeToDay?: string;
  nextRoute?: boolean;
  day: TrainingDaySummary;
  position: number;
  onOpenSteps?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lockedNoticeOpen, setLockedNoticeOpen] = useState(false);
  const lockedCardRef = useRef<HTMLButtonElement>(null);
  const noticeDismissRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (lockedNoticeOpen) noticeDismissRef.current?.focus();
  }, [lockedNoticeOpen]);
  const dismissLockedNotice = () => {
    setLockedNoticeOpen(false);
    lockedCardRef.current?.focus();
  };
  const label = day.isLocked ? "Закрыт" : statusLabels[day.userStatus];
  if (nextRoute) {
    // Source TrainingDayList: whole day card is one link. Only a verified
    // unlocked Hono route target may navigate; never construct a fallback ID.
    const content = <div className="training-next-day-card-surface">
      <div className="training-next-day-card-meta">
        <span className="training-next-day-card-number">
          Блок {String(position).padStart(2, "0")}
        </span>
        <span className={"training-next-day-card-status" +
          (day.isLocked ? " training-next-day-card-status-locked" : "")}>
          {day.isLocked && <svg className="training-next-day-card-lock-icon"
            viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm9 14H6V10h12v10z"/>
          </svg>}{label}
        </span>
      </div>
      <h2 className="training-next-day-card-title">{titleFor(day.title)}</h2>
      <p className="training-next-day-card-type">
        {DAY_TYPE_LABELS[day.type] ?? day.type}
      </p>
      {day.equipment.trim() && day.equipment.trim() !== "-" &&
        <p className="training-next-day-card-equipment">
          <strong>Понадобится: </strong>{day.equipment}
        </p>}
      <div className="training-next-day-card-footer">
        <div className="training-next-day-card-durations">
          {day.estimatedDuration > 0 &&
            <span className="training-next-day-card-practice">
              Практика · {day.estimatedDuration} мин
            </span>}
          {day.theoryMinutes > 0 &&
            <span className="training-next-day-card-theory">
              Теория · {day.theoryMinutes} мин
            </span>}
        </div>
        <span className="training-next-day-card-arrow" aria-hidden="true">→</span>
      </div>
    </div>;
    return <li className={"training-next-day-list-item" +
      (day.userStatus === "IN_PROGRESS" ? " training-next-day-list-item--inprogress" : "") +
      (day.userStatus === "COMPLETED" ? " training-next-day-list-item--completed" : "") +
      (day.userStatus === "RESET" ? " training-next-day-list-item--reset" : "")}>
      {day.isLocked
        ? <button type="button" ref={lockedCardRef}
            className="training-next-day-card-link training-next-day-card-locked"
            aria-haspopup="dialog" aria-expanded={lockedNoticeOpen}
            onClick={() => setLockedNoticeOpen(true)}>{content}</button>
        : routeToDay
          ? <RouteLink to={routeToDay as ReturnType<typeof trainingDayPath>}
              className="training-next-day-card-link">{content}</RouteLink>
          : <div className="training-next-day-card-link training-next-day-card-locked"
              aria-disabled="true">{content}</div>}
      {lockedNoticeOpen && <div className="training-next-locked-backdrop">
        <section role="alertdialog" aria-modal="true"
          aria-labelledby={"training-next-locked-heading-" + position}
          aria-describedby={"training-next-locked-description-" + position}
          className="training-next-locked-dialog"
          onKeyDown={event => { if (event.key === "Escape") dismissLockedNotice(); }}>
          <h3 id={"training-next-locked-heading-" + position}>День заблокирован 🔒</h3>
          <p id={"training-next-locked-description-" + position}>
            Чтобы открыть этот день, необходимо завершить все остальные дни курса.
            Продолжайте тренировки, и этот день станет доступен автоматически!
          </p>
          <button type="button" ref={noticeDismissRef}
            onClick={dismissLockedNotice}>Понятно</button>
        </section>
      </div>}
    </li>;
  }
  return (
    <li className="training-day-card">
      <article aria-label={day.title}>
        <div className="training-day-meta">
          <span>Блок {String(position).padStart(2, "0")}</span>
          <span className={day.isLocked ? "access-tag locked" : "access-tag"}>{label}</span>
        </div>
        <h3>{titleFor(day.title)}</h3>
        <p className="note">{typeLabels[day.type.toLowerCase()] ?? day.type}</p>
        {day.equipment.trim() && day.equipment.trim() !== "-" && (
          <p>
            <strong>Понадобится:</strong> {day.equipment}
          </p>
        )}
        <p className="training-duration">
          {day.estimatedDuration > 0 && <span>Практика · {day.estimatedDuration} мин</span>}
          {day.theoryMinutes > 0 && <span>Теория · {day.theoryMinutes} мин</span>}
          {day.estimatedDuration === 0 && day.theoryMinutes === 0 && (
            <span>Длительность не указана</span>
          )}
        </p>
        <button
          className="button-secondary"
          type="button"
          aria-expanded={expanded}
          aria-controls={"training-day-info-" + position}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Скрыть подробности" : "Подробнее"}
        </button>
        {routeToDay && !day.isLocked ? (
          <RouteLink
            to={routeToDay as ReturnType<typeof trainingDayPath>}
            className="training-step-open"
          >
            Открыть шаги блока →
          </RouteLink>
        ) : (
          onOpenSteps &&
          !day.isLocked && (
            <button type="button" className="training-step-open" onClick={onOpenSteps}>
              Открыть шаги блока →
            </button>
          )
        )}
        {expanded && (
          <div id={"training-day-info-" + position} className="training-day-detail">
            <p>{day.isLocked ? "Этот блок пока закрыт." : "Статус блока: " + label + "."}</p>
            <p className="note">
              {day.isLocked
                ? "Чтение шагов недоступно, пока блок закрыт сервером."
                : routeToDay || onOpenSteps
                  ? "Шаги этого блока можно открыть для чтения без изменения прогресса."
                  : "Чтение шагов в этом разделе пока не подключено."}
            </p>
          </div>
        )}
      </article>
    </li>
  );
}
/** Full read-only day listing; NO step side effects or payment logic. */
type TrainingIndexProps = {
  userId: string | null;
  courseType: string;
  courseName: string;
  loadDays?: (type: string) => Promise<TrainingDaysOverview>;
  showStepsOptIn?: boolean;
  loadDay?: (type: string, day: TrainingDaySummary) => Promise<TrainingDayDetail>;
  routeMode?: boolean;
  routeDayId?: string | null;
};

/** Remount local selection on principal/course switch; no cross-user state. */
export function TrainingIndex(props: TrainingIndexProps) {
  return <TrainingIndexScreen key={`${props.userId ?? "unverified"}/${props.courseType}`} {...props} />;
}

function TrainingIndexScreen({
  userId,
  courseType,
  courseName,
  loadDays = listTrainingDays,
  showStepsOptIn = false,
  loadDay = getTrainingDay,
  routeMode = false,
  routeDayId = null,
}: TrainingIndexProps) {
  const [selectedDay, setSelectedDay] = useState<TrainingDaySummary | null>(null);
  // Original Next CourseDescriptionWithVideo is initially collapsed on direct
  // course routes. Preserve original non-route opt-in display and owner key.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editPersonalization,setEditPersonalization]=useState(()=>
    typeof window!=="undefined"&&new URLSearchParams(window.location.search)
      .get("personalize")==="1");
  const query = useQuery({
    queryKey: ["training", "days", userId ?? "unverified", courseType],
    queryFn: () => loadDays(courseType),
    enabled: !!userId && !!courseType,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // A cached success is not current authorization. Never use old access or
  // route targets while the owner-scoped request is revalidating.
  const ready = query.isSuccess && !query.isFetching;
  if (routeMode && routeDayId && ready && userId &&
      !query.data.requiresPersonalization) {
    const selected = query.data.days.find((day) => day.dayOnCourseId === routeDayId);
    if (!selected || selected.isLocked || query.data.requiresPersonalization)
      return (
        <section role="alert" className="catalog training-index">
          <p>День не найден или недоступен. Откройте список блоков.</p>
          <BackButtonLink to={trainingCoursePath(courseType)}>К списку блоков</BackButtonLink>
        </section>
      );
    return (
      <TrainingDayViewer
        key={userId + ":" + courseType + ":" + routeDayId}
        userId={userId}
        courseType={courseType}
        day={selected}
        onBack={() => navigate(trainingCoursePath(courseType))}
        loadDay={loadDay}
        enableConnectedProgress
      />
    );
  }
  // A missing principal is redirected by App; never render a standalone
  // preview of private training content or invite a guest into this screen.
  if (!userId) return null;
  const verifiedSelected =
    ready &&
    selectedDay &&
    query.data.days.find(
      (item) => item.dayOnCourseId === selectedDay.dayOnCourseId && !item.isLocked,
    );
  if (showStepsOptIn && verifiedSelected && !query.data.requiresPersonalization) {
    // Selection belongs to this owner/course mounted instance only. A new
    // owner or course remounts the TrainingIndex through the opt-in harness.
    return (
      <TrainingDayViewer
        key={userId + ":" + courseType + ":" + verifiedSelected.dayOnCourseId}
        userId={userId}
        courseType={courseType}
        day={verifiedSelected}
        onBack={() => setSelectedDay(null)}
        loadDay={loadDay}
      />
    );
  }
  return (
    <section className={routeMode
      ? "catalog training-index training-index-route" : "catalog training-index"}
      aria-label="Тренировочные дни">
      {routeMode ? <h2 className="training-index-route-title">Содержание</h2> :
        <div className="training-index-heading">
          <div>
            <h2>Содержание</h2>
            <p className="note">{courseName}</p>
          </div>
          <RouteLink to="/courses">Все курсы</RouteLink>
        </div>}
      {query.isPending && <Loading message="Загружаем дни тренировок…" />}
      {query.isFetching && query.data && <Loading variant="compact" message="Перепроверяем доступ к курсу…" />}
      {query.isError && (
        <div role="alert" className="empty-state">
          <p>
            {query.error instanceof ApiError && query.error.status === 403
              ? "Нет доступа к этому курсу."
              : query.error instanceof ApiError && query.error.status === 401
                ? "Сессия завершена. Войдите снова."
                : "Не удалось загрузить дни тренировок."}
          </p>
          {query.error instanceof ApiError && query.error.status === 401 ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : query.error instanceof ApiError && query.error.status === 403 ? null : (
            <PrimaryButton type="button" onClick={() => void query.refetch()}>
              Повторить загрузку
            </PrimaryButton>
          )}
        </div>
      )}
      {ready && query.data.requiresPersonalization && (
        query.data.courseId ?
          <TrainingPersonalizationForm key={userId+":"+query.data.courseId}
            ownerId={userId} courseId={query.data.courseId}
            courseType={courseType}
            onVerified={()=>{void query.refetch();}}/> :
          <div role="alert" className="empty-state">
            Не удалось определить курс. Попробуйте загрузить его заново.
          </div>
      )}
      {ready && !query.data.requiresPersonalization &&
        query.data.isPersonalizedCourse===true && query.data.courseId && (
          <div className={routeMode ? "training-course-personalization-actions training-course-personalization-actions--route" : "training-course-personalization-actions"}>
            {editPersonalization ?
              <TrainingPersonalizationForm key={userId+":"+query.data.courseId+":edit"}
                ownerId={userId} courseId={query.data.courseId} courseType={courseType}
                editMode onVerified={()=>{
                  setEditPersonalization(false);
                  void query.refetch();
                }}/> :
              <CaramelButton className="training-course-personalization-button"
                onClick={()=>setEditPersonalization(true)}>
                Изменить персонализацию
              </CaramelButton>}
          </div>
        )}
      {ready && (routeMode || query.data.courseDescription ||
        query.data.courseEquipment || query.data.courseTrainingLevel) && (
        <section className={routeMode
          ? "training-course-overview training-course-overview-next"
          : "training-course-overview"}
          aria-label="Описание курса">
          {routeMode ? <button type="button" className="training-next-course-description-toggle"
            aria-expanded={overviewOpen} aria-controls="training-next-course-description-content"
            onClick={() => setOverviewOpen(open => !open)}>
            <span className="training-next-course-description-title" role="heading"
              aria-level={3}>Описание курса</span>
            <span className="training-next-course-description-more">
              {overviewOpen ? "Скрыть" : "Подробнее"}
              <svg viewBox="0 0 24 24" width="24" height="24"
                className={overviewOpen ? "training-next-course-description-icon expanded"
                  : "training-next-course-description-icon"}
                fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
              </svg>
            </span>
          </button> : <h3>Описание курса</h3>}
          {(!routeMode || overviewOpen) && <div
            id={routeMode ? "training-next-course-description-content" : undefined}
            className={routeMode ? "training-next-course-description-content" : undefined}>
            {query.data.courseDescription && (
              <Suspense fallback={<Loading message="Загружаем описание курса…" />}>
                <SafeCourseDescriptionMarkdown description={query.data.courseDescription} />
              </Suspense>
            )}
            <dl className="training-course-read-meta">
              {query.data.courseTrainingLevel && <div>
                <dt>Уровень сложности:</dt>
                <dd>{levelLabels[query.data.courseTrainingLevel] ?? "Не указан"}</dd>
              </div>}
              {query.data.courseEquipment && <div>
                <dt>Необходимое оборудование:</dt>
                <dd>{query.data.courseEquipment}</dd>
              </div>}
            </dl>
            {!query.data.requiresPersonalization && <div className="training-course-share-actions">
              <CourseShareButton courseName={courseName} courseType={courseType}
                courseDescription={query.data.courseDescription ?? undefined} />
            </div>}
          </div>}
        </section>
      )}
      {ready && !query.data.requiresPersonalization && query.data.days.length === 0 && (
        <p className="empty-state" role="status">
          Тренировочные дни ещё не опубликованы.
        </p>
      )}
      {ready && !query.data.requiresPersonalization && query.data.days.length > 0 && (
        <section className="training-course-plan" aria-labelledby="training-course-plan-heading">
          <h3 id="training-course-plan-heading" className="training-course-plan-title">
            План занятий
          </h3>
          <ol className={routeMode
            ? "training-days-list training-next-days-list" : "training-days-list"}>
          {query.data.days.map((day, index) => (
            <DayCard
              key={day.dayOnCourseId}
              nextRoute={routeMode}
              day={day}
              position={index + 1}
              onOpenSteps={
                showStepsOptIn && !routeMode && !day.isLocked
                  ? () => setSelectedDay(day)
                  : undefined
              }
              routeToDay={
                showStepsOptIn && routeMode && !day.isLocked
                  ? trainingDayPath(courseType, day.dayOnCourseId)
                  : undefined
              }
            />
          ))}
          </ol>
        </section>
      )}
    </section>
  );
}
