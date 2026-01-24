/**
 * Favorite Course Service - бизнес-логика работы с избранными курсами
 */
import type { CourseWithProgressData } from "@gafus/types";
/**
 * Получает список избранных курсов пользователя с прогрессом
 */
export declare function getFavoritesCourses(userId: string): Promise<{
  data: CourseWithProgressData[];
  favoriteIds: string[];
}>;
/**
 * Добавляет или удаляет курс из избранного
 * @returns true если курс добавлен, false если удалён
 */
export declare function toggleFavoriteCourse(userId: string, courseId: string): Promise<boolean>;
/**
 * Добавляет курс в избранное (идемпотентная операция)
 */
export declare function addFavoriteCourse(userId: string, courseId: string): Promise<void>;
/**
 * Удаляет курс из избранного (идемпотентная операция)
 */
export declare function removeFavoriteCourse(userId: string, courseId: string): Promise<void>;
//# sourceMappingURL=favoriteService.d.ts.map
