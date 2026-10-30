/**
 * AG1-001: existing Course READ use cases.
 * HTTP auth, validators, caching, status and JSON mapping remain in Hono;
 * Core is the only owner of course queries and business rules.
 */
import type {
  getCoursesWithProgress,
  getFavoritesCourses,
  getCourseMetadata,
  getCourseReviews,
} from "@gafus/core/services/course";

type CatalogReader = typeof getCoursesWithProgress;
type FavoritesReader = typeof getFavoritesCourses;
type MetadataReader = typeof getCourseMetadata;
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
