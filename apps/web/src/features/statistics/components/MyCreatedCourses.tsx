"use client";

import dynamic from "next/dynamic";

import styles from "./MyCreatedCourses.module.css";

import type { AuthoredCourse } from "@gafus/types";

// Динамический импорт для тяжелого компонента
const MyCreatedCoursesContent = dynamic(() => import("./MyCreatedCoursesContent"), {
  loading: () => <div className={styles.loading}>Загрузка...</div>,
  ssr: true,
});

interface MyCreatedCoursesProps {
  course: AuthoredCourse;
  index?: number;
}

export default function MyCreatedCourses({ course, index = 0 }: MyCreatedCoursesProps) {
  // Проверяем, что course существует
  if (!course) {
    return <div className={styles.container}>Курс не найден</div>;
  }

  return (
    <div className={styles.container}>
      <MyCreatedCoursesContent course={course} index={index} />
    </div>
  );
}
