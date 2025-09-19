-- CreateEnum
CREATE TYPE "public"."TrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'TRAINER', 'ADMIN', 'MODERATOR', 'PREMIUM');

-- CreateEnum
CREATE TYPE "public"."PetType" AS ENUM ('DOG', 'CAT');

-- CreateEnum
CREATE TYPE "public"."TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateTable
CREATE TABLE "public"."Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "equipment" TEXT NOT NULL DEFAULT '',
    "trainingLevel" "public"."TrainingLevel" NOT NULL,
    "shortDesc" TEXT NOT NULL DEFAULT '',
    "duration" TEXT NOT NULL,
    "logoImg" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "avgRating" DOUBLE PRECISION,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingDay" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'regular',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Step" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DayOnCourse" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "DayOnCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StepOnDay" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "StepOnDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserTraining" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOnCourseId" TEXT NOT NULL,
    "status" "public"."TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStepIndex" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserStep" (
    "id" TEXT NOT NULL,
    "userTrainingId" TEXT NOT NULL,
    "stepOnDayId" TEXT NOT NULL,
    "status" "public"."TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "telegramId" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "passwordResetRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "birthDate" TIMESTAMP(3),
    "about" TEXT,
    "telegram" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Diploma" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diploma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Training" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserCourse" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "public"."TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "public"."Pet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."PetType" NOT NULL,
    "breed" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Award" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event" TEXT,
    "date" TIMESTAMP(3),
    "rank" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingAccess" (
    "trainingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "public"."CourseAccess" (
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "public"."FavoriteCourse" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "public"."CourseReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StepNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "endTs" INTEGER NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "subscription" JSONB NOT NULL,
    "url" TEXT,
    "jobId" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "remainingSec" INTEGER,
    "stepTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ErrorReport" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "appName" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "componentStack" TEXT,
    "additionalContext" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_type_key" ON "public"."Course"("type");

-- CreateIndex
CREATE INDEX "DayOnCourse_courseId_order_idx" ON "public"."DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DayOnCourse_courseId_order_key" ON "public"."DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE INDEX "StepOnDay_dayId_order_idx" ON "public"."StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StepOnDay_dayId_order_key" ON "public"."StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "UserTraining_userId_dayOnCourseId_key" ON "public"."UserTraining"("userId", "dayOnCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStep_userTrainingId_stepOnDayId_key" ON "public"."UserStep"("userTrainingId", "stepOnDayId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "public"."User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "public"."UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Diploma_userId_idx" ON "public"."Diploma"("userId");

-- CreateIndex
CREATE INDEX "Award_petId_idx" ON "public"."Award"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAccess_trainingId_userId_key" ON "public"."TrainingAccess"("trainingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_courseId_userId_key" ON "public"."CourseAccess"("courseId", "userId");

-- CreateIndex
CREATE INDEX "idx_rating_course_user" ON "public"."CourseReview"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_userId_courseId_key" ON "public"."CourseReview"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "public"."PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "public"."PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_userId_idx" ON "public"."StepNotification"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_day_stepIndex_idx" ON "public"."StepNotification"("day", "stepIndex");

-- CreateIndex
CREATE INDEX "ErrorReport_appName_idx" ON "public"."ErrorReport"("appName");

-- CreateIndex
CREATE INDEX "ErrorReport_environment_idx" ON "public"."ErrorReport"("environment");

-- CreateIndex
CREATE INDEX "ErrorReport_resolved_idx" ON "public"."ErrorReport"("resolved");

-- CreateIndex
CREATE INDEX "ErrorReport_createdAt_idx" ON "public"."ErrorReport"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."Course" ADD CONSTRAINT "Course_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingDay" ADD CONSTRAINT "TrainingDay_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Step" ADD CONSTRAINT "Step_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DayOnCourse" ADD CONSTRAINT "DayOnCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DayOnCourse" ADD CONSTRAINT "DayOnCourse_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "public"."TrainingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StepOnDay" ADD CONSTRAINT "StepOnDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "public"."TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StepOnDay" ADD CONSTRAINT "StepOnDay_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "public"."Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserTraining" ADD CONSTRAINT "UserTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserTraining" ADD CONSTRAINT "UserTraining_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "public"."DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStep" ADD CONSTRAINT "UserStep_userTrainingId_fkey" FOREIGN KEY ("userTrainingId") REFERENCES "public"."UserTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStep" ADD CONSTRAINT "UserStep_stepOnDayId_fkey" FOREIGN KEY ("stepOnDayId") REFERENCES "public"."StepOnDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Diploma" ADD CONSTRAINT "Diploma_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Training" ADD CONSTRAINT "Training_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Award" ADD CONSTRAINT "Award_petId_fkey" FOREIGN KEY ("petId") REFERENCES "public"."Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingAccess" ADD CONSTRAINT "TrainingAccess_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "public"."Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrainingAccess" ADD CONSTRAINT "TrainingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseReview" ADD CONSTRAINT "CourseReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StepNotification" ADD CONSTRAINT "StepNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
