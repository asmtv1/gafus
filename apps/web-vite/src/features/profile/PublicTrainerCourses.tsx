import { RouteLink, coursePath } from "../../shared/router/location";
import { publicImageUrl, type PublicProfileSummary } from "./publicProfileApi";
import styles from "./WEB1TrainerCourses.module.css";

type ProfileCourse = NonNullable<PublicProfileSummary["courses"]>[number];

const levels: Record<ProfileCourse["trainingLevel"], string> = {
  BEGINNER: "Начальный", INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый", EXPERT: "Экспертный",
};

/** Retained Next TrainerCoursesSection presentation on the public profile.
 * A public course retains its already registered Vite route (/courses/:id).
 * Private courses stay non-navigable until the WEB3 owner explicitly exposes
 * a guarded access contract; a painted card must never grant course access.
 */
export function PublicTrainerCourses({ courses }: {
  courses: NonNullable<PublicProfileSummary["courses"]>;
}) {
  if (!courses.length) return null;
  return <section className={styles.coursesSection} aria-label="Курсы кинолога">
    <h2 className={styles.title}>Курсы кинолога</h2>
    <ul className={styles.coursesList}>
      {courses.map(course => {
        const content = <div className={styles.courseContent}>
          <div className={styles.imageWrapper}>
            <img src={publicImageUrl(course.logoImg) ?? "/images/course-day-logo-source.png"}
              width={120} height={80} loading="lazy" className={styles.courseImage}
              alt={`${course.name} logo`}/>
            {course.isPrivate &&
              <span className={styles.privateBadge}>Приватный</span>}
            {course.isPaid &&
              <span className={styles.paidBadge}>По подписке</span>}
          </div>
          <div className={styles.courseInfo}>
            <h3 className={styles.courseName}>{course.name}</h3>
            {course.shortDesc &&
              <p className={styles.courseDescription}>{course.shortDesc}</p>}
            <div className={styles.courseMeta}>
              <span className={styles.courseDuration}>
                <strong>Длительность:</strong> {course.duration}
              </span>
              <span className={styles.courseLevel}>
                <strong>Уровень:</strong> {levels[course.trainingLevel]}
              </span>
              {course.avgRating !== null &&
                <span className={styles.courseRating}>
                  <strong>Рейтинг:</strong> {course.avgRating.toFixed(1)} ⭐
                </span>}
            </div>
          </div>
        </div>;
        return <li className={styles.courseItem} key={course.id}>
          {course.isPrivate ?
            <div className={styles.courseLink} aria-label={`Приватный курс: ${course.name}`}>
              {content}
            </div> :
            <RouteLink to={coursePath(course.id)} className={styles.courseLink}>
              {content}
            </RouteLink>}
        </li>;
      })}
    </ul>
  </section>;
}
