// Типы для курсов и связанных данных
import type { TrainingStatus } from "../utils/training-status";

/**
 * Existing anonymous GET /api/v1/public/courses wire projection.
 * Deliberately distinct from CourseWithProgressData: no Date, owner/user IDs,
 * media, reviews, relations, progress or private access records in this DTO.
 * Boolean hasAccess remains the producer's exact !isPaid projection.
 */
export interface PublicCourseCatalogItem {
  /** Only allowlisted unsigned public CDN artwork, omitted when unavailable. */
  logoImg?: string;
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  duration: string;
  isPaid: boolean;
  isPrivate: false;
  hasAccess: boolean;
  isFavorite: false;
  userStatus: "NOT_STARTED";
  trainingLevel: CourseWithProgressData["trainingLevel"];
}

/** Exact success envelope of the existing public-only 11-field list. */
export interface PublicCourseCatalogResponse {
  success: true;
  data: PublicCourseCatalogItem[];
}

export interface CourseWithProgressData {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  hasAccess: boolean;
  avgRating: number | null;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  equipment?: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  userStatus: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  startedUsersCount?: number;
  isFavorite: boolean;
  reviews: CourseReview[];
  userCourses: UserCourse[];
  dayLinks: DayLink[];
  /** Мини-гайд (чек-лист, справочник) — без дней, только HTML */
}

/**
 * JSON body of authenticated GET /api/v1/courses.
 * Core remains a Date-valued domain object; Hono JSON serialization converts
 * Date to ISO strings (also inside reviews and userCourses), preserving
 * optional fields, nulls, enum values and the existing nested object shape.
 *
 * This is distinct from the 11-field anonymous PublicCourseCatalogItem.
 * It does not request a new runtime projection or change user entitlements.
 */
type CourseJsonValue<T> =
  T extends Date ? string
    : T extends readonly (infer Item)[] ? CourseJsonValue<Item>[]
      : T extends object ? { [Key in keyof T]: CourseJsonValue<T[Key]> }
        : T;

export type CourseWithProgressWire = CourseJsonValue<CourseWithProgressData>;

export interface CourseWithProgressWireResponse {
  success: true;
  data: CourseWithProgressWire[];
}

/**
 * Compile-only producer guard: a domain response must JSON-serialize into
 * precisely the shared authenticated wire envelope. Returns original T so
 * the Hono c.json input remains Date-valued and runtime JSON is unchanged.
 */
export type CourseWithProgressWireConformance<T> =
  [CourseJsonValue<T>] extends [CourseWithProgressWireResponse]
    ? [CourseWithProgressWireResponse] extends [CourseJsonValue<T>]
      ? T : never
    : never;

export interface CourseReview {
  rating: number | null;
  comment: string | null;
  createdAt: Date;
  user: {
    username: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface UserCourse {
  userId: string;
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  user: {
    username: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface DayLink {
  id?: string;
  order: number;
  day: {
    id: string;
    title: string;
    stepLinks: {
      id: string;
      order: number;
      step: {
        title: string;
      };
    }[];
  };
}

// Данные курса для компонентов (БЕЗ UI-специфичных полей)
export interface CourseCardData {
  id: string;
  name: string;
  type: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  hasAccess: boolean;
  userStatus: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  startedUsersCount?: number;
  shortDesc: string;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  avgRating: number | null;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  reviews: CourseReview[];
  isFavorite: boolean;
}

export interface CourseWithProgress {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  isFavorite: boolean;
  userStatus: TrainingStatus;
}

// Типы для статистики
export interface CourseStats {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  isPrivate: boolean;
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
  reviews: CourseReview[];
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

// Тип для курсов автора (статистика)
export interface AuthoredCourse {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  totalStarted: number;
  totalCompleted: number;
  totalRatings: number;
  reviews: CourseReview[];
  userProgress: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    days: {
      dayOrder: number;
      dayTitle: string;
      status: TrainingStatus;
      steps: {
        stepOrder: number;
        stepTitle: string;
        status: TrainingStatus;
      }[];
    }[];
  }[];
}

// Данные для форм курсов
export interface CourseFormData {
  name: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  visibleDayIds: string[];
  allowedUserIds: string[];
  videoUrl?: string;
}
