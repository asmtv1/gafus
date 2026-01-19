import { create } from "zustand";
import { createWebLogger } from "@gafus/logger";
import type { CourseReviewData, UserReviewStatus } from "@shared/server-actions";
import {
  createCourseReviewAction,
  updateCourseReviewAction,
  deleteCourseReviewAction,
} from "@shared/server-actions";

const logger = createWebLogger("web-reviews-store");

interface ReviewsState {
  // Состояние
  reviews: CourseReviewData[];
  userStatus: UserReviewStatus | null;
  isLoading: boolean;
  error: string | null;

  // Действия
  setReviews: (reviews: CourseReviewData[], userStatus?: UserReviewStatus) => void;
  addReview: (courseType: string, rating: number, comment?: string) => Promise<boolean>;
  editReview: (reviewId: string, rating: number, comment?: string) => Promise<boolean>;
  removeReview: (reviewId: string) => Promise<boolean>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useReviewsStore = create<ReviewsState>((set, get) => ({
  // Начальное состояние
  reviews: [],
  userStatus: null,
  isLoading: false,
  error: null,

  // Установка отзывов
  setReviews: (reviews, userStatus) => {
    set({ reviews, userStatus: userStatus || null, error: null });
  },

  // Добавление отзыва
  addReview: async (courseType, rating, comment) => {
    set({ isLoading: true, error: null });

    try {
      logger.info("Добавление отзыва", { courseType, rating });

      const result = await createCourseReviewAction(courseType, rating, comment);

      if (!result.success) {
        set({ isLoading: false, error: result.error || "Ошибка при добавлении отзыва" });
        return false;
      }

      // Оптимистичное обновление - добавляем отзыв локально
      // Реальные данные придут при следующей загрузке страницы
      logger.success("Отзыв добавлен", { courseType });
      set({ isLoading: false });
      return true;
    } catch (error) {
      logger.error("Ошибка при добавлении отзыва", error as Error);
      set({ isLoading: false, error: "Неожиданная ошибка" });
      return false;
    }
  },

  // Редактирование отзыва
  editReview: async (reviewId, rating, comment) => {
    set({ isLoading: true, error: null });

    try {
      logger.info("Редактирование отзыва", { reviewId, rating });

      const result = await updateCourseReviewAction(reviewId, rating, comment);

      if (!result.success) {
        set({ isLoading: false, error: result.error || "Ошибка при обновлении отзыва" });
        return false;
      }

      // Оптимистичное обновление - обновляем отзыв локально
      const state = get();
      const updatedReviews = state.reviews.map((review) =>
        review.id === reviewId
          ? { ...review, rating, comment: comment || null }
          : review
      );

      logger.success("Отзыв обновлен", { reviewId });
      set({ reviews: updatedReviews, isLoading: false });
      return true;
    } catch (error) {
      logger.error("Ошибка при обновлении отзыва", error as Error);
      set({ isLoading: false, error: "Неожиданная ошибка" });
      return false;
    }
  },

  // Удаление отзыва
  removeReview: async (reviewId) => {
    set({ isLoading: true, error: null });

    try {
      logger.info("Удаление отзыва", { reviewId });

      const result = await deleteCourseReviewAction(reviewId);

      if (!result.success) {
        set({ isLoading: false, error: result.error || "Ошибка при удалении отзыва" });
        return false;
      }

      // Оптимистичное обновление - удаляем отзыв локально
      const state = get();
      const updatedReviews = state.reviews.filter((review) => review.id !== reviewId);

      logger.success("Отзыв удален", { reviewId });
      set({ reviews: updatedReviews, isLoading: false });
      return true;
    } catch (error) {
      logger.error("Ошибка при удалении отзыва", error as Error);
      set({ isLoading: false, error: "Неожиданная ошибка" });
      return false;
    }
  },

  // Установка загрузки
  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  // Установка ошибки
  setError: (error) => {
    set({ error });
  },

  // Сброс состояния
  reset: () => {
    set({
      reviews: [],
      userStatus: null,
      isLoading: false,
      error: null,
    });
  },
}));

