// Общие типы для статистики в trainer-panel

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
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  author?: {
    username: string;
    fullName?: string | null;
  };
  reviews: CourseReview[];
  userCourses: UserCourse[];
}

export interface CourseReview {
  rating: number | null;
  comment: string | null;
  createdAt: Date;
  user: {
    username: string;
    profile: { avatarUrl: string | null };
  };
}

export interface UserCourse {
  userId: string;
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  user: {
    username: string;
    profile: { avatarUrl: string | null };
  };
}

export type TrainingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface DetailedCourseStats extends CourseStats {
  // Дополнительные поля для детальной статистики
  description?: string;
  duration?: string;
  category?: string;
  tags?: string[];
  // Дополнительные поля аналитики
  dayAnalytics?: {
    dayId: string;
    dayTitle: string;
    dayOrder: number;
    totalSteps: number;
    completedSteps: number;
    completionRate: number;
    averageTimePerStep: number;
    difficultyScore: number;
  }[];
  timeAnalytics?: {
    activityByDayOfWeek: Record<string, number>;
    activityByHour: Record<string, number>;
    activityByMonth: Record<string, number>;
    averageTimeBetweenSessions: number;
  };
  progressAnalytics?: {
    averageCompletionTime: number;
    dropoutPoints: { dayOrder: number; dropoutRate: number }[];
    repeatUsers: number;
    achievements: { type: string; count: number }[];
  };
  socialAnalytics?: {
    ratingDistribution: Record<string, number>;
    reviewSentiment: { positive: number; neutral: number; negative: number };
    favoriteCount: number;
    recommendationEffectiveness: number;
  };
}

export interface StatisticsData {
  courses: CourseStats[];
  totalCourses: number;
  totalDays: number;
}
