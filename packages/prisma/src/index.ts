// Экспортируем только типы Prisma, не сам клиент
export type {
  Course,
  CourseAccess,
  CourseReview,
  DayOnCourse,
  ErrorReport,
  FavoriteCourse,
  Pet,
  PetType,
  Prisma,
  PrismaClient,
  PushSubscription,
  Step,
  StepNotification,
  StepOnDay,
  TrainingDay,
  TrainingLevel,
  TrainingStatus,
  User,
  UserCourse,
  UserProfile,
  UserRole,
  UserStep,
  UserTraining,
} from "@prisma/client";

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

// Экспортируем готовый экземпляр клиента для приложений
export { prisma, default as prismaClient } from "./client";
