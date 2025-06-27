interface MyCreatedCoursesProps {
  course: {
    id: number;
    name: string;
    userCourses?: {
      user: { username: string };
      startedAt: Date | null;
      completedAt: Date | null;
      completedDays: number[] | null;
    }[];
  };
}

export default function MyCreatedCourses({ course }: MyCreatedCoursesProps) {
  const normalizedUserCourses =
    course.userCourses?.map((uc) => ({
      ...uc,
      startedAt: uc.startedAt ? uc.startedAt.toISOString() : undefined,
      completedAt: uc.completedAt ? uc.completedAt.toISOString() : undefined,
      completedDays: uc.completedDays ?? undefined,
    })) ?? [];

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3>{course.name}</h3>
      {normalizedUserCourses.length > 0 ? (
        <>
          <div>Кто проходит этот курс:</div>
          <ul>
            {normalizedUserCourses.map((uc, index) => {
              const startedAt = uc.startedAt
                ? new Date(uc.startedAt).toLocaleDateString("ru-RU")
                : "дата неизвестна";

              const completedInfo = uc.completedAt
                ? `закончил(а): ${new Date(uc.completedAt).toLocaleDateString(
                    "ru-RU"
                  )}`
                : `прошёл дней: ${uc.completedDays?.length ?? 0}`;

              return (
                <li key={index} style={{ marginBottom: "0.5rem" }}>
                  <a href={`/profile?username=${uc.user.username}`}>
                    {uc.user.username}
                  </a>{" "}
                  — начал(а): {startedAt}, {completedInfo}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p>Никто пока не начал этот курс.</p>
      )}
    </div>
  );
}
