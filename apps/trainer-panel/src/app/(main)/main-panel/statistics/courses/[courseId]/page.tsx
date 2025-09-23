import CourseStatsContent from "@features/statistics/components/CourseStatsContent";
import PageLayout from "@shared/components/PageLayout";
import { getDetailedCourseStatistics } from "@features/statistics/lib/statistics";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { notFound } from "next/navigation";

export default async function CourseStatisticsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    notFound();
  }

  const userId = session.user.id as string;
  const isElevated = Boolean(
    session.user.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
  );

  const course = await getDetailedCourseStatistics(courseId, userId, isElevated);
  if (!course) {
    notFound();
  }

  return (
    <PageLayout title="Детальная статистика курса" subtitle={course.name}>
      {/* Client content with tabs and analytics */}
      <CourseStatsContent course={course} />
    </PageLayout>
  );
}