import { CourseReviewsPanel, type ReviewsSourceLoader } from "./CourseReviewsPanel";

/** Explicit fixture-backed Web route only. Not a default G1/G2 activation. */
export function CourseReviewsOptIn({
  enabled,
  userId,
  courseType,
  loadReviews,
}: {
  enabled: boolean;
  userId: string;
  courseType: string;
  loadReviews?: ReviewsSourceLoader;
}) {
  if (!enabled || !loadReviews) return null;
  return (
    <CourseReviewsPanel
      key={userId + ":" + courseType}
      userId={userId}
      courseType={courseType}
      loadReviews={loadReviews}
    />
  );
}
