/**
 * Константы тегов кэша Next.js (revalidateTag).
 * Используются в app-уровне (trainer-panel, web) для инвалидации кэша.
 * Core не импортирует next/cache — только экспортирует названия тегов.
 */
export const CACHE_TAGS = {
  /** Заметки тренера (общий список) */
  TRAINER_NOTES: "trainer-notes",
  /** Заметки тренера по ID тренера */
  TRAINER_NOTES_BY_TRAINER: (id: string) => `trainer-notes-${id}`,

  /** Курсы — базовые теги для инвалидации в trainer-panel и web */
  COURSES: "courses",
  COURSES_ALL: "courses-all",
  COURSES_ALL_PERMANENT: "courses-all-permanent",
  COURSES_FAVORITES: "courses-favorites",
  COURSES_AUTHORED: "courses-authored",
  COURSES_METADATA: "courses-metadata",

  /** Дни тренировок */
  TRAINING: "training",
  DAYS: "days",
  DAY: "day",

  /** Результаты экзаменов */
  EXAM_RESULTS: "exam-results",

  /** Шаги (для будущего использования) */
  STEPS: "steps",

  /** Видео тренера (для будущего использования) */
  TRAINER_VIDEOS: "trainer-videos",

  /** Статистика (trainer-panel) */
  STATISTICS: "statistics",
} as const;

/** Все теги для полной инвалидации кэша в admin-panel (invalidateAllCache) */
export const ADMIN_CACHE_ALL_TAGS = [
  "user-progress",
  "training",
  "days",
  "courses-favorites",
  "courses",
  "courses-all",
  "courses-all-permanent",
  "courses-authored",
  "achievements",
  "streaks",
  "statistics",
] as const;
