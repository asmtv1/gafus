"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

import styles from "./TrainerCoursesSection.module.css";
import { showErrorAlert } from "@shared/utils/sweetAlert";
import { checkCourseAccessAction } from "@shared/server-actions";

import type { PublicProfile } from "@gafus/types";

interface TrainerCoursesSectionProps {
  publicData: PublicProfile;
}

const getTrainingLevelLabel = (
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
): string => {
  switch (level) {
    case "BEGINNER":
      return "Начальный";
    case "INTERMEDIATE":
      return "Средний";
    case "ADVANCED":
      return "Продвинутый";
    case "EXPERT":
      return "Экспертный";
    default:
      return level;
  }
};

export default function TrainerCoursesSection({ publicData }: TrainerCoursesSectionProps) {
  const courses = publicData.courses;
  const router = useRouter();

  if (!courses || courses.length === 0) {
    return null;
  }

  const handleCourseClick = async (course: {
    type: string;
    isPrivate: boolean;
    isPaid?: boolean;
  }) => {
    // Для платных курсов всегда переходим на страницу курса (там покажем предложение оплаты)
    if (course.isPaid) {
      router.push(`/trainings/${course.type}`);
      return;
    }

    // Для приватных курсов проверяем доступ
    if (course.isPrivate) {
      const { hasAccess } = await checkCourseAccessAction(course.type);
      if (!hasAccess) {
        await showErrorAlert(
          "Этот курс для вас закрыт. Обратитесь к кинологу для получения доступа",
        );
        return;
      }
    }
    
    router.push(`/trainings/${course.type}`);
  };

  return (
    <div className={styles.coursesSection}>
      <h2 className={styles.title}>Курсы кинолога</h2>
      <ul className={styles.coursesList}>
        {courses.map((course) => (
          <li key={course.id} className={styles.courseItem}>
            <div
              onClick={() => handleCourseClick(course)}
              className={styles.courseLink}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.courseContent}>
                <div className={styles.imageWrapper}>
                  <Image
                    src={course.logoImg || "/uploads/course-logo.webp"}
                    alt={`${course.name} logo`}
                    width={120}
                    height={80}
                    className={styles.courseImage}
                  />
                  {course.isPrivate && <span className={styles.privateBadge}>Приватный</span>}
                  {course.isPaid && <span className={styles.paidBadge}>Платный</span>}
                </div>
                <div className={styles.courseInfo}>
                  <h3 className={styles.courseName}>{course.name}</h3>
                  {course.shortDesc && (
                    <p className={styles.courseDescription}>{course.shortDesc}</p>
                  )}
                  <div className={styles.courseMeta}>
                    {course.isPaid && course.priceRub != null && course.priceRub > 0 && (
                      <span className={styles.coursePrice}>
                        <strong>Цена:</strong> {course.priceRub} ₽
                      </span>
                    )}
                    <span className={styles.courseDuration}>
                      <strong>Длительность:</strong> {course.duration}
                    </span>
                    <span className={styles.courseLevel}>
                      <strong>Уровень:</strong> {getTrainingLevelLabel(course.trainingLevel)}
                    </span>
                    {course.avgRating !== null && (
                      <span className={styles.courseRating}>
                        <strong>Рейтинг:</strong> {course.avgRating.toFixed(1)} ⭐
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
