// Экспортируем только типы Prisma, не сам клиент
export type {
  ConsentLog,
  Course,
  CourseAccess,
  CourseReview,
  DailyCourseBundle,
  DailyCourseBundleStep,
  DailyCourseSchedule,
  DailyCourseUserStep,
  DailyCourseUserTraining,
  DayOnCourse,
  ErrorLog,
  FavoriteCourse,
  Pet,
  PrismaClient,
  PushSubscription,
  Step,
  StepNotification,
  StepOnDay,
  TrainingDay,
  TrainingLevel,
  User,
  UserCourse,
  UserProfile,
  UserStep,
  UserTraining,
} from "@prisma/client";

// Экспортируем enum как значение для использования в zod схемах и кастах
export {
  ConsentLogStatus,
  ConsentType,
  ConsultationBookingStatus,
  ConsultationEmailStatus,
  ConsultationEmailType,
  ConsultationPetGender,
  ConsultationSlotStatus,
  PetPreventionReminderKind,
  PetPreventionType,
  PetType,
  RegistrationChannel,
  StepType,
  TrainingStatus,
  TranscodingStatus,
  UserRole,
} from "@prisma/client";

// Экспортируем пространство имён Prisma (для JsonNull, Decimal и т.д.)
import { Prisma } from "@prisma/client";
export { Prisma };

// Импортируем PrismaClient для использования в типах
import type { PrismaClient } from "@prisma/client";

// Создаем интерфейс для PrismaClient, используя конкретные типы
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
  errorLog: PrismaClient["errorLog"];
  pushSubscription: PrismaClient["pushSubscription"];
  userProfile: PrismaClient["userProfile"];
  userTraining: PrismaClient["userTraining"];
  userStep: PrismaClient["userStep"];
  dailyCourseSchedule: PrismaClient["dailyCourseSchedule"];
  dailyCourseBundle: PrismaClient["dailyCourseBundle"];
  dailyCourseBundleStep: PrismaClient["dailyCourseBundleStep"];
  dailyCourseUserTraining: PrismaClient["dailyCourseUserTraining"];
  dailyCourseUserStep: PrismaClient["dailyCourseUserStep"];
  pet: PrismaClient["pet"];
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $on: (event: string, callback: (params: unknown) => void) => void;
  $transaction: <T>(fn: (prisma: DatabaseClient) => Promise<T>) => Promise<T>;
}

// Экспортируем готовый экземпляр клиента для приложений
export { prisma, default as prismaClient } from "./client";

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
