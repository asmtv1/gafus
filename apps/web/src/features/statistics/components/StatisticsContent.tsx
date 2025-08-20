import type { AuthoredCourse } from "@gafus/types";
import MyCreatedCourses from "./MyCreatedCourses";
import styles from "./Statistics.module.css";

interface StatisticsContentProps {
  createdCourses: AuthoredCourse[];
}

export default function StatisticsContent({ createdCourses }: StatisticsContentProps) {
  if (createdCourses.length === 0) {
    return <div className={styles.emptyMessage}>Вы пока не создали ни одного курса</div>;
  }

  return (
    <div className={styles.coursesList}>
      {createdCourses.map((course, index) => (
        <MyCreatedCourses key={course.id} course={course} index={index} />
      ))}
    </div>
  );
}
