/** Existing learner course review commands; Core owns permissions and rules. */
import type {
  createCourseReview,
  rateCourse,
  updateCourseReview,
  deleteCourseReview,
} from "@gafus/core/services/course";

type ReviewResult = Awaited<ReturnType<typeof createCourseReview>>;

export function createWriteReviewsApplication(dependencies: {
  create: typeof createCourseReview;
  rate: typeof rateCourse;
  update: typeof updateCourseReview;
  remove: typeof deleteCourseReview;
}) {
  return {
    createOrRate(input: {
      actorUserId: string;
      courseType?: string;
      courseId?: string;
      rating: number;
      comment?: string;
    }): Promise<ReviewResult> | undefined {
      if (input.courseType) {
        return dependencies.create(
          input.actorUserId,
          input.courseType,
          input.rating,
          input.comment,
        );
      }
      if (input.courseId) {
        return dependencies.rate(input.actorUserId, input.courseId, input.rating);
      }
      return undefined;
    },
    update(input: {
      actorUserId: string;
      reviewId: string;
      rating: number;
      comment?: string;
    }): ReturnType<typeof updateCourseReview> {
      return dependencies.update(input.actorUserId, input.reviewId, input.rating, input.comment);
    },
    remove(input: {
      actorUserId: string;
      reviewId: string;
    }): ReturnType<typeof deleteCourseReview> {
      return dependencies.remove(input.actorUserId, input.reviewId);
    },
  };
}
