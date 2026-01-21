import type { TrainingStatus } from "../utils/training-status";
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
    avgRating: number | null;
    trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
    createdAt: Date;
    authorUsername: string;
    userStatus: TrainingStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    isFavorite: boolean;
    reviews: CourseReview[];
    userCourses: UserCourse[];
    dayLinks: DayLink[];
}
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
export interface CourseCardData {
    id: string;
    name: string;
    type: string;
    duration: string;
    logoImg: string;
    isPrivate: boolean;
    userStatus: TrainingStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    shortDesc: string;
    authorUsername: string;
    createdAt: Date;
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
//# sourceMappingURL=course.d.ts.map