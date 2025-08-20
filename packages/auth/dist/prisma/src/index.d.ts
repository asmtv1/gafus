export type { Course, CourseAccess, CourseReview, DayOnCourse, ErrorReport, FavoriteCourse, Pet, PetType, Prisma, PrismaClient, PushSubscription, Step, StepNotification, StepOnDay, TrainingDay, TrainingLevel, TrainingStatus, User, UserCourse, UserProfile, UserRole, UserStep, UserTraining, } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
export interface DatabaseClient {
    user: PrismaClient["user"];
    course: PrismaClient["course"];
    trainingDay: PrismaClient["trainingDay"];
    step: PrismaClient["step"];
    dayOnCourse: PrismaClient["dayOnCourse"];
    stepOnDay: PrismaClient["stepOnDay"];
    userCourse: PrismaClient["userCourse"];
    courseAccess: PrismaClient["courseAccess"];
    favoriteCourse: PrismaClient["favoriteCourse"];
    courseReview: PrismaClient["courseReview"];
    stepNotification: PrismaClient["stepNotification"];
    errorReport: PrismaClient["errorReport"];
    pushSubscription: PrismaClient["pushSubscription"];
    userProfile: PrismaClient["userProfile"];
    userTraining: PrismaClient["userTraining"];
    userStep: PrismaClient["userStep"];
    pet: PrismaClient["pet"];
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
    $on: (event: string, callback: (params: unknown) => void) => void;
    $transaction: <T>(fn: (prisma: DatabaseClient) => Promise<T>) => Promise<T>;
}
export declare const createPrismaClient: () => Promise<PrismaClient<{
    log: ("query" | "warn" | "error")[];
}, never, import("@prisma/client/runtime/library").DefaultArgs>>;
export { prisma, default as prismaClient } from "./client";
//# sourceMappingURL=index.d.ts.map