import { CourseForm } from "@features/courses/components/CourseForm";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";
import { Box, Typography } from "@mui/material";

export default async function NewCoursePage() {
  const steps = await getVisibleDays();

  // Проверяем, что steps не undefined и является массивом
  if (!steps || !Array.isArray(steps)) {
    console.error("getVisibleDays вернул неверный тип:", steps);
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Создание нового курса
        </Typography>
        <Typography color="error">
          Ошибка загрузки дней тренировок. Попробуйте перезагрузить страницу.
        </Typography>
      </Box>
    );
  }

  // Убираем дубликаты по id, оставляя только уникальные дни
  const uniqueDays = steps.filter((day, index, self) => 
    index === self.findIndex(d => d.id === day.id)
  );

  const formattedDays = uniqueDays.map((day) => ({
    id: String(day.id),
    title: day.title,
  }));
  console.warn("Formatted Days:", formattedDays);
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Создание нового курса
      </Typography>
      <CourseForm allDays={formattedDays} />
    </Box>
  );
}
