/**
 * AG1-001: existing Course READ use cases.
 * HTTP auth, validators, caching, status and JSON mapping remain in Hono;
 * Core is the only owner of course queries and business rules.
 */
import type { CatalogReadService } from "@gafus/core/services/course";
import type {getCourseReviews} from "@gafus/course-server/reviews";
import type {getFavoritesCourses} from "@gafus/course-server/favorites";

type CatalogReader = CatalogReadService["getCoursesWithProgress"];
type FavoritesReader = (userId:string)=>ReturnType<typeof getFavoritesCourses>;
type MetadataReader = CatalogReadService["getCourseMetadata"];
type ReviewsReader = typeof getCourseReviews;

export function createCourseReadApplication(dependencies: {
  catalog: CatalogReader;
  favorites: FavoritesReader;
  metadata: MetadataReader;
  reviews: ReviewsReader;
}) {
  return {
    getCatalog({ actorUserId }: { actorUserId: string }) {
      return dependencies.catalog(actorUserId);
    },
    getFavorites({ actorUserId }: { actorUserId: string }) {
      return dependencies.favorites(actorUserId);
    },
    getMetadata({ courseType }: { courseType: string }) {
      return dependencies.metadata(courseType);
    },
    getReviews({ courseType, actorUserId }: { courseType: string; actorUserId?: string }) {
      return dependencies.reviews(courseType, actorUserId);
    },
  };
}
