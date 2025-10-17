import { getCourseReviews } from "@shared/lib/course/getCourseReviews";
import { ReviewsList } from "@/features/courses/components/ReviewsList";
import { redirect } from "next/navigation";

interface ReviewsPageProps {
  params: Promise<{
    courseType: string;
  }>;
}

export default async function ReviewsPage({ params }: ReviewsPageProps) {
  const { courseType } = await params;

  const result = await getCourseReviews(courseType);

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

