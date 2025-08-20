import { CourseForm } from "@features/courses/components/CourseForm";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";
import { prisma } from "@gafus/prisma";
import { Box, Typography } from "@mui/material";

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
  const formattedDays = days.map((day) => ({ id: String(day.id), title: day.title }));

  if (!course) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Редактирование курса
        </Typography>
        <Typography color="error">Курс не найден</Typography>
      </Box>
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
    trainingDays: course.dayLinks.map((dl) => dl.day.id),
    allowedUsers: course.isPrivate ? course.access.map((a) => a.userId) : [],
  };

  const initialSelectedUsers = course.isPrivate
    ? course.access.map((a) => ({ id: a.user.id, username: a.user.username }))
    : [];

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Редактирование курса
      </Typography>
      <CourseForm
        allDays={formattedDays}
        mode="edit"
        courseId={course.id}
        initialValues={initialValues}
        initialSelectedUsers={initialSelectedUsers}
      />
    </Box>
  );
}
