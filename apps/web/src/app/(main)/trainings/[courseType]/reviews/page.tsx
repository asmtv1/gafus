import { getCourseReviewsAction, checkCourseAccessAction } from "@shared/server-actions/course";
import { ReviewsList } from "@/features/courses/components/ReviewsList";
import { redirect } from "next/navigation";

interface ReviewsPageProps {
  params: Promise<{
    courseType: string;
  }>;
}

export default async function ReviewsPage({ params }: ReviewsPageProps) {
  const { courseType } = await params;

  // Проверяем доступ к курсу
  const accessCheck = await checkCourseAccessAction(courseType);
  if (!accessCheck.hasAccess) {
    redirect("/courses");
  }

  const result = await getCourseReviewsAction(courseType);

  if (!result.success || !result.reviews) {
    redirect(`/trainings/${courseType}`);
  }

  return (
    <ReviewsList
      courseType={courseType}
      courseName={result.courseName || ""}
      reviews={result.reviews}
      userStatus={result.userStatus}
    />
  );
}

