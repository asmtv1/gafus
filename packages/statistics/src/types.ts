import type { TrainingStatus } from "@gafus/types";

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

export interface DetailedCourseStats extends CourseStats {
  description?: string;
  duration?: string;
  category?: string;
  tags?: string[];
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

export interface StepStats {
  id: string;
  title: string;
  durationSec: number | null;
  usedInDaysCount: number;
  usedInCoursesCount: number;
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
}

export interface DetailedStepStats extends StepStats {
  days: { id: string; title: string; order: number }[];
  courses: { id: string; name: string }[];
  timeAnalytics: {
    activityByDayOfWeek: Record<string, number>;
    activityByHour: Record<string, number>;
    activityByMonth: Record<string, number>;
    averageTimeToCompleteSec: number;
  };
  completionRate: number;
}

export interface UserDayProgress {
  dayOrder: number;
  dayTitle: string;
  status: TrainingStatus;
  dayCompletedAt: Date | null;
  steps: {
    stepOrder: number;
    stepTitle: string;
    status: TrainingStatus;
    startedAt: Date | null;
    completedAt: Date | null;
  }[];
}

export interface UserDetailedProgress {
  userId: string;
  username: string;
  avatarUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  days: UserDayProgress[];
}

export interface StepStatisticsData {
  steps: StepStats[];
  totalSteps: number;
}

