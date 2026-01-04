-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'TRAINER', 'ADMIN', 'MODERATOR', 'PREMIUM');

-- CreateEnum
CREATE TYPE "PetType" AS ENUM ('DOG', 'CAT');

-- CreateEnum
CREATE TYPE "TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('TRAINING', 'EXAMINATION', 'THEORY', 'BREAK', 'PRACTICE');

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "equipment" TEXT NOT NULL DEFAULT '',
    "trainingLevel" "TrainingLevel" NOT NULL,
    "shortDesc" TEXT NOT NULL DEFAULT '',
    "duration" TEXT NOT NULL,
    "logoImg" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "avgRating" DOUBLE PRECISION,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDay" (
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
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "estimatedDurationSec" INTEGER,
    "type" "StepType" NOT NULL DEFAULT 'TRAINING',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "checklist" JSONB,
    "requiresVideoReport" BOOLEAN NOT NULL DEFAULT false,
    "requiresWrittenFeedback" BOOLEAN NOT NULL DEFAULT false,
    "hasTestQuestions" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "estimatedDurationSec" INTEGER,
    "type" "StepType" NOT NULL DEFAULT 'TRAINING',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "checklist" JSONB,
    "requiresVideoReport" BOOLEAN NOT NULL DEFAULT false,
    "requiresWrittenFeedback" BOOLEAN NOT NULL DEFAULT false,
    "hasTestQuestions" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOnCourse" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "DayOnCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepOnDay" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "StepOnDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTraining" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOnCourseId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStepIndex" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStep" (
    "id" TEXT NOT NULL,
    "userTrainingId" TEXT NOT NULL,
    "stepOnDayId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "remainingSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "telegramId" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "passwordResetRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerVideo" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
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
CREATE TABLE "Diploma" (
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
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCourse" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PetType" NOT NULL,
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
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event" TEXT,
    "date" TIMESTAMP(3),
    "rank" TEXT,
    "examType" TEXT,
    "examScore" INTEGER,
    "courseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAccess" (
    "trainingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CourseAccess" (
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FavoriteCourse" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "CourseReview" (
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
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepNotification" (
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
    "type" TEXT NOT NULL DEFAULT 'step',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResult" (
    "id" TEXT NOT NULL,
    "userStepId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "testAnswers" JSONB,
    "testScore" INTEGER,
    "testMaxScore" INTEGER,
    "videoReportUrl" TEXT,
    "videoDeletedAt" TIMESTAMP(3),
    "videoDeleteReason" TEXT,
    "writtenFeedback" TEXT,
    "overallScore" INTEGER,
    "isPassed" BOOLEAN,
    "trainerComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReengagementCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "lastActivityDate" TIMESTAMP(3) NOT NULL,
    "campaignStartDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotificationSent" TIMESTAMP(3),
    "nextNotificationDate" TIMESTAMP(3),
    "returned" BOOLEAN NOT NULL DEFAULT false,
    "returnedAt" TIMESTAMP(3),
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "totalNotificationsSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReengagementCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReengagementNotification" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "messageType" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clickedAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReengagementNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReengagementSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAt" TIMESTAMP(3),
    "preferredTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "maxNotificationsPerWeek" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReengagementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT NOT NULL DEFAULT '09:00',
    "reminderDays" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "metadata" JSONB,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReengagementMetrics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalActive" INTEGER NOT NULL,
    "totalSent" INTEGER NOT NULL,
    "totalReturned" INTEGER NOT NULL,
    "level1Sent" INTEGER NOT NULL DEFAULT 0,
    "level2Sent" INTEGER NOT NULL DEFAULT 0,
    "level3Sent" INTEGER NOT NULL DEFAULT 0,
    "level4Sent" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION,
    "clickRate" DOUBLE PRECISION,
    "returnRate" DOUBLE PRECISION,
    "emotionalSent" INTEGER NOT NULL DEFAULT 0,
    "educationalSent" INTEGER NOT NULL DEFAULT 0,
    "motivationalSent" INTEGER NOT NULL DEFAULT 0,
    "mixedSent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReengagementMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT,
    "referrer" TEXT,
    "referrerDomain" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "refParam" TEXT,
    "campaignParam" TEXT,
    "sourceParam" TEXT,
    "tagParam" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "language" TEXT,
    "deviceType" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "timeOnPage" INTEGER,
    "scrollDepth" INTEGER,
    "reachedHero" INTEGER,
    "reachedProblem" INTEGER,
    "reachedSolution" INTEGER,
    "reachedFeatures" INTEGER,
    "reachedComparison" INTEGER,
    "reachedGoals" INTEGER,
    "reachedContact" INTEGER,
    "ctaClicks" INTEGER NOT NULL DEFAULT 0,
    "convertedToUser" BOOLEAN NOT NULL DEFAULT false,
    "convertedUserId" TEXT,
    "firstViewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionEndedAt" TIMESTAMP(3),
    "additionalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "viewId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "targetElement" TEXT,
    "targetSection" TEXT,
    "scrollDepth" INTEGER,
    "timeOnPage" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresentationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "level" TEXT NOT NULL DEFAULT 'error',
    "appName" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'development',
    "context" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "componentStack" TEXT,
    "additionalContext" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'new',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_type_key" ON "Course"("type");

-- CreateIndex
CREATE UNIQUE INDEX "StepCategory_name_key" ON "StepCategory"("name");

-- CreateIndex
CREATE INDEX "StepCategory_order_idx" ON "StepCategory"("order");

-- CreateIndex
CREATE INDEX "StepTemplate_categoryId_idx" ON "StepTemplate"("categoryId");

-- CreateIndex
CREATE INDEX "StepTemplate_isPublic_idx" ON "StepTemplate"("isPublic");

-- CreateIndex
CREATE INDEX "StepTemplate_authorId_idx" ON "StepTemplate"("authorId");

-- CreateIndex
CREATE INDEX "DayOnCourse_courseId_order_idx" ON "DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DayOnCourse_courseId_order_key" ON "DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE INDEX "StepOnDay_dayId_order_idx" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StepOnDay_dayId_order_key" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "UserTraining_userId_dayOnCourseId_key" ON "UserTraining"("userId", "dayOnCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStep_userTrainingId_stepOnDayId_key" ON "UserStep"("userTrainingId", "stepOnDayId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "idx_trainer_videos_trainer" ON "TrainerVideo"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Diploma_userId_idx" ON "Diploma"("userId");

-- CreateIndex
CREATE INDEX "Award_petId_idx" ON "Award"("petId");

-- CreateIndex
CREATE INDEX "Award_courseId_idx" ON "Award"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAccess_trainingId_userId_key" ON "TrainingAccess"("trainingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_courseId_userId_key" ON "CourseAccess"("courseId", "userId");

-- CreateIndex
CREATE INDEX "idx_rating_course_user" ON "CourseReview"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_userId_courseId_key" ON "CourseReview"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_userId_idx" ON "StepNotification"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_day_stepIndex_idx" ON "StepNotification"("day", "stepIndex");

-- CreateIndex
CREATE INDEX "StepNotification_type_idx" ON "StepNotification"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ExamResult_userStepId_key" ON "ExamResult"("userStepId");

-- CreateIndex
CREATE INDEX "ExamResult_userStepId_idx" ON "ExamResult"("userStepId");

-- CreateIndex
CREATE INDEX "ExamResult_stepId_idx" ON "ExamResult"("stepId");

-- CreateIndex
CREATE INDEX "ExamResult_videoDeletedAt_idx" ON "ExamResult"("videoDeletedAt");

-- CreateIndex
CREATE INDEX "ExamResult_reviewedById_idx" ON "ExamResult"("reviewedById");

-- CreateIndex
CREATE INDEX "ReengagementCampaign_userId_idx" ON "ReengagementCampaign"("userId");

-- CreateIndex
CREATE INDEX "ReengagementCampaign_isActive_nextNotificationDate_idx" ON "ReengagementCampaign"("isActive", "nextNotificationDate");

-- CreateIndex
CREATE INDEX "ReengagementCampaign_lastActivityDate_idx" ON "ReengagementCampaign"("lastActivityDate");

-- CreateIndex
CREATE INDEX "ReengagementNotification_campaignId_idx" ON "ReengagementNotification"("campaignId");

-- CreateIndex
CREATE INDEX "ReengagementNotification_sent_sentAt_idx" ON "ReengagementNotification"("sent", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReengagementSettings_userId_key" ON "ReengagementSettings"("userId");

-- CreateIndex
CREATE INDEX "Reminder_userId_type_idx" ON "Reminder"("userId", "type");

-- CreateIndex
CREATE INDEX "Reminder_enabled_idx" ON "Reminder"("enabled");

-- CreateIndex
CREATE INDEX "Reminder_type_idx" ON "Reminder"("type");

-- CreateIndex
CREATE INDEX "Reminder_reminderTime_idx" ON "Reminder"("reminderTime");

-- CreateIndex
CREATE INDEX "ReengagementMetrics_date_idx" ON "ReengagementMetrics"("date");

-- CreateIndex
CREATE INDEX "PresentationView_sessionId_idx" ON "PresentationView"("sessionId");

-- CreateIndex
CREATE INDEX "PresentationView_visitorId_idx" ON "PresentationView"("visitorId");

-- CreateIndex
CREATE INDEX "PresentationView_referrerDomain_idx" ON "PresentationView"("referrerDomain");

-- CreateIndex
CREATE INDEX "PresentationView_refParam_idx" ON "PresentationView"("refParam");

-- CreateIndex
CREATE INDEX "PresentationView_campaignParam_idx" ON "PresentationView"("campaignParam");

-- CreateIndex
CREATE INDEX "PresentationView_firstViewAt_idx" ON "PresentationView"("firstViewAt");

-- CreateIndex
CREATE INDEX "PresentationView_createdAt_idx" ON "PresentationView"("createdAt");

-- CreateIndex
CREATE INDEX "PresentationView_convertedToUser_idx" ON "PresentationView"("convertedToUser");

-- CreateIndex
CREATE INDEX "PresentationView_convertedUserId_idx" ON "PresentationView"("convertedUserId");

-- CreateIndex
CREATE INDEX "PresentationEvent_sessionId_idx" ON "PresentationEvent"("sessionId");

-- CreateIndex
CREATE INDEX "PresentationEvent_eventType_idx" ON "PresentationEvent"("eventType");

-- CreateIndex
CREATE INDEX "PresentationEvent_viewId_idx" ON "PresentationEvent"("viewId");

-- CreateIndex
CREATE INDEX "PresentationEvent_createdAt_idx" ON "PresentationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ErrorLog_appName_level_timestamp_idx" ON "ErrorLog"("appName", "level", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_environment_timestamp_idx" ON "ErrorLog"("environment", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_status_timestamp_idx" ON "ErrorLog"("status", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDay" ADD CONSTRAINT "TrainingDay_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StepCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_userTrainingId_fkey" FOREIGN KEY ("userTrainingId") REFERENCES "UserTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_stepOnDayId_fkey" FOREIGN KEY ("stepOnDayId") REFERENCES "StepOnDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerVideo" ADD CONSTRAINT "TrainerVideo_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diploma" ADD CONSTRAINT "Diploma_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAccess" ADD CONSTRAINT "TrainingAccess_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAccess" ADD CONSTRAINT "TrainingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepNotification" ADD CONSTRAINT "StepNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_userStepId_fkey" FOREIGN KEY ("userStepId") REFERENCES "UserStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementCampaign" ADD CONSTRAINT "ReengagementCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementNotification" ADD CONSTRAINT "ReengagementNotification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReengagementCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementSettings" ADD CONSTRAINT "ReengagementSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
