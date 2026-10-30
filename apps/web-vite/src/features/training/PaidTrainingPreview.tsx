import { Loading } from "../../shared/ui";
import { DAY_TYPE_LABELS } from "@gafus/core-client/utils/training";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { RouteLink, trainingCoursePath, trainingDayPath, navigate } from "../../shared/router/location";
import { TrainingDayViewer } from "./TrainingDayViewer";
import type { TrainingDaySummary } from "./trainingDaysApi";
import { SafeCourseDescriptionMarkdown } from "./SafeCourseDescriptionMarkdown";
import "./TrainingNextMainGeometry.css";
import { getPaidCourseOutline } from "./paidCourseOutlineApi";
import styles from "./PaidTrainingPreview.module.css";
import {PrimaryButton} from "../../shared/ui";

/** Next paid-course overview. A failed entitlements GET does not authorize
 * lesson media: Core /training/day independently redacts each locked step.
 */
export function PaidTrainingPreview({ userId, courseType, dayId }: {
  userId: string;
  courseType: string;
  dayId: string | null;
}) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const query = useQuery({
    queryKey: ["training", "paid-outline", courseType],
    queryFn: () => getPaidCourseOutline(courseType),
    staleTime: 0, retry: false, gcTime: 0,
  });
  const ready = query.isSuccess && !query.isFetching;
  const selected = ready && dayId ? query.data.outline.find(day => day.id === dayId) : null;
  if (ready && dayId && selected) {
    // Core intentionally allows eligible individual PAID steps for Gafus,
    // without authorizing the rest of the course. The real Hono /training/day
    // independently redacts each step; this outline is not a permission.
    const day: TrainingDaySummary = {
      trainingDayId: selected.id,
      dayOnCourseId: selected.id,
      courseId: query.data.courseId,
      title: selected.title,
      type: selected.type ?? "regular",
      userStatus: "NOT_STARTED",
      estimatedDuration: selected.estimatedDuration ?? 0,
      theoryMinutes: selected.theoryMinutes ?? 0,
      equipment: selected.equipment ?? "",
      isLocked: false,
    };
    return <section className="catalog training-index" aria-label="Шаги платного курса">
      <TrainingDayViewer userId={userId} courseType={courseType}
        day={day} onBack={() => navigate(trainingCoursePath(courseType))}
        enableConnectedProgress />
    </section>;
  }
  return <section className={`catalog training-index training-index-route training-paid-preview ${styles.page}`}
    aria-label="Программа платного курса">
    <h2 className={styles.pageTitle}>Содержание</h2>
    {ready && <p className={styles.courseName}>{query.data.name}</p>}
    {(query.isPending || query.isFetching) && <Loading message="Загружаем программу курса…" />}
    {query.isError && <div role="alert">
      {query.error instanceof ApiError && query.error.status === 404
        ? "Программа курса не найдена или недоступна."
        : "Не удалось загрузить программу платного курса."}
      <PrimaryButton type="button" onClick={() => void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {ready && dayId && !selected && <p role="alert">День не найден в программе курса.</p>}
    {ready && <>
      <div className={styles.descriptionContainer}>
        <button type="button" className={styles.descriptionHeader}
          aria-expanded={descriptionOpen} aria-controls="paid-course-description"
          onClick={() => setDescriptionOpen(current => !current)}>
          <h3 className={styles.descriptionTitle}>Описание курса</h3>
          <span className={styles.expandControl}>
            <span className={styles.expandText}>
              {descriptionOpen ? "Скрыть" : "Подробнее"}
            </span>
            <svg className={descriptionOpen
              ? `${styles.expandIcon} ${styles.expanded}` : styles.expandIcon}
              viewBox="0 0 24 24" width="24" height="24" fill="currentColor"
              aria-hidden="true" focusable="false">
              <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
            </svg>
          </span>
        </button>
        {descriptionOpen && <div id="paid-course-description" className={styles.descriptionContent}>
          {query.data.description && <Suspense fallback={<Loading message="Загружаем описание…" />}>
            <SafeCourseDescriptionMarkdown description={query.data.description}/>
          </Suspense>}
          {query.data.trainingLevel && <p>
            <strong>Уровень сложности:</strong> {query.data.trainingLevel}
          </p>}
          {query.data.equipment && <p>
            <strong>Необходимое оборудование:</strong> {query.data.equipment}
          </p>}
        </div>}
      </div>
      {query.data.outline.length > 0 ? <section className="training-course-plan"
        aria-labelledby="paid-training-course-plan-heading">
        <h3 id="paid-training-course-plan-heading" className="training-course-plan-title">
          План занятий
        </h3>
        <ol className="training-days-list training-next-days-list">
          {query.data.outline.slice().sort((a, b) => a.order - b.order).map((day, index) =>
            <li key={day.id} className="training-next-day-list-item">
              <RouteLink to={trainingDayPath(courseType, day.id)}
                className="training-next-day-card-link">
                <div className="training-next-day-card-surface">
                  <div className="training-next-day-card-meta">
                    <span className="training-next-day-card-number">
                      Блок {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="training-next-day-card-status">Шаги внутри</span>
                  </div>
                  <h4 className="training-next-day-card-title">{day.title}</h4>
                  {day.type && <p className="training-next-day-card-type">
                    {DAY_TYPE_LABELS[day.type] ?? day.type}
                  </p>}
                  {day.equipment?.trim() && day.equipment.trim() !== "-" &&
                    <p className="training-next-day-card-equipment">
                      <strong>Понадобится: </strong>{day.equipment}
                    </p>}
                  <div className="training-next-day-card-footer">
                    <div className="training-next-day-card-durations">
                      {(day.estimatedDuration ?? 0) > 0 &&
                        <span className="training-next-day-card-practice">
                          Практика · {day.estimatedDuration} мин
                        </span>}
                      {(day.theoryMinutes ?? 0) > 0 &&
                        <span className="training-next-day-card-theory">
                          Теория · {day.theoryMinutes} мин
                        </span>}
                    </div>
                    <span className="training-next-day-card-arrow" aria-hidden="true">→</span>
                  </div>
                </div>
              </RouteLink>
            </li>)}
        </ol>
      </section> : <p role="status">Занятия ещё не опубликованы.</p>}
      <p className={styles.stepAccessHint}>
        Вы можете просмотреть все блоки курса. Подписка или открытие за гафусы
        потребуется только для защищённых шагов.
      </p>
    </>}
  </section>;
}
