import { CourseForm } from "@features/courses/components/CourseForm";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";
import { prisma } from "@gafus/prisma";
import { Typography } from "@mui/material";
import FormPageLayout from "@shared/components/FormPageLayout";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCoursePage({ params }: PageProps) {
  const { id } = await params;

  // Загружаем курс
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      dayLinks: {
        include: {
          day: true,
        },
        orderBy: { order: "asc" },
      },
      access: { include: { user: true } },
    },
  });

  const days = await getVisibleDays();
  
  // Убираем дубликаты по id, оставляя только уникальные дни
  const uniqueDays = days.filter((day, index, self) => 
    index === self.findIndex(d => d.id === day.id)
  );
  
  const formattedDays = uniqueDays.map((day: { id: string | number; title: string }) => ({
    id: String(day.id),
    title: day.title,
  }));

  if (!course) {
    return (
      <FormPageLayout 
        title="Редактирование курса"
        subtitle="Измените информацию о курсе и выберите тренировочные дни"
      >
        <Typography color="error">Курс не найден</Typography>
      </FormPageLayout>
    );
  }

  const initialValues = {
    name: course.name,
    shortDesc: course.shortDesc,
    description: course.description,
    duration: course.duration,
    videoUrl: course.videoUrl ?? "",
    logoImg: course.logoImg,
    isPublic: !course.isPrivate,
    isPaid: course.isPaid ?? false,
    showInProfile: (course as { showInProfile?: boolean }).showInProfile ?? true,
    trainingDays: course.dayLinks.map((dl: { day: { id: string } }) => dl.day.id),
    allowedUsers: course.isPrivate ? course.access.map((a: { userId: string }) => a.userId) : [],
    equipment: course.equipment,
    trainingLevel: course.trainingLevel,
  };

  const initialSelectedUsers = course.isPrivate
    ? course.access.map((a: { user: { id: string; username: string } }) => ({
        id: a.user.id,
        username: a.user.username,
      }))
    : [];

  return (
    <FormPageLayout 
      title="Редактирование курса"
      subtitle="Измените информацию о курсе и выберите тренировочные дни"
    >
      <CourseForm
        allDays={formattedDays}
        mode="edit"
        courseId={course.id}
        initialValues={initialValues}
        initialSelectedUsers={initialSelectedUsers}
      />
    </FormPageLayout>
  );
}
