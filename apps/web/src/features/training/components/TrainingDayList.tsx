import { memo, useCallback } from "react";
import Link from "next/link";

import styles from "./TrainingDayList.module.css";

interface Props {
  courseType: string;
  days: {
    day: number;
    title: string;
    userStatus: string;
    courseId: string;
  }[];
}

const TrainingDayList = memo(function TrainingDayList({ courseType, days }: Props) {
  const getItemClass = useCallback((status: string) => {
    if (status === "IN_PROGRESS") return `${styles.item} ${styles.inprogress}`;
    if (status === "COMPLETED") return `${styles.item} ${styles.completed}`;
    return styles.item;
  }, [styles.item, styles.inprogress, styles.completed]);

  return (
    <ul className={styles.list}>
      {days.map((day) => (
        <li key={`${day.courseId}-${day.day}`} className={getItemClass(day.userStatus)}>
          <Link href={`/trainings/${courseType}/${day.day}`} className={styles.link}>
            <span className={styles.day}>{day.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
});

export default TrainingDayList;
