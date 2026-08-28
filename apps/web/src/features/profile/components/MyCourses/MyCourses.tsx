import type { UserCourseInfo } from "@gafus/types";

import { formatDate } from "@gafus/core/utils";

export default function MyCourses({
  courseName,
  startedAt,
  completedAt,
  completedDays,
  totalDays,
}: UserCourseInfo) {
  if (!courseName) return <div>Вы пока не начали обучение</div>;

  const progressPercentage =
    totalDays > 0 ? Math.round((completedDays.length / totalDays) * 100) : 0;
  const isCompleted = completedAt !== null;
  const isInProgress = startedAt && !completedAt;

  return (
    <li
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "12px",
        backgroundColor: isCompleted ? "#f0f8f0" : isInProgress ? "#fff8f0" : "#f8f8f8",
      }}
    >
      <h4 style={{ margin: "0 0 8px 0", color: "#333" }}>{courseName}</h4>

      <div style={{ marginBottom: "8px" }}>
        {startedAt && (
          <div style={{ color: "#666", fontSize: "14px" }}>
            🚀 Курс начат: {formatDate(startedAt)}
          </div>
        )}

        {completedAt && (
          <div style={{ color: "#28a745", fontSize: "14px", fontWeight: "bold" }}>
            ✅ Курс окончен: {formatDate(completedAt)}
          </div>
        )}
      </div>

      <div style={{ marginBottom: "8px" }}>
        <div style={{ color: "#666", fontSize: "14px" }}>
          📊 Прогресс: {completedDays.length} из {totalDays} дней ({progressPercentage}%)
        </div>

        {totalDays > 0 && (
          <div
            style={{
              width: "100%",
              height: "8px",
              backgroundColor: "#e0e0e0",
              borderRadius: "4px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                width: `${progressPercentage}%`,
                height: "100%",
                backgroundColor: isCompleted ? "#28a745" : "#ffc107",
                borderRadius: "4px",
              }}
            />
          </div>
        )}
      </div>

      {completedDays.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ color: "#666", fontSize: "14px", marginBottom: "4px" }}>
            🎯 Пройденные дни:
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }}
          >
            {completedDays.map((day) => (
              <span
                key={day}
                style={{
                  backgroundColor: "#28a745",
                  color: "white",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                День {day}
              </span>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
