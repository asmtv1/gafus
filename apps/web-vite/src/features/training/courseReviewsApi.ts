import { apiRequest } from "../../shared/api/client";

/** Hono review GET projection and completed learner's explicit review POST.
 * Server alone authorizes course completion, ownership and duplicate prevention. */
export type CourseReview = {
  id: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
  user: { id: string; username: string };
};
export type CourseReviews = {
  courseName: string;
  reviews: CourseReview[];
  hasCompleted: boolean;
  ownReviewId: string | null;
};

const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && v.length <= 10000);
const rating = (v: unknown): v is number | null =>
  v === null || (Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 5);
const date = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v));

export function projectCourseReviews(raw: unknown, actorId: string): CourseReviews {
  if (
    !object(raw) ||
    typeof raw.courseName !== "string" ||
    !raw.courseName.trim() ||
    raw.courseName.length > 500 ||
    !Array.isArray(raw.reviews) ||
    raw.reviews.length > 10000 ||
    !object(raw.userStatus) ||
    typeof raw.userStatus.hasCompleted !== "boolean" ||
    !(raw.userStatus.userReview === null || object(raw.userStatus.userReview))
  ) {
    throw new Error("INVALID_COURSE_REVIEWS");
  }
  const reviews: CourseReview[] = [];
  const seen = new Set<string>();
  for (const value of raw.reviews) {
    if (
      !object(value) ||
      !id(value.id) ||
      seen.has(value.id) ||
      !rating(value.rating) ||
      !text(value.comment) ||
      !date(value.createdAt) ||
      !object(value.user) ||
      !id(value.user.id) ||
      typeof value.user.username !== "string" ||
      !value.user.username.trim() ||
      value.user.username.length > 128
    ) {
      throw new Error("INVALID_COURSE_REVIEW");
    }
    seen.add(value.id);
    reviews.push({
      id: value.id,
      rating: value.rating,
      comment: value.comment,
      createdAt: value.createdAt,
      user: { id: value.user.id, username: value.user.username },
    });
  }
  const own = raw.userStatus.userReview;
  if (
    own !== null &&
    (!object(own) ||
      !id(own.id) ||
      !seen.has(own.id) ||
      !object(own.user) ||
      own.user.id !== actorId ||
      reviews.find((review) => review.id === own.id)?.user.id !== actorId)
  ) {
    throw new Error("INVALID_OWN_REVIEW");
  }
  return {
    courseName: raw.courseName,
    reviews,
    hasCompleted: raw.userStatus.hasCompleted,
    ownReviewId: own === null ? null : (own.id as string),
  };
}

/** Registered GET for read-only reviews panel, it projects with current actor. */
export async function loadCourseReviewsRaw(courseType: string): Promise<unknown> {
  if (!id(courseType)) throw new Error("INVALID_REVIEW_QUERY");
  return apiRequest<unknown>(
    "/api/v1/courses/reviews?courseType=" + encodeURIComponent(courseType),
    { method: "GET", browserAuth: true },
  );
}
export async function fetchCourseReviews(
  courseType: string,
  actorId: string,
): Promise<CourseReviews> {
  if (!id(actorId)) throw new Error("INVALID_REVIEW_QUERY");
  return projectCourseReviews(await loadCourseReviewsRaw(courseType), actorId);
}


/** POST returns only {success:true}; verify ownership with a separate GET. */
export async function createCourseReview(
  courseType: string,
  ratingValue: number,
  comment: string,
): Promise<void> {
  if (!id(courseType) || !Number.isInteger(ratingValue) ||
    ratingValue < 1 || ratingValue > 5 || comment.length > 10000) {
    throw new Error("INVALID_REVIEW_SUBMISSION");
  }
  const cleanComment = comment.trim();
  await apiRequest<undefined>("/api/v1/courses/reviews", {
    method: "POST",
    browserAuth: true,
    expectedStatus: 200,
    json: {
      courseType,
      rating: ratingValue,
      ...(cleanComment ? { comment: cleanComment } : {}),
    },
  });
}


/** Hono PATCH returns only success ACK; caller must confirm edited row via GET. */
export async function updateOwnCourseReview(
  reviewId: string, ratingValue: number, comment: string,
): Promise<void> {
  if (!id(reviewId) || !Number.isInteger(ratingValue) ||
    ratingValue < 1 || ratingValue > 5 || comment.length > 10000) {
    throw new Error("INVALID_REVIEW_EDIT");
  }
  await apiRequest<undefined>("/api/v1/courses/reviews", {
    method: "PATCH", browserAuth: true, expectedStatus: 200,
    json: { reviewId, rating: ratingValue, comment: comment.trim() },
  });
}

/** Hono DELETE returns only success ACK; caller must confirm absence via GET. */
export async function deleteOwnCourseReview(reviewId: string): Promise<void> {
  if (!id(reviewId)) throw new Error("INVALID_REVIEW_DELETE");
  await apiRequest<undefined>("/api/v1/courses/reviews", {
    method: "DELETE", browserAuth: true, expectedStatus: 200,
    json: { reviewId },
  });
}
