import type { UserCourse } from "@/types/user";

export default function MyCourses({
  courseName,
  startedAt,
  completedAt,
  completedDays,
}: UserCourse) {
  if (!courseName) return <div>Вы пока не начали обучение</div>;

  return (
    <li>
      <div>{courseName}</div>
      {startedAt && (
        <div>Курс начат: {new Date(startedAt).toLocaleDateString()}</div>
      )}
      {completedAt && (
        <div>Курс окончен: {new Date(completedAt).toLocaleDateString()}</div>
      )}
      {completedDays.length !== 0 && (
        <div>Дней курса пройдено: {completedDays.length}</div>
      )}
    </li>
  );
}
