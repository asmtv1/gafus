/** AG1-001: bind established Course Core READ implementations once. */
import {
  getCoursesWithProgress,
  getCourseMetadata,
} from "./catalog-read-instance.js";
import { getCourseReviews } from "@gafus/course-server/reviews";
import {getFavoritesCourses} from "@gafus/course-server/favorites";
import { readCatalogCardPage, type CatalogCursor } from "@gafus/course-read-server/catalog-cards";
import { TrainingStatus } from "@gafus/types";
import {allowedCourseIds, resolveCourseEntitlement} from "../../content-access/composition/content-policy-instance.js";
const paidAccessForActor=async(actorUserId:string)=>
  (await resolveCourseEntitlement({id:"",isPrivate:false,isPaid:true},actorUserId)).allowed;
import { createCourseReadApplication } from "../application/read-courses.js";

export const courseReadApplication = createCourseReadApplication({
  catalog: (userId) => getCoursesWithProgress(userId),
  favorites: (userId) => getFavoritesCourses(userId,paidAccessForActor),
  metadata: (courseType) => getCourseMetadata(courseType),
  reviews: (courseType, userId) => getCourseReviews(courseType, userId),
});

export async function getCatalogCardPage(userId: string, cursor?: CatalogCursor) {
  const { items, next } = await readCatalogCardPage(userId, cursor);
  const allowed = await allowedCourseIds(items, userId);
  return {
    items: items.map(({ access, favoritedBy, userCourses, author, _count, ...card }) => ({
      ...card,
      authorUsername: author.username,
      authorAvatarUrl: author.profile?.avatarUrl ?? null,
      reviewsCount: _count.reviews,
      hasAccess: allowed.has(card.id),
      isFavorite: favoritedBy.length > 0,
      userStatus: userCourses[0]?.status ?? TrainingStatus.NOT_STARTED,
      startedAt: userCourses[0]?.startedAt ?? null,
      completedAt: userCourses[0]?.completedAt ?? null,
      startedUsersCount: _count.userCourses,
    })),
    next,
  };
}
