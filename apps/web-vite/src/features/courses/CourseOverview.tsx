import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCourses } from "./courseApi";
import { courseLevelLabel, courseProgressLabel } from "./CourseCatalog";
import { ApiError } from "../../shared/api/client";
import { RouteLink, trainingCoursePath, trainingReviewsPath } from "../../shared/router/location";
import { TrainingIndexOptInHarness } from "../training/TrainingIndexOptInHarness";
import type { TrainingDaysOverview, TrainingDaySummary } from "../training/trainingDaysApi";
import type { TrainingDayDetail } from "../training/trainingDayApi";
import courseStyles from "../../brand/LegacyCourseCard.module.css";

/**
 * Minimal catalog-backed overview. Course steps are NOT loaded here.
 * Unauthenticated direct links are redirected by App. This component
 * independently declines both rendering and data fetching without a principal.
 */
export function CourseOverview({
  userId,
  courseId,
  showTrainingDaysOptIn = false,
  trainingDaysLoader,
  showTrainingStepsOptIn = false,
  trainingDayLoader,
  trainingRouteMode = false,
  showReviewsLink = false,
  connectedRoute = false,
}: {
  userId: string | null;
  courseId: string;
  showTrainingDaysOptIn?: boolean;
  trainingDaysLoader?: (type: string) => Promise<TrainingDaysOverview>;
  showTrainingStepsOptIn?: boolean;
  trainingDayLoader?: (type: string, day: TrainingDaySummary) => Promise<TrainingDayDetail>;
  trainingRouteMode?: boolean;
  showReviewsLink?: boolean;
  connectedRoute?: boolean;
}) {
  const [coverError, setCoverError] = useState(false);
  const query = useQuery({
    queryKey: ["courses", "catalog", userId ?? "unverified"],
    queryFn: () => listCourses(),
    enabled: Boolean(userId),
    staleTime: 0,
    retry: false,
  });
  // Access and opt-in training navigation require the latest authorized read.
  const ready = query.isSuccess && !query.isFetching;
  const course = ready ? query.data.find((row) => row.id === courseId) : undefined;
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;

  if (!userId) return null;

  return (
    <section className="catalog" aria-label="Обзор курса">
      <p>
        <BackButtonLink to="/courses">Все курсы</BackButtonLink>
      </p>
      {query.isPending && <Loading message="Загружаем информацию о курсе…" />}
      {query.isFetching && query.data && <Loading message="Проверяем доступ к курсу…" />}
      {query.isError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к курсу."
                : "Не удалось загрузить курс."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && !course && <p role="status">Курс не найден или недоступен.</p>}
      {ready && course && (
        <article className="course-card gafus-course-overview">
          <div className={courseStyles.imageContainer}>
            <div className={courseStyles.imageFrame}>
              {course.logoImg && !coverError ? (
                <img src={course.logoImg} alt={`Обложка курса «${course.name}»`}
                  className={courseStyles.image} width={350} height={200}
                  onError={() => setCoverError(true)} />
              ) : <div className="gafus-missing-course-cover" aria-hidden="true" />}
            </div>
          </div>
          <h2>{course.name}</h2>
          <p>{course.shortDesc}</p>
          <dl className="course-details">
            <div>
              <dt>Длительность</dt>
              <dd>{course.duration}</dd>
            </div>
            <div>
              <dt>Уровень</dt>
              <dd>{courseLevelLabel(course.trainingLevel)}</dd>
            </div>
            {userId && (
              <div>
                <dt>Прогресс</dt>
                <dd>{courseProgressLabel(course.userStatus)}</dd>
              </div>
            )}
          </dl>
          <p className={course.hasAccess ? "access-tag" : "access-tag locked"}>
            {course.hasAccess
              ? "Курс доступен"
              : "Для занятий требуется подписка или назначение"}
          </p>
          {(connectedRoute || trainingRouteMode && showTrainingDaysOptIn) &&
            userId && course.hasAccess && (
            <p>
              <RouteLink to={trainingCoursePath(course.type)}>Содержание и шаги курса →</RouteLink>
            </p>
          )}
          {(connectedRoute || showTrainingDaysOptIn) && !!userId &&
            course.isPaid && !course.isPrivate && !course.hasAccess && <p>
              <RouteLink to={trainingCoursePath(course.type)}>
                Посмотреть программу платного курса →
              </RouteLink>
            </p>}
          {(showReviewsLink || connectedRoute) && !!userId && course.hasAccess && <p>
            <RouteLink to={trainingReviewsPath(course.type)}>Отзывы о курсе →</RouteLink>
          </p>}
          <TrainingIndexOptInHarness
            enabled={!trainingRouteMode && showTrainingDaysOptIn && !!userId && course.hasAccess}
            userId={userId}
            courseType={course.type}
            courseName={course.name}
            loadDays={trainingDaysLoader}
            showStepsOptIn={showTrainingStepsOptIn}
            loadDay={trainingDayLoader}
          />
          {showTrainingDaysOptIn && !course.hasAccess &&
            (course.isPrivate || !course.isPaid) && (
            <p role="status">Для просмотра дней курса необходим доступ.</p>
          )}
        </article>
      )}
    </section>
  );
}
