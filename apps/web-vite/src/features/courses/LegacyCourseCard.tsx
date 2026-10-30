/** GAFUS legacy course card layout, adapted to the strict course catalog DTO.
 * The original CSS module is used byte-for-byte; no secret course fields, CDN
 * proxy or independent entitlement logic is introduced here. */
import { useState } from "react";
import { trainingCoursePath, RouteLink } from "../../shared/router/location";
import { TrainingStatus } from "@gafus/types";
import type { CourseCatalogItem } from "./courseApi";
import { courseLevelLabel } from "./courseLabels";
import styles from "../../brand/LegacyCourseCard.module.css";

// The currently rendered Next CourseCard uses these three MUI silhouettes.
// Inline paths avoid pulling Material UI into the independent Vite bundle.
const factIconPaths = {
  time: [
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
    "M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  ],
  level: ["M17 4h3v16h-3zM5 14h3v6H5zm6-5h3v11h-3z"],
  status: ["M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8"],
  participants: ["M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5M4.34 17c.84-.58 2.87-1.25 4.66-1.25s3.82.67 4.66 1.25zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12m0-5c.83 0 1.5.67 1.5 1.5S9.83 10 9 10s-1.5-.67-1.5-1.5S8.17 7 9 7m7.04 6.81c1.16.84 1.96 1.96 1.96 3.44V19h4v-1.75c0-2.02-3.5-3.17-5.96-3.44M15 12c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35"],
} as const;
function CourseFactIcon({ kind }: { kind: keyof typeof factIconPaths }) {
  return <svg className={styles.factIcon} aria-hidden="true" focusable="false"
    viewBox="0 0 24 24" fill="currentColor">
    {factIconPaths[kind].map((d) => <path key={d} d={d} />)}
  </svg>;
}

// Source Next uses STEP_STATUS_LABELS rather than the catalog-filter labels.
const cardStatusLabel: Record<string, string> = {
  [TrainingStatus.NOT_STARTED]: "Не начат",
  [TrainingStatus.IN_PROGRESS]: "В процессе",
  [TrainingStatus.COMPLETED]: "Завершен",
  [TrainingStatus.PAUSED]: "На паузе",
  [TrainingStatus.RESET]: "Сброшен",
};
function cardStatusClass(status: CourseCatalogItem["userStatus"]) {
  if (status === TrainingStatus.IN_PROGRESS || status === TrainingStatus.PAUSED) {
    return styles.inProgress;
  }
  if (status === TrainingStatus.COMPLETED) return styles.completed;
  if (status === TrainingStatus.RESET) return styles.reset;
  return styles.notStarted;
}
function pluralPeople(value: number) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "человек";
  const last = value % 10;
  return last === 1 ? "человек" : last >= 2 && last <= 4 ? "человека" : "человек";
}
function sourceDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function LegacyCourseCard({ course }: {
  course: CourseCatalogItem;
  userId: string | null;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const image = course.logoImg && !imageBroken ? course.logoImg : null;
  // Original Next CourseCard opens the training route, never a separate
  // /courses/:id overview. The canonical /courses/:id URL remains registered
  // only for existing legacy direct bookmarks.
  const path = trainingCoursePath(course.type);
  return (
    <li className={`${styles.courseCard} course-card`}>
      <RouteLink to={path} className={styles.link}>
        <div className={styles.imageContainer}>
          <div className={styles.imageFrame}>
            {image ? (
              <img className={styles.image} src={image}
                width={350} height={200} loading="lazy"
                alt={`Обложка курса «${course.name}»`}
                onError={() => setImageBroken(true)} />
            ) : <div className="gafus-missing-course-cover" aria-hidden="true" />}
          </div>
        </div>
        <div className={styles.content}>
          {(course.isPaid || course.isPrivate) && (
            <div className={styles.accessLabels}>
              {course.isPaid && <><span className={styles.accessLabel}>Платный</span>
                <span className={styles.accessLabel}>По подписке</span></>}
              {course.isPrivate && <span className={styles.accessLabel}>Приватный</span>}
            </div>
          )}
          <div className="course-card-heading">
            <h3 className={styles.title}>{course.name}</h3>
          </div>
          <div className={styles.factsRow}>
            <span className={styles.fact}><CourseFactIcon kind="time" /><span>{course.duration}</span></span>
            <span className={styles.fact}><CourseFactIcon kind="level" /><span>{courseLevelLabel(course.trainingLevel)}</span></span>
            <span className={`${styles.fact} ${cardStatusClass(course.userStatus)}`}>
              <CourseFactIcon kind="status" /><span>{cardStatusLabel[course.userStatus]}</span>
            </span>
          </div>
          <div className={styles.description}><p>{course.shortDesc}</p></div>
          {"startedUsersCount" in course &&
            typeof course.startedUsersCount === "number" && course.startedUsersCount > 0 &&
            <div className={styles.participants}>
              <svg className={styles.participantsIcon} aria-hidden="true"
                viewBox="0 0 24 24" fill="currentColor">
                <path d={factIconPaths.participants[0]} />
              </svg>
              Этот курс уже прошли {course.startedUsersCount}{" "}
              {pluralPeople(course.startedUsersCount)}
            </div>}
          {"startedAt" in course && course.startedAt &&
            <div className={styles.date}><b>Начат:</b> {sourceDate(course.startedAt)}</div>}
          {"completedAt" in course && course.completedAt &&
            <div className={styles.date}><b>Завершен:</b> {sourceDate(course.completedAt)}</div>}
        </div>
      </RouteLink>
    </li>
  );
}
