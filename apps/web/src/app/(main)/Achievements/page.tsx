import Link from "next/link";

import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";

import MyCourses from "@features/profile/components/MyCourses";

import type { UserWithTrainings } from "@gafus/types";

export const metadata = {
  title: "Достижения",
  description: "Ваши достижения и прогресс в обучении.",
};

export default async function AchievementsPage() {
  const user: UserWithTrainings | null = await getUserWithTrainings();

  if (!user) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h1>Достижения</h1>
        <p>Для просмотра достижений необходимо войти в систему.</p>
      </div>
    );
  }

  // Вычисляем общую статистику
  const totalCourses = user.courses.length;
  const completedCourses = user.courses.filter((course) => course.completedAt).length;
  const inProgressCourses = user.courses.filter(
    (course) => course.startedAt && !course.completedAt,
  ).length;
  const totalCompletedDays = user.courses.reduce(
    (sum, course) => sum + course.completedDays.length,
    0,
  );
  const totalDays = user.courses.reduce((sum, course) => sum + course.totalDays, 0);
  const overallProgress = totalDays > 0 ? Math.round((totalCompletedDays / totalDays) * 100) : 0;

  return (
    <section style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 24px 0", color: "#333", textAlign: "center" }}>
        🏆 Достижения
      </h1>

      <div
        style={{
          backgroundColor: "#f8f9fa",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "24px",
          border: "1px solid #e9ecef",
        }}
      >
        <h2 style={{ margin: "0 0 16px 0", color: "#333" }}>📊 Общая статистика</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "16px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold", color: "#007bff" }}>
              {totalCourses}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>Всего курсов</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold", color: "#28a745" }}>
              {completedCourses}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>Завершено</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ffc107" }}>
              {inProgressCourses}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>В процессе</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold", color: "#6f42c1" }}>
              {totalCompletedDays}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>Дней пройдено</div>
          </div>
        </div>

        {totalDays > 0 && (
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "14px", color: "#666" }}>Общий прогресс</span>
              <span style={{ fontSize: "14px", fontWeight: "bold", color: "#333" }}>
                {overallProgress}%
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "12px",
                backgroundColor: "#e9ecef",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${overallProgress}%`,
                  height: "100%",
                  backgroundColor: "#007bff",
                  borderRadius: "6px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid #e9ecef",
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", color: "#333" }}>🎯 Детальная статистика по курсам</h3>

        {user.courses.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#666",
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "18px", marginBottom: "8px" }}>📚</div>
            <div>Вы пока не начали ни один курс</div>
            <div style={{ fontSize: "14px", marginTop: "8px" }}>
              <Link href="/courses" style={{ color: "#007bff", textDecoration: "none" }}>
                Перейти к курсам →
              </Link>
            </div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {user.courses.map((course) => (
              <MyCourses key={course.courseId} {...course} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
