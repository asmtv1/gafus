import { CourseForm } from "@features/courses/components/CourseForm";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { Typography } from "@mui/material";

import FormPageLayout from "@shared/components/FormPageLayout";
import { getCachedSession } from "@/shared/lib/getSessionCached";

export default async function NewCoursePage() {
  const [session, steps] = await Promise.all([getCachedSession(), getVisibleDays()]);
  const trainerVideos = session?.user?.id ? await getTrainerVideos(session.user.id) : [];

  // Проверяем, что steps не undefined и является массивом
  if (!steps || !Array.isArray(steps)) {
    return (
      <FormPageLayout
        title="Создание нового курса"
        subtitle="Заполните информацию о новом курсе и выберите тренировочные дни"
      >
        <Typography color="error">
          Ошибка загрузки дней тренировок. Попробуйте перезагрузить страницу.
        </Typography>
      </FormPageLayout>
    );
  }

  const formattedDays = steps.map((day) => ({
    id: String(day.id),
    title: day.title,
  }));
  return (
    <FormPageLayout
      title="Создание нового курса"
      subtitle="Заполните информацию о новом курсе и выберите тренировочные дни"
    >
      <CourseForm allDays={formattedDays} trainerVideos={trainerVideos} />
    </FormPageLayout>
  );
}
