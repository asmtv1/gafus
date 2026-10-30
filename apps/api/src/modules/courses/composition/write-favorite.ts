/** Existing Core favorite writes are called only when POST /favorites executes. */
import {
  addFavoriteCourse,
  removeFavoriteCourse,
  toggleFavoriteCourse,
} from "@gafus/core/services/course";
import { createWriteFavoriteApplication } from "../application/write-favorite.js";

export const writeFavoriteApplication = createWriteFavoriteApplication({
  add: (userId, courseId) => addFavoriteCourse(userId, courseId),
  remove: (userId, courseId) => removeFavoriteCourse(userId, courseId),
  toggle: (userId, courseId) => toggleFavoriteCourse(userId, courseId),
});
