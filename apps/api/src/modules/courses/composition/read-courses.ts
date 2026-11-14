/** AG1-001: bind established Course Core READ implementations once. */
import {
  getCoursesWithProgress,
  getCourseMetadata,
} from "@gafus/core/services/course";
import { getCourseReviews } from "@gafus/course-server/reviews";
import {getFavoritesCourses} from "@gafus/course-server/favorites";
import {resolveCourseEntitlement} from "@gafus/core/services/contentAccess";
const paidAccessForActor=async(actorUserId:string)=>
  (await resolveCourseEntitlement({id:"",isPrivate:false,isPaid:true},actorUserId)).allowed;
import { createCourseReadApplication } from "../application/read-courses.js";

export const courseReadApplication = createCourseReadApplication({
  catalog: (userId) => getCoursesWithProgress(userId),
  favorites: (userId) => getFavoritesCourses(userId,paidAccessForActor),
  metadata: (courseType) => getCourseMetadata(courseType),
  reviews: (courseType, userId) => getCourseReviews(courseType, userId),
});
