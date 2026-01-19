import type { UserWithTrainings } from "./user";
export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedAt?: Date;
    progress: number;
    category: AchievementCategory;
}
export type AchievementCategory = "courses" | "progress" | "streak" | "social" | "special";
export interface AchievementData {
    totalCourses: number;
    completedCourses: number;
    inProgressCourses: number;
    totalCompletedDays: number;
    totalDays: number;
    overallProgress: number;
    achievements: Achievement[];
    totalTrainingTime: number;
    averageCourseProgress: number;
    longestStreak: number;
    currentStreak: number;
    lastUpdated: Date;
    version: string;
}
export interface AchievementConfig {
    revalidateOnFocus: boolean;
    dedupingInterval: number;
    errorRetryCount: number;
    keepPreviousData: boolean;
}
export interface AchievementCalculationParams {
    user: UserWithTrainings;
    includeUnlocked?: boolean;
    includeProgress?: boolean;
}
export interface AchievementCalculationResult {
    achievements: Achievement[];
    statistics: {
        totalCourses: number;
        completedCourses: number;
        inProgressCourses: number;
        totalCompletedDays: number;
        totalDays: number;
        overallProgress: number;
        totalTrainingTime: number;
        averageCourseProgress: number;
        longestStreak: number;
        currentStreak: number;
    };
}
//# sourceMappingURL=achievements.d.ts.map