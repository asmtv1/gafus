/**
 * Course Review Service - бизнес-логика работы с отзывами
 */
export interface CourseReviewData {
    id: string;
    rating: number | null;
    comment: string | null;
    createdAt: Date;
    user: {
        id: string;
        username: string;
        profile: {
            avatarUrl: string | null;
        } | null;
    };
}
export interface UserReviewStatus {
    hasCompleted: boolean;
    userReview: CourseReviewData | null;
}
export interface CourseReviewsResult {
    courseName: string;
    reviews: CourseReviewData[];
    userStatus: UserReviewStatus;
}
export interface ReviewActionResult {
    success: boolean;
    error?: string;
}
/**
 * Получает все отзывы для курса
 */
export declare function getCourseReviews(courseType: string, userId?: string): Promise<CourseReviewsResult | null>;
/**
 * Создает новый отзыв на курс
 */
export declare function createCourseReview(userId: string, courseType: string, rating: number, comment?: string): Promise<ReviewActionResult>;
/**
 * Обновляет существующий отзыв
 */
export declare function updateCourseReview(userId: string, reviewId: string, rating: number, comment?: string): Promise<ReviewActionResult>;
/**
 * Удаляет отзыв
 */
export declare function deleteCourseReview(userId: string, reviewId: string): Promise<ReviewActionResult>;
/**
 * Выставляет рейтинг курсу (упрощённая версия без комментария)
 */
export declare function rateCourse(userId: string, courseId: string, rating: number): Promise<ReviewActionResult>;
//# sourceMappingURL=reviewService.d.ts.map