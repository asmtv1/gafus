/** AG1-001: bind established Course Core READ implementations once. */
import {
  getCoursesWithProgress,
  getFavoritesCourses,
  getCourseMetadata,
  getCourseReviews,
} from "@gafus/core/services/course";
import { createCourseReadApplication } from "../application/read-courses.js";

export const courseReadApplication = createCourseReadApplication({
  catalog: (userId) => getCoursesWithProgress(userId),
  favorites: (userId) => getFavoritesCourses(userId),
  metadata: (courseType) => getCourseMetadata(courseType),
  reviews: (courseType, userId) => getCourseReviews(courseType, userId),
});
