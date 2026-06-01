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
  SurveyResponse,
  TrainingDay,
  TrainingLevel,
  User,
  AppSubscription,
  AppSubscriptionPayment,
  AppSubscriptionEvent,
  AppSubscriptionSettings,
  AppSubscriptionTrial,
  RewardedAdEvent,
  RewardedAdSession,
  RewardedAdSettings,
  RewardedCreditTransaction,
  RewardedCreditWallet,
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
  SurveyPhase,
  TrainingStatus,
  TranscodingStatus,
  UserRole,
  AppSubscriptionEventProcessingStatus,
  AppSubscriptionEventSource,
  AppSubscriptionPaymentKind,
  AppSubscriptionPaymentStatus,
  AppSubscriptionProvider,
  AppSubscriptionStatus,
  RewardedAdSessionStatus,
  RewardedCreditTransactionType,
  RewardedPlatform,
  RewardedProvider,
  RewardedTargetType,
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
  surveyResponse: PrismaClient["surveyResponse"];
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
  appSubscription: PrismaClient["appSubscription"];
  appSubscriptionPayment: PrismaClient["appSubscriptionPayment"];
  appSubscriptionEvent: PrismaClient["appSubscriptionEvent"];
  appSubscriptionSettings: PrismaClient["appSubscriptionSettings"];
  appSubscriptionTrial: PrismaClient["appSubscriptionTrial"];
  rewardedAdSettings: PrismaClient["rewardedAdSettings"];
  rewardedCreditWallet: PrismaClient["rewardedCreditWallet"];
  rewardedAdSession: PrismaClient["rewardedAdSession"];
  rewardedCreditTransaction: PrismaClient["rewardedCreditTransaction"];
  rewardedAdEvent: PrismaClient["rewardedAdEvent"];
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
