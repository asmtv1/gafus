import { authOptions } from "@gafus/auth";
import type { AuthoredCourse } from "@gafus/types";
import { getAuthoredCourses } from "@shared/lib/course/getAuthoredCourses";
import { getServerSession } from "next-auth";
import dynamic from "next/dynamic";
import Image from "next/image";

import styles from "./Statistics.module.css";

// Динамический импорт для тяжелого компонента статистики
const StatisticsContent = dynamic(() => import("./StatisticsContent"), {
  loading: () => (
    <div className={styles.loading}>
      <div>Загрузка статистики...</div>
    </div>
  ),
  ssr: true,
});

export default async function Statistics() {
  const session = await getServerSession(authOptions);
  const userName = session?.user?.username ?? "";
  const avatarUrl = session?.user?.avatarUrl ?? "/shared/uploads/avatar.svg";

  // Загружаем созданные курсы серверно
  let createdCourses: AuthoredCourse[] = [];
  let error: string | null = null;

  try {
    createdCourses = await getAuthoredCourses();
  } catch (err) {
    error = err instanceof Error ? err.message : "Неизвестная ошибка";
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.avatarWrapper}>
          {userName ? (
            <Image
              src={avatarUrl}
              alt="Avatar"
              width={40}
              height={40}
              className={styles.avatar}
              unoptimized
              priority
            />
          ) : (
            <div className={styles.avatarPlaceholder} />
          )}
        </div>
        <div className={styles.userName}>{userName || "\u00A0"}</div>
      </div>

      <h2 className={styles.title}>Созданные вами курсы:</h2>

      {error ? (
        <div className={styles.error}>
          <p>Ошибка загрузки статистики: {error}</p>
          <p>Попробуйте обновить страницу</p>
        </div>
      ) : createdCourses.length === 0 ? (
        <div className={styles.emptyMessage}>
          <p>У вас пока нет созданных курсов</p>
          <p>Создайте первый курс, чтобы увидеть статистику</p>
        </div>
      ) : (
        <StatisticsContent createdCourses={createdCourses} />
      )}
    </section>
  );
}
