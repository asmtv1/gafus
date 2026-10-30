/** Defer all four existing Core review/rating writes until a command executes. */
import {
  createCourseReview,
  rateCourse,
  updateCourseReview,
  deleteCourseReview,
} from "@gafus/core/services/course";
import { createWriteReviewsApplication } from "../application/write-reviews.js";

export const writeReviewsApplication = createWriteReviewsApplication({
  create: (userId, courseType, rating, comment) =>
    createCourseReview(userId, courseType, rating, comment),
  rate: (userId, courseId, rating) => rateCourse(userId, courseId, rating),
  update: (userId, reviewId, rating, comment) =>
    updateCourseReview(userId, reviewId, rating, comment),
  remove: (userId, reviewId) => deleteCourseReview(userId, reviewId),
});
