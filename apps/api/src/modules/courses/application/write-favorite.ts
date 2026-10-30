/** Existing POST /courses/favorites switch, bound only to injected Core ports. */
import type {
  addFavoriteCourse,
  removeFavoriteCourse,
  toggleFavoriteCourse,
} from "@gafus/core/services/course";

type FavoriteAction = "add" | "remove" | "toggle";

export function createWriteFavoriteApplication(dependencies: {
  add: typeof addFavoriteCourse;
  remove: typeof removeFavoriteCourse;
  toggle: typeof toggleFavoriteCourse;
}) {
  return {
    async execute({
      actorUserId,
      courseId,
      action,
    }: {
      actorUserId: string;
      courseId: string;
      action: FavoriteAction;
    }): Promise<boolean> {
      switch (action) {
        case "add":
          await dependencies.add(actorUserId, courseId);
          return true;
        case "remove":
          await dependencies.remove(actorUserId, courseId);
          return false;
        default:
          return dependencies.toggle(actorUserId, courseId);
      }
    },
  };
}
