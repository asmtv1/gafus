/**
 * Course Service - бизнес-логика работы с курсами
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */
import type { CourseWithProgressData } from "@gafus/types";
/**
 * Получает все доступные курсы с прогрессом пользователя
 */
export declare function getCoursesWithProgress(userId: string): Promise<CourseWithProgressData[]>;
/**
 * Проверяет доступ пользователя к курсу по типу
 */
export declare function checkCourseAccess(courseType: string, userId?: string): Promise<{
    hasAccess: boolean;
}>;
/**
 * Проверяет доступ пользователя к курсу по ID
 */
export declare function checkCourseAccessById(courseId: string, userId?: string): Promise<{
    hasAccess: boolean;
}>;
/**
 * Получает базовые метаданные курса для Open Graph
 */
export declare function getCourseMetadata(courseType: string): Promise<{
    name: string;
    id: string;
    description: string;
    shortDesc: string;
    logoImg: string;
} | null>;
//# sourceMappingURL=courseService.d.ts.map