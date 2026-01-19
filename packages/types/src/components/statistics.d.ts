import type { CourseStats } from "../data/course";
export interface StatisticsClientProps {
}
export interface MyCreatedCoursesProps {
    courses: CourseStats[];
    loading: boolean;
    error: string | null;
}
export interface StatsGridProps {
    children: React.ReactNode;
}
export interface StatisticsData {
    totalUsers?: number;
    totalCourses?: number;
    totalTrainings?: number;
}
export interface DetailedCourseStats extends CourseStats {
    userCourses: {
        userId: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        user: {
            username: string;
            profile: {
                avatarUrl: string | null;
            };
        };
    }[];
    isPrivate: boolean;
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
        dropoutPoints: {
            dayOrder: number;
            dropoutRate: number;
        }[];
        repeatUsers: number;
        achievements: {
            type: string;
            count: number;
        }[];
    };
    socialAnalytics?: {
        ratingDistribution: Record<string, number>;
        reviewSentiment: {
            positive: number;
            neutral: number;
            negative: number;
        };
        favoriteCount: number;
        recommendationEffectiveness: number;
    };
}
//# sourceMappingURL=statistics.d.ts.map