import { CourseForm } from "@features/courses/components/CourseForm";
import { getVisibleDays } from "@features/courses/lib/getVisibleDays";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { authOptions } from "@gafus/auth";
import { getCourseDraftWithRelations } from "@gafus/core/services/trainerCourse";
import { Typography } from "@mui/material";
import { getServerSession } from "next-auth";
import FormPageLayout from "@shared/components/FormPageLayout";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCoursePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const trainerId = session?.user?.id ?? "";
  const trainerVideos = trainerId ? await getTrainerVideos(trainerId) : [];

  const course = trainerId
    ? await getCourseDraftWithRelations(id, trainerId)
    : null;

  const days = await getVisibleDays();
  const uniqueDays = days.filter(
    (day, index, self) => index === self.findIndex((d) => d.id === day.id),
  );
  const formattedDays = uniqueDays.map(
    (day: { id: string | number; title: string }) => ({
      id: String(day.id),
      title: day.title,
    }),
  );

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

  const trainingLevel = course.trainingLevel as
    | "BEGINNER"
    | "INTERMEDIATE"
    | "ADVANCED"
    | "EXPERT";
  const initialValues = {
    name: course.name,
    shortDesc: course.shortDesc,
    description: course.description,
    duration: course.duration,
    videoUrl: course.videoUrl ?? "",
    logoImg: course.logoImg,
    isPublic: !course.isPrivate,
    isPaid: course.isPaid ?? false,
    priceRub: course.priceRub,
    showInProfile: course.showInProfile ?? true,
    isPersonalized: course.isPersonalized ?? false,
    trainingDays: course.dayLinks.map((dl) => dl.day.id),
    allowedUsers: course.isPrivate ? course.access.map((a) => a.userId) : [],
    equipment: course.equipment,
    trainingLevel,
  };

  const initialSelectedUsers = course.isPrivate
    ? course.access.map((a) => ({
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
        trainerVideos={trainerVideos}
      />
    </FormPageLayout>
  );
}
