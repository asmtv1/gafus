-- CreateEnum
CREATE TYPE "MobileIntroPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "MobileIntroCompletion" AS ENUM ('COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MobileIntroAuthOutcome" AS ENUM ('REGISTERED', 'LOGGED_IN');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PERSONAL_DATA', 'PRIVACY_POLICY', 'DATA_DISTRIBUTION');

-- CreateEnum
CREATE TYPE "ConsentLogStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GafusTransactionKind" AS ENUM ('EARN', 'SPEND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'LEGACY_IMPORT');

-- CreateEnum
CREATE TYPE "GafusRewardClass" AS ENUM ('ACTIVITY', 'BONUS');

-- CreateEnum
CREATE TYPE "GafusRewardKind" AS ENUM ('POST_PUBLISHED', 'QUESTION_CREATED', 'ANSWER_CREATED', 'POST_REACTION_MILESTONE', 'BEST_ANSWER');

-- CreateEnum
CREATE TYPE "GafusRewardDecision" AS ENUM ('GRANTED', 'DENIED_ACTIVITY_LIMIT', 'DENIED_ANTI_ABUSE', 'DENIED_POLICY', 'DISABLED');

-- CreateEnum
CREATE TYPE "GafusAccessTargetType" AS ENUM ('COURSE_STEP', 'MINI_GUIDE', 'ARTICLE');

-- CreateEnum
CREATE TYPE "GafusNotificationKind" AS ENUM ('REACTION_MILESTONE', 'BEST_ANSWER');

-- CreateEnum
CREATE TYPE "GafusOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "GafusFraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "GafusFraudStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SurveyPhase" AS ENUM ('INITIAL', 'FINAL');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'RESET');

-- CreateEnum
CREATE TYPE "RegistrationChannel" AS ENUM ('WEB', 'IOS', 'ANDROID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'PARTNER', 'TRAINER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "PartnerCommissionKind" AS ENUM ('EARNED', 'REFUND_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PartnerPayoutStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegistrationEmailAttemptResult" AS ENUM ('SUCCEEDED', 'USERNAME_TAKEN', 'EMAIL_TAKEN', 'VALIDATION_ERROR');

-- CreateEnum
CREATE TYPE "VkRegistrationContextPurpose" AS ENUM ('REGISTER', 'LOGIN', 'LINK_ACCOUNT');

-- CreateEnum
CREATE TYPE "VkLoginGrantPurpose" AS ENUM ('LOGIN', 'REGISTRATION_CONSENT');

-- CreateEnum
CREATE TYPE "PetType" AS ENUM ('DOG', 'CAT');

-- CreateEnum
CREATE TYPE "PetPreventionType" AS ENUM ('VACCINATION', 'DEWORMING', 'TICKS_FLEAS');

-- CreateEnum
CREATE TYPE "PetPreventionReminderKind" AS ENUM ('AFTER_DAYS', 'ON_DATE');

-- CreateEnum
CREATE TYPE "TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('TRAINING', 'EXAMINATION', 'THEORY', 'BREAK', 'PRACTICE', 'DIARY', 'SURVEY');

-- CreateEnum
CREATE TYPE "TranscodingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppSubscriptionProvider" AS ENUM ('YOOKASSA', 'APPLE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AppSubscriptionPlanCode" AS ENUM ('WEEKLY', 'TWO_WEEKS', 'MONTHLY', 'THREE_MONTHS');

-- CreateEnum
CREATE TYPE "AppSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AppSubscriptionPaymentKind" AS ENUM ('INITIAL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "AppSubscriptionPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NpdConnectionStatus" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "NpdReceiptStatus" AS ENUM ('PENDING', 'ISSUED', 'CANCEL_PENDING', 'CANCELED', 'RECONCILIATION_REQUIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "NpdReceiptOperationType" AS ENUM ('CREATE', 'CANCEL');

-- CreateEnum
CREATE TYPE "NpdReceiptOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'NOT_REQUIRED', 'RECONCILIATION_REQUIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "NpdReceiptEmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AppSubscriptionPromoCodeEventType" AS ENUM ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AppSubscriptionEventSource" AS ENUM ('YOOKASSA', 'APPLE', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppSubscriptionEventProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RewardedPlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "RewardedProvider" AS ENUM ('YANDEX');

-- CreateEnum
CREATE TYPE "RewardedAdSessionStatus" AS ENUM ('CREATED', 'LOADED', 'SHOWN', 'REWARDED', 'GRANTED', 'DISMISSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RewardedCreditTransactionType" AS ENUM ('EARN', 'SPEND', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RewardedTargetType" AS ENUM ('ARTICLE', 'COURSE_STEP', 'DAILY_COURSE_STEP', 'CONSULTATION_BOOKING');

-- CreateEnum
CREATE TYPE "RewardedTargetAccessType" AS ENUM ('ARTICLE', 'COURSE_STEP');

-- CreateEnum
CREATE TYPE "RewardedTargetAccessSource" AS ENUM ('REWARDED_AD', 'LEGACY_GAFUS');

-- CreateEnum
CREATE TYPE "ArticleContentType" AS ENUM ('TEXT', 'HTML');

-- CreateEnum
CREATE TYPE "ArticleVisibility" AS ENUM ('PUBLIC', 'PAID');

-- CreateEnum
CREATE TYPE "ConsultationSlotStatus" AS ENUM ('FREE', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConsultationBookingStatus" AS ENUM ('PENDING_TRAINER_CONFIRMATION', 'CONFIRMED', 'CANCELLED_BY_TRAINER', 'CANCELLED_BY_USER', 'CANCELLED_BY_SLA', 'CANCELLED_BY_SYSTEM', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ConsultationPetGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ConsultationEmailType" AS ENUM ('TRAINER_CONFIRM_REQUEST', 'CLIENT_BOOKING_RECEIVED', 'CLIENT_BOOKING_CONFIRMED', 'TRAINER_BOOKING_CONFIRMED', 'CLIENT_BOOKING_CANCELLED_BY_TRAINER', 'TRAINER_BOOKING_CANCELLED_BY_USER', 'CLIENT_BOOKING_CANCELLED_BY_SLA', 'CLIENT_BOOKING_VIDEO_FAILED', 'CLIENT_CONSULTATION_REMINDER_30M', 'CLIENT_CONSULTATION_START', 'TRAINER_CONSULTATION_REMINDER_30M', 'CLIENT_CONSULTATION_NO_SHOW');

-- CreateEnum
CREATE TYPE "ConsultationEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "GalleryPhotoStatus" AS ENUM ('pending', 'processing', 'ready', 'moving', 'failed');

-- CreateEnum
CREATE TYPE "GalleryUploadStatus" AS ENUM ('reserved', 'uploaded', 'processing', 'ready', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "GalleryStorageJobKind" AS ENUM ('publish', 'move', 'delete', 'vetPreview');

-- CreateEnum
CREATE TYPE "GalleryStorageJobStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "FeedPostStatus" AS ENUM ('draft', 'pending', 'published', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "FeedRevisionStatus" AS ENUM ('draft', 'pending', 'ready', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "FeedMediaKind" AS ENUM ('photo', 'video');

-- CreateEnum
CREATE TYPE "FeedMediaStatus" AS ENUM ('reserved', 'uploaded', 'processing', 'ready', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "FeedJobKind" AS ENUM ('copy_album', 'publish_photo', 'publish_video', 'delete_keys', 'cleanup_source');

-- CreateEnum
CREATE TYPE "FeedJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "FeedReactionKind" AS ENUM ('heart', 'laugh', 'dog', 'fire', 'like');

-- CreateEnum
CREATE TYPE "FeedNotificationKind" AS ENUM ('author_post', 'comment', 'reply', 'post_reaction', 'comment_reaction');

-- CreateEnum
CREATE TYPE "Chat2Kind" AS ENUM ('DIRECT', 'CYNOLOGIST', 'COMMUNITY', 'COURSE', 'COURSE_TOPIC', 'CITY', 'BREED', 'GROUP');

-- CreateEnum
CREATE TYPE "Chat2Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateTable
CREATE TABLE "MediaCdnPurge" (
    "id" TEXT NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "paths" TEXT[],
    "purgeOperations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCdnPurge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountStorageCleanup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyCursor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "purgeOperations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purgeAfter" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountStorageCleanup_pkey" PRIMARY KEY ("id")
);

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
    "version" INTEGER NOT NULL DEFAULT 1,
    "showInProfile" BOOLEAN NOT NULL DEFAULT true,
    "isPersonalized" BOOLEAN NOT NULL DEFAULT false,
    "guideContent" TEXT,

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
    "showCoursePathExport" BOOLEAN NOT NULL DEFAULT false,
    "shareProgressAcrossCourses" BOOLEAN NOT NULL DEFAULT false,
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
    "type" "StepType" NOT NULL DEFAULT 'TRAINING',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "videoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checklist" JSONB,
    "requiresVideoReport" BOOLEAN NOT NULL DEFAULT false,
    "requiresWrittenFeedback" BOOLEAN NOT NULL DEFAULT false,
    "hasTestQuestions" BOOLEAN NOT NULL DEFAULT false,
    "surveySlug" TEXT,
    "isDailyCourse" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedDurationSec" INTEGER,

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
    "type" "StepType" NOT NULL DEFAULT 'TRAINING',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "checklist" JSONB,
    "requiresVideoReport" BOOLEAN NOT NULL DEFAULT false,
    "requiresWrittenFeedback" BOOLEAN NOT NULL DEFAULT false,
    "hasTestQuestions" BOOLEAN NOT NULL DEFAULT false,
    "surveySlug" TEXT,
    "categoryId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estimatedDurationSec" INTEGER,

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
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "DailyCourseBundle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'regular',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCourseBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCourseBundleStep" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "DailyCourseBundleStep_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "DailyCourseSchedule" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bundleId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCourseSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCourseUserTraining" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStepIndex" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCourseUserTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCourseUserStep" (
    "id" TEXT NOT NULL,
    "dailyCourseUserTrainingId" TEXT NOT NULL,
    "bundleStepId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "remainingSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCourseUserStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "feedPublishingBlocked" BOOLEAN NOT NULL DEFAULT false,
    "feedPublishingBlockReason" VARCHAR(1000),
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "appleAppAccountToken" VARCHAR(36),
    "password" TEXT NOT NULL,
    "passwordSetAt" TIMESTAMP(3),
    "sessionsRevokedAt" TIMESTAMP(3),
    "onboardingTourCompletedAt" TIMESTAMP(3),
    "telegramId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "registrationChannel" "RegistrationChannel" NOT NULL DEFAULT 'UNKNOWN',
    "passwordResetRequestedAt" TIMESTAMP(3),
    "accountDeletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedRegistrationPromoCodeId" TEXT,
    "registrationPending" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileIntroInstallation" (
    "id" TEXT NOT NULL,
    "installationId" VARCHAR(128) NOT NULL,
    "introVersion" VARCHAR(32) NOT NULL,
    "platform" "MobileIntroPlatform" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion" "MobileIntroCompletion",
    "completedAt" TIMESTAMP(3),
    "authOutcome" "MobileIntroAuthOutcome",
    "authOutcomeAt" TIMESTAMP(3),
    "authOutcomeUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileIntroInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "tempSessionId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "userId" TEXT,
    "consentVersion" TEXT NOT NULL,
    "consentText" JSONB,
    "consentDate" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "formData" JSONB,
    "status" "ConsentLogStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerVideo" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayName" TEXT,
    "hlsManifestPath" TEXT,
    "transcodingStatus" "TranscodingStatus" NOT NULL DEFAULT 'PENDING',
    "transcodedAt" TIMESTAMP(3),
    "transcodingError" TEXT,
    "thumbnailPath" TEXT,

    CONSTRAINT "TrainerVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVideoProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "lastPositionSec" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVideoProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "city" TEXT,
    "cityKey" VARCHAR(160),
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
    "userDisplayName" TEXT,
    "userGender" TEXT,
    "petName" TEXT,
    "petNameDat" TEXT,
    "petNameIns" TEXT,
    "petGender" TEXT,
    "petNameGen" TEXT,
    "petNameAcc" TEXT,
    "petNamePre" TEXT,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PetType" NOT NULL,
    "breed" TEXT NOT NULL,
    "breedKey" VARCHAR(160),
    "birthDate" TIMESTAMP(3) NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "targetWeightKg" DOUBLE PRECISION,
    "neckGirthCm" DOUBLE PRECISION,
    "muzzleGirthCm" DOUBLE PRECISION,
    "bellyGirthCm" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "showInProfile" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetVetVisit" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visitedOn" DATE NOT NULL,
    "specialty" VARCHAR(200) NOT NULL,
    "doctorName" VARCHAR(200) NOT NULL DEFAULT '',
    "clinic" VARCHAR(300) NOT NULL DEFAULT '',
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "conclusion" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetVetVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetVetAttachment" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalKey" TEXT NOT NULL,
    "previewKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetVetAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetWeightEntry" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetWeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetDocument" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetDocument_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "PetPreventionEntry" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "PetPreventionType" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "productName" TEXT,
    "notes" TEXT,
    "clientId" TEXT,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderKind" "PetPreventionReminderKind" NOT NULL DEFAULT 'AFTER_DAYS',
    "reminderDaysAfter" INTEGER,
    "reminderOnDate" DATE,
    "remindAt" DATE,
    "reminderTimes" JSONB NOT NULL DEFAULT '["09:00"]',
    "lastNotifiedForRemindAt" DATE,
    "sentTimesForRemindAt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetPreventionEntry_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "AppSubscriptionSettings" (
    "key" VARCHAR(32) NOT NULL,
    "weeklyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "twoWeeksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "threeMonthsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "yookassaWeeklyPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 200.00,
    "yookassaMonthlyPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 1465.00,
    "yookassaTwoWeeksPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 1185.00,
    "yookassaThreeMonthsPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 2470.00,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "weeklyIntervalDays" INTEGER NOT NULL DEFAULT 7,
    "monthlyIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "twoWeeksIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "threeMonthsIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "weeklyAppleProductId" TEXT,
    "monthlyAppleProductId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscriptionSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GafusWallet" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GafusWallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GafusTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GafusTransactionKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "rewardKind" "GafusRewardKind",
    "sourceEntityType" VARCHAR(32),
    "sourceEntityId" TEXT,
    "targetType" "GafusAccessTargetType",
    "targetKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "settingsRevision" INTEGER,
    "adminActorId" TEXT,
    "reason" VARCHAR(1000),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusRewardEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardClass" "GafusRewardClass" NOT NULL,
    "rewardKind" "GafusRewardKind" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "decision" "GafusRewardDecision" NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "denialCode" VARCHAR(64),
    "settingsRevision" INTEGER NOT NULL,
    "contentFingerprint" VARCHAR(64),
    "transactionId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "GafusRewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusPostReactionProgram" (
    "postId" TEXT NOT NULL,
    "thresholdStep" INTEGER NOT NULL,
    "highWaterReactionCount" INTEGER NOT NULL DEFAULT 0,
    "settingsRevision" INTEGER NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GafusPostReactionProgram_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "GafusPostReactionMilestone" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "eligibleReactionCount" INTEGER NOT NULL,
    "rewardEventId" TEXT NOT NULL,
    "settingsRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusPostReactionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusTargetAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "GafusAccessTargetType" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "courseId" TEXT,
    "dayOnCourseId" TEXT,
    "stepOnDayId" TEXT,
    "transactionId" TEXT NOT NULL,
    "settingsRevision" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusTargetAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusSettings" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'default',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "economyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spendingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "postReward" INTEGER NOT NULL DEFAULT 1,
    "questionReward" INTEGER NOT NULL DEFAULT 1,
    "answerReward" INTEGER NOT NULL DEFAULT 1,
    "activityLimit" INTEGER NOT NULL DEFAULT 3,
    "activityWindowSeconds" INTEGER NOT NULL DEFAULT 86400,
    "reactionThreshold" INTEGER NOT NULL DEFAULT 10,
    "reactionReward" INTEGER NOT NULL DEFAULT 1,
    "bestAnswerReward" INTEGER NOT NULL DEFAULT 1,
    "courseStepCost" INTEGER NOT NULL DEFAULT 1,
    "miniGuideCost" INTEGER NOT NULL DEFAULT 1,
    "accessDurationSeconds" INTEGER NOT NULL DEFAULT 604800,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GafusSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GafusSettingsRevision" (
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusSettingsRevision_pkey" PRIMARY KEY ("revision")
);

-- CreateTable
CREATE TABLE "GafusAdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "targetUserId" TEXT,
    "transactionId" TEXT,
    "reason" VARCHAR(1000) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusAdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusNotificationOutbox" (
    "id" TEXT NOT NULL,
    "rewardEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GafusNotificationKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "url" TEXT,
    "status" "GafusOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GafusNotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GafusFraudSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "severity" "GafusFraudSeverity" NOT NULL,
    "status" "GafusFraudStatus" NOT NULL DEFAULT 'OPEN',
    "kind" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(32),
    "entityId" TEXT,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GafusFraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedAdSettings" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'default',
    "androidEnabled" BOOLEAN NOT NULL DEFAULT false,
    "iosEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyAdLimit" INTEGER NOT NULL DEFAULT 1,
    "yandexAndroidPlacementId" TEXT,
    "yandexIosPlacementId" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedAdSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RewardedCreditWallet" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "pendingRefundCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedCreditWallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RewardedAdSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "RewardedPlatform" NOT NULL,
    "provider" "RewardedProvider" NOT NULL DEFAULT 'YANDEX',
    "placementId" TEXT NOT NULL,
    "status" "RewardedAdSessionStatus" NOT NULL DEFAULT 'CREATED',
    "targetType" "RewardedTargetType",
    "targetId" TEXT,
    "requestNonceHash" TEXT NOT NULL,
    "providerPayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rewardedAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedAdSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedTargetAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "RewardedTargetAccessType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "source" "RewardedTargetAccessSource" NOT NULL,
    "platform" "RewardedPlatform",
    "sessionId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedTargetAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedCreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RewardedCreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "targetType" "RewardedTargetType",
    "targetId" TEXT,
    "provider" "RewardedProvider",
    "sessionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "refundedTransactionId" TEXT,
    "refundReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedAdEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedAdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AppSubscriptionProvider" NOT NULL,
    "status" "AppSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "planCode" "AppSubscriptionPlanCode" NOT NULL DEFAULT 'WEEKLY',
    "renewalPriceRub" DECIMAL(12,3),
    "renewalIntervalDays" INTEGER,
    "renewalCurrency" VARCHAR(3),
    "planTitle" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "pendingExpiresAt" TIMESTAMP(3),
    "isLifetime" BOOLEAN NOT NULL DEFAULT false,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "yookassaPaymentMethodId" TEXT,
    "yookassaPaymentMethodLast4" VARCHAR(4),
    "yookassaPaymentMethodTitle" TEXT,
    "renewalReminderSentForPeriodEnd" TIMESTAMP(3),
    "renewalEmailThreeDaysSentForPeriodEnd" TIMESTAMP(3),
    "appleOriginalTransactionId" TEXT,
    "appleProductId" TEXT,
    "manualGrantedById" TEXT,
    "manualReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionTrial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AppSubscriptionProvider" NOT NULL,
    "subscriptionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "paymentMethodFingerprintHash" VARCHAR(64),
    "trialUnavailableReason" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscriptionTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT NOT NULL,
    "provider" "AppSubscriptionProvider" NOT NULL,
    "kind" "AppSubscriptionPaymentKind" NOT NULL,
    "status" "AppSubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "planCode" "AppSubscriptionPlanCode" NOT NULL DEFAULT 'WEEKLY',
    "planTitle" TEXT,
    "amount" DECIMAL(12,3),
    "currency" VARCHAR(3),
    "buyerEmail" VARCHAR(320),
    "promoCodeId" TEXT,
    "promoCodeSnapshot" VARCHAR(64),
    "promoDiscountPercent" INTEGER,
    "originalAmount" DECIMAL(12,3),
    "providerPaymentMethodType" VARCHAR(64),
    "providerIncomeAmount" DECIMAL(12,2),
    "providerCapturedAt" TIMESTAMP(3),
    "financeSyncedAt" TIMESTAMP(3),
    "financeRefundsIncomplete" BOOLEAN NOT NULL DEFAULT true,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "idempotenceKey" TEXT NOT NULL,
    "yookassaPaymentId" TEXT,
    "appleTransactionId" TEXT,
    "appleOriginalTransactionId" TEXT,
    "applePriceMilliunits" INTEGER,
    "appleStorefront" TEXT,
    "appleEnvironment" TEXT,
    "appleWebOrderLineItemId" TEXT,
    "confirmationUrl" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "succeededAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referralCode" VARCHAR(32),
    "promoCodeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReferral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCommission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "kind" "PartnerCommissionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "status" "PartnerPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "note" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkIdOneTimeLogin" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentCompletedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkIdOneTimeLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationEmailAttempt" (
    "id" TEXT NOT NULL,
    "tempSessionId" VARCHAR(128) NOT NULL,
    "dataFingerprint" VARCHAR(64) NOT NULL,
    "userId" TEXT,
    "result" "RegistrationEmailAttemptResult",
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationEmailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkRegistrationContext" (
    "id" TEXT NOT NULL,
    "contextTokenHash" VARCHAR(64) NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "codeVerifier" VARCHAR(128) NOT NULL,
    "purpose" "VkRegistrationContextPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedPromoCodeId" TEXT,
    "selectedPromoCodeValue" VARCHAR(128),
    "userId" TEXT,
    "resultUserId" TEXT,
    "completionFingerprint" VARCHAR(64),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkRegistrationContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkLoginGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "VkLoginGrantPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentCompletedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "reissuedFromId" TEXT,
    "registrationContextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkLoginGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpdConnection" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'default',
    "inn" VARCHAR(12) NOT NULL,
    "deviceId" VARCHAR(128) NOT NULL,
    "refreshTokenCipher" BYTEA NOT NULL,
    "refreshTokenIv" BYTEA NOT NULL,
    "refreshTokenTag" BYTEA NOT NULL,
    "refreshTokenKeyVersion" INTEGER NOT NULL,
    "status" "NpdConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "fiscalizationStartedAt" TIMESTAMP(3),
    "lastAuthorizedAt" TIMESTAMP(3),
    "lastSuccessfulOperationAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(64),
    "lastErrorRedacted" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpdConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpdReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "connectionId" VARCHAR(32) NOT NULL DEFAULT 'default',
    "status" "NpdReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "amountKopecks" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "planCode" "AppSubscriptionPlanCode" NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "serviceName" VARCHAR(256) NOT NULL,
    "buyerEmail" VARCHAR(320),
    "providerReceiptId" VARCHAR(128),
    "operationAt" TIMESTAMP(3) NOT NULL,
    "printUrl" VARCHAR(2048),
    "jsonUrl" VARCHAR(2048),
    "issuedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpdReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpdReceiptOperation" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "type" "NpdReceiptOperationType" NOT NULL,
    "status" "NpdReceiptOperationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(128),
    "leaseExpiresAt" TIMESTAMP(3),
    "providerRequestId" VARCHAR(128),
    "completedAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(64),
    "lastErrorRedacted" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpdReceiptOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpdReceiptEmailDelivery" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "status" "NpdReceiptEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" VARCHAR(320) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(128),
    "leaseExpiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" VARCHAR(128),
    "lastErrorCode" VARCHAR(64),
    "lastErrorRedacted" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpdReceiptEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionPromoCode" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "normalizedCode" VARCHAR(64) NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscriptionPromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionPromoCodeEvent" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "type" "AppSubscriptionPromoCodeEventType" NOT NULL,
    "actorId" TEXT,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSubscriptionPromoCodeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT,
    "source" "AppSubscriptionEventSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventKey" TEXT,
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,
    "processingStatus" "AppSubscriptionEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastProcessingError" TEXT,
    "actorId" TEXT,
    "metadata" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSubscriptionEvent_pkey" PRIMARY KEY ("id")
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
    "shortCode" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "hadEmail" BOOLEAN NOT NULL DEFAULT false,
    "initiatedBy" TEXT NOT NULL DEFAULT 'SELF_SERVICE',
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionCounter" (
    "id" TEXT NOT NULL,
    "totalDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChangeToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
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
    "dayOnCourseId" TEXT,
    "stepOnDayId" TEXT,
    "originalStepId" TEXT,
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
    "userStepId" TEXT,
    "dailyCourseUserStepId" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trainerComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "petId" TEXT,
    "surveySlug" TEXT NOT NULL,
    "surveyFamilySlug" TEXT NOT NULL,
    "phase" "SurveyPhase" NOT NULL,
    "surveyVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "ReminderMutationReceipt" (
    "ownerUserId" TEXT NOT NULL,
    "operationKey" VARCHAR(36) NOT NULL,
    "operationKind" VARCHAR(16) NOT NULL DEFAULT 'CREATE',
    "fingerprint" VARCHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "reminderId" TEXT,
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderMutationReceipt_pkey" PRIMARY KEY ("ownerUserId","operationKey")
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
CREATE TABLE "TrainingReminderDelivery" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingReminderDelivery_pkey" PRIMARY KEY ("id")
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
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAIChat" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT,
    "attachments" JSONB,

    CONSTRAINT "TrainerAIChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAIConfig" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "apiKey" VARCHAR(500),
    "model" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',

    CONSTRAINT "TrainerAIConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerNote" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" VARCHAR(200),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerNoteEntry" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isVisibleToStudent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrainerNoteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerNoteStudent" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerNoteStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" "ArticleContentType" NOT NULL DEFAULT 'HTML',
    "content" TEXT NOT NULL,
    "visibility" "ArticleVisibility" NOT NULL DEFAULT 'PUBLIC',
    "videoUrl" TEXT,
    "logoImg" TEXT NOT NULL DEFAULT '',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slug" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleLike" (
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleLike_pkey" PRIMARY KEY ("userId","articleId")
);

-- CreateTable
CREATE TABLE "ArticleViewer" (
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleViewer_pkey" PRIMARY KEY ("articleId","userId")
);

-- CreateTable
CREATE TABLE "ArticleGuestView" (
    "articleId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleGuestView_pkey" PRIMARY KEY ("articleId","visitorKey")
);

-- CreateTable
CREATE TABLE "AppFeatureFlag" (
    "key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reviewEnabled" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppFeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MobileAppReleasePolicy" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'default',
    "iosReviewVersion" VARCHAR(32),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileAppReleasePolicy_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConsultationCynologist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "slotDurationMin" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "bookingLeadTimeMin" INTEGER NOT NULL DEFAULT 60,
    "slotHorizonDays" INTEGER NOT NULL DEFAULT 60,
    "confirmationSlaMin" INTEGER NOT NULL DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationCynologist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationAvailabilityRule" (
    "id" TEXT NOT NULL,
    "cynologistId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationDayOff" (
    "id" TEXT NOT NULL,
    "cynologistId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationDayOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationSlotException" (
    "id" TEXT NOT NULL,
    "cynologistId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationSlotException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationSlot" (
    "id" TEXT NOT NULL,
    "cynologistId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ConsultationSlotStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationBooking" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "cynologistId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "clientOwnerName" TEXT,
    "clientPhone" TEXT,
    "petName" TEXT,
    "petGender" "ConsultationPetGender",
    "petAge" TEXT,
    "petBreed" TEXT,
    "clientProblem" TEXT,
    "clientSelfHelpAttempt" TEXT,
    "status" "ConsultationBookingStatus" NOT NULL DEFAULT 'PENDING_TRAINER_CONFIRMATION',
    "completedAt" TIMESTAMP(3),
    "trainerConfirmedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "confirmationDeadlineAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationEmailLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "ConsultationEmailType" NOT NULL,
    "status" "ConsultationEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationBookingIdempotency" (
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bookingId" TEXT,
    "responseJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationBookingIdempotency_pkey" PRIMARY KEY ("clientId","key")
);

-- CreateTable
CREATE TABLE "CynologistChat" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "streamChannelId" TEXT NOT NULL,
    "intake" JSONB NOT NULL,
    "provisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "firstMessageId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "lastClientMessageAt" TIMESTAMP(3),
    "trainerReadAt" TIMESTAMP(3),
    "unreadSince" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CynologistChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSendOperation" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "streamMessageId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSendOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "chatId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatWebhookEvent" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatNotification" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityChatSendOperation" (
    "id" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "streamMessageId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChatSendOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityChatAttachment" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscriptionFinanceRefund" (
    "id" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSubscriptionFinanceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitVideoExpense" (
    "id" TEXT NOT NULL,
    "requestKey" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "partnerId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceKopecks" INTEGER NOT NULL DEFAULT 50000,
    "amountKopecks" INTEGER NOT NULL,
    "comment" VARCHAR(512),
    "actorId" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitVideoExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitVideoExpenseRevision" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitVideoExpenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "activityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "bestAnswerId" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionHeart" (
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionHeart_pkey" PRIMARY KEY ("answerId","userId")
);

-- CreateTable
CREATE TABLE "QuestionView" (
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionView_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "QuestionPhoto" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "questionId" TEXT,
    "answerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerId" TEXT,
    "targetKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBlock" (
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBlock_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GalleryAlbum" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "coverPhotoId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "caption" VARCHAR(2000),
    "status" "GalleryPhotoStatus" NOT NULL DEFAULT 'pending',
    "thumbKey" TEXT,
    "fullKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(36) NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "retryOfId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "filename" VARCHAR(255) NOT NULL,
    "declaredMime" VARCHAR(64) NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceETag" TEXT,
    "status" "GalleryUploadStatus" NOT NULL DEFAULT 'reserved',
    "postExpiresAt" TIMESTAMP(3) NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stagedThumbKey" TEXT,
    "stagedFullKey" TEXT,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryStorageJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "photoId" TEXT,
    "uploadId" TEXT,
    "destinationAlbumId" TEXT,
    "kind" "GalleryStorageJobKind" NOT NULL,
    "status" "GalleryStorageJobStatus" NOT NULL DEFAULT 'pending',
    "sourceKeys" TEXT[],
    "sourceETags" TEXT[],
    "targetKeys" TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryStorageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPost" (
    "moderationState" VARCHAR(16) NOT NULL DEFAULT 'visible',
    "moderationReason" VARCHAR(1000),
    "moderatedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "FeedPostStatus" NOT NULL DEFAULT 'draft',
    "clientRequestId" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "activeRevisionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "FeedRevisionStatus" NOT NULL DEFAULT 'draft',
    "text" VARCHAR(5000) NOT NULL DEFAULT '',
    "clientRequestId" VARCHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedMediaAsset" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "FeedMediaKind" NOT NULL,
    "status" "FeedMediaStatus" NOT NULL DEFAULT 'reserved',
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "smallKey" TEXT,
    "thumbKey" TEXT,
    "fullKey" TEXT,
    "posterKey" TEXT,
    "mp4Keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedRevisionAttachment" (
    "revisionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FeedRevisionAttachment_pkey" PRIMARY KEY ("revisionId","mediaId")
);

-- CreateTable
CREATE TABLE "FeedPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "explanation" VARCHAR(2000),
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "isQuiz" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "hideResults" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "imageMediaId" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeedPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPollVote" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "FeedPollVoteSelection" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "FeedPollVoteSelection_pkey" PRIMARY KEY ("pollId","userId","optionId")
);

-- CreateTable
CREATE TABLE "FeedUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(64) NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "declaredMime" VARCHAR(64) NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "purpose" VARCHAR(16) NOT NULL DEFAULT 'post',
    "sourceKey" TEXT NOT NULL,
    "sourceETag" TEXT,
    "status" "FeedMediaStatus" NOT NULL DEFAULT 'reserved',
    "postExpiresAt" TIMESTAMP(3) NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedStorageJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT,
    "uploadId" TEXT,
    "mediaId" TEXT,
    "kind" "FeedJobKind" NOT NULL,
    "status" "FeedJobStatus" NOT NULL DEFAULT 'pending',
    "sourceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedStorageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedComment" (
    "moderationState" VARCHAR(16) NOT NULL DEFAULT 'visible',
    "moderationReason" VARCHAR(1000),
    "moderatedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "rootId" TEXT,
    "replyToId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "clientRequestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedCommentMedia" (
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FeedCommentMedia_pkey" PRIMARY KEY ("commentId","mediaId")
);

-- CreateTable
CREATE TABLE "FeedPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostView" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostView_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "FeedPersonalizationPreference" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "useCity" BOOLEAN NOT NULL DEFAULT true,
    "usePets" BOOLEAN NOT NULL DEFAULT true,
    "useBehavior" BOOLEAN NOT NULL DEFAULT true,
    "exploration" BOOLEAN NOT NULL DEFAULT true,
    "historyResetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPersonalizationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FeedImpression" (
    "id" TEXT NOT NULL,
    "eventId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "rankingSessionId" VARCHAR(64) NOT NULL,
    "algorithmVersion" VARCHAR(64) NOT NULL,
    "rank" INTEGER NOT NULL,
    "visibleMs" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "candidateSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelVersion" VARCHAR(64),
    "experimentVariant" VARCHAR(16),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedImpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedRankingEvent" (
    "eventId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "rankingSessionId" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedRankingEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "FeedPostStats" (
    "postId" TEXT NOT NULL,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueCommenterCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedImpressionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostStats_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "FeedUserAuthorAffinity" (
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedViewCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedUserAuthorAffinity_pkey" PRIMARY KEY ("userId","authorId")
);

-- CreateTable
CREATE TABLE "FeedUserPostFeedback" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedUserPostFeedback_pkey" PRIMARY KEY ("userId","postId","kind")
);

-- CreateTable
CREATE TABLE "FeedSmartRankerModel" (
    "id" TEXT NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "artifact" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "trainRows" INTEGER NOT NULL,
    "validationRows" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSmartRankerModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT,
    "kind" "FeedNotificationKind" NOT NULL,
    "groupKey" VARCHAR(255),
    "actorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reaction" "FeedReactionKind",
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedNotificationOutbox" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FeedJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "attemptToken" TEXT,
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedNotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedBookmark" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedBookmark_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "FeedAuthorPreference" (
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedAuthorPreference_pkey" PRIMARY KEY ("userId","authorId")
);

-- CreateTable
CREATE TABLE "FeedReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "snapshotText" VARCHAR(5000) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "comment" VARCHAR(1000) NOT NULL DEFAULT '',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "resolution" VARCHAR(16),
    "resolutionReason" VARCHAR(1000),
    "moderatorId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedModerationAction" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalMailAttempt" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionalMailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalMailOutbox" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ciphertext" TEXT,
    "nonce" TEXT,
    "authTag" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionalMailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalMailEvent" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,

    CONSTRAINT "TransactionalMailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseContentRevision" (
    "id" INTEGER NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "CourseContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineMutationReceipt" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "resourceKey" VARCHAR(256) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
    "revision" BIGINT,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "OfflineMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineResourceRevision" (
    "ownerId" TEXT NOT NULL,
    "resourceKey" VARCHAR(256) NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "videoLastPositionSec" INTEGER,
    "videoRecordedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OfflineResourceRevision_pkey" PRIMARY KEY ("ownerId","resourceKey")
);

-- CreateTable
CREATE TABLE "OfflinePreventionClientBinding" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "receiptId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflinePreventionClientBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineMutationEffect" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineMutationEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetCreateReceipt" (
    "ownerId" TEXT NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "petId" TEXT NOT NULL,
    "responseStatus" SMALLINT NOT NULL DEFAULT 201,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetCreateReceipt_ownerId_clientRequestId_key" PRIMARY KEY ("ownerId","clientRequestId")
);

-- CreateTable
CREATE TABLE "PetMediaDeletionIntent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "dedupeKey" CHAR(64) NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "locator" TEXT NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetMediaDeletionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2Conversation" (
    "id" TEXT NOT NULL,
    "kind" "Chat2Kind" NOT NULL,
    "visibility" "Chat2Visibility" NOT NULL DEFAULT 'PRIVATE',
    "name" VARCHAR(120),
    "description" VARCHAR(2000),
    "avatarMediaId" TEXT,
    "directKey" TEXT,
    "scopeKey" TEXT,
    "createdById" TEXT,
    "nextSequence" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat2Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2Member" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
    "mutedUntil" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "Chat2Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientMessageId" VARCHAR(64) NOT NULL,
    "text" VARCHAR(8000) NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chat2Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2MessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2MessageReaction_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "Chat2Media" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "mime" VARCHAR(128) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2MediaDeletionIntent" (
    "objectKey" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2MediaDeletionIntent_pkey" PRIMARY KEY ("objectKey")
);

-- CreateTable
CREATE TABLE "Chat2Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "comment" VARCHAR(500) NOT NULL DEFAULT '',
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat2Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2Topic" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "Chat2OutboxEvent" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "eventType" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),

    CONSTRAINT "Chat2OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat2PushReceipt" (
    "messageId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chat2PushReceipt_pkey" PRIMARY KEY ("messageId","recipientId")
);

-- CreateTable
CREATE TABLE "Chat2V2MediaTask" (
    "mediaId" UUID NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceMime" VARCHAR(100) NOT NULL,
    "sourceBytes" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "attemptToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifest" JSONB,
    "errorCode" VARCHAR(64),
    "cleanupKind" VARCHAR(10),
    "cleanupToken" UUID,
    "cleanupLeaseUntil" TIMESTAMP(3),
    "cleanupNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "cleanupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat2V2MediaTask_pkey" PRIMARY KEY ("mediaId")
);

-- CreateTable
CREATE TABLE "QuestionV2MediaTask" (
    "mediaId" UUID NOT NULL,
    "photoId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceMime" VARCHAR(64) NOT NULL,
    "sourceBytes" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "attemptToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifest" JSONB,
    "errorCode" VARCHAR(64),
    "cleanupKind" VARCHAR(10),
    "cleanupToken" UUID,
    "cleanupLeaseUntil" TIMESTAMP(3),
    "cleanupNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "cleanupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionV2MediaTask_pkey" PRIMARY KEY ("mediaId")
);

-- CreateIndex
CREATE INDEX "MediaCdnPurge_status_availableAt_idx" ON "MediaCdnPurge"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AccountStorageCleanup_status_availableAt_idx" ON "AccountStorageCleanup"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountStorageCleanup_ownerId_scope_key" ON "AccountStorageCleanup"("ownerId", "scope");

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
CREATE INDEX "DayOnCourse_dayId_idx" ON "DayOnCourse"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "DayOnCourse_courseId_order_key" ON "DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE INDEX "DiaryEntry_userId_idx" ON "DiaryEntry"("userId");

-- CreateIndex
CREATE INDEX "DiaryEntry_dayId_idx" ON "DiaryEntry"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_userId_dayId_key" ON "DiaryEntry"("userId", "dayId");

-- CreateIndex
CREATE INDEX "StepOnDay_dayId_order_idx" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StepOnDay_dayId_order_key" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE INDEX "DailyCourseBundle_authorId_idx" ON "DailyCourseBundle"("authorId");

-- CreateIndex
CREATE INDEX "DailyCourseBundle_updatedAt_idx" ON "DailyCourseBundle"("updatedAt");

-- CreateIndex
CREATE INDEX "DailyCourseBundleStep_bundleId_order_idx" ON "DailyCourseBundleStep"("bundleId", "order");

-- CreateIndex
CREATE INDEX "DailyCourseBundleStep_stepId_idx" ON "DailyCourseBundleStep"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseBundleStep_bundleId_order_key" ON "DailyCourseBundleStep"("bundleId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "UserTraining_userId_dayOnCourseId_key" ON "UserTraining"("userId", "dayOnCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStep_userTrainingId_stepOnDayId_key" ON "UserStep"("userTrainingId", "stepOnDayId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseSchedule_date_key" ON "DailyCourseSchedule"("date");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_date_idx" ON "DailyCourseSchedule"("date");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_bundleId_idx" ON "DailyCourseSchedule"("bundleId");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_createdById_idx" ON "DailyCourseSchedule"("createdById");

-- CreateIndex
CREATE INDEX "DailyCourseUserTraining_scheduleId_idx" ON "DailyCourseUserTraining"("scheduleId");

-- CreateIndex
CREATE INDEX "DailyCourseUserTraining_userId_idx" ON "DailyCourseUserTraining"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseUserTraining_userId_scheduleId_key" ON "DailyCourseUserTraining"("userId", "scheduleId");

-- CreateIndex
CREATE INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_idx" ON "DailyCourseUserStep"("dailyCourseUserTrainingId");

-- CreateIndex
CREATE INDEX "DailyCourseUserStep_bundleStepId_idx" ON "DailyCourseUserStep"("bundleStepId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_bundleStepId_key" ON "DailyCourseUserStep"("dailyCourseUserTrainingId", "bundleStepId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleAppAccountToken_key" ON "User"("appleAppAccountToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_savedRegistrationPromoCodeId_idx" ON "User"("savedRegistrationPromoCodeId");

-- CreateIndex
CREATE INDEX "MobileIntroInstallation_openedAt_idx" ON "MobileIntroInstallation"("openedAt");

-- CreateIndex
CREATE INDEX "MobileIntroInstallation_authOutcomeUserId_idx" ON "MobileIntroInstallation"("authOutcomeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileIntroInstallation_installationId_introVersion_key" ON "MobileIntroInstallation"("installationId", "introVersion");

-- CreateIndex
CREATE INDEX "ConsentLog_userId_idx" ON "ConsentLog"("userId");

-- CreateIndex
CREATE INDEX "ConsentLog_createdAt_idx" ON "ConsentLog"("createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_status_idx" ON "ConsentLog"("status");

-- CreateIndex
CREATE INDEX "ConsentLog_tempSessionId_idx" ON "ConsentLog"("tempSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentLog_tempSessionId_consentType_key" ON "ConsentLog"("tempSessionId", "consentType");

-- CreateIndex
CREATE INDEX "idx_trainer_videos_trainer" ON "TrainerVideo"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerVideo_transcodingStatus_idx" ON "TrainerVideo"("transcodingStatus");

-- CreateIndex
CREATE INDEX "UserVideoProgress_userId_idx" ON "UserVideoProgress"("userId");

-- CreateIndex
CREATE INDEX "UserVideoProgress_videoId_idx" ON "UserVideoProgress"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideoProgress_userId_videoId_key" ON "UserVideoProgress"("userId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_cityKey_idx" ON "UserProfile"("cityKey");

-- CreateIndex
CREATE INDEX "Diploma_userId_idx" ON "Diploma"("userId");

-- CreateIndex
CREATE INDEX "Pet_breedKey_idx" ON "Pet"("breedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Pet_id_ownerId_key" ON "Pet"("id", "ownerId");

-- CreateIndex
CREATE INDEX "PetVetVisit_petId_visitedOn_createdAt_idx" ON "PetVetVisit"("petId", "visitedOn", "createdAt");

-- CreateIndex
CREATE INDEX "PetVetVisit_ownerId_idx" ON "PetVetVisit"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "PetVetAttachment_originalKey_key" ON "PetVetAttachment"("originalKey");

-- CreateIndex
CREATE UNIQUE INDEX "PetVetAttachment_previewKey_key" ON "PetVetAttachment"("previewKey");

-- CreateIndex
CREATE INDEX "PetVetAttachment_visitId_createdAt_idx" ON "PetVetAttachment"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "PetWeightEntry_petId_measuredAt_idx" ON "PetWeightEntry"("petId", "measuredAt");

-- CreateIndex
CREATE INDEX "PetWeightEntry_ownerId_idx" ON "PetWeightEntry"("ownerId");

-- CreateIndex
CREATE INDEX "PetDocument_petId_createdAt_idx" ON "PetDocument"("petId", "createdAt");

-- CreateIndex
CREATE INDEX "PetDocument_ownerId_idx" ON "PetDocument"("ownerId");

-- CreateIndex
CREATE INDEX "Award_petId_idx" ON "Award"("petId");

-- CreateIndex
CREATE INDEX "Award_courseId_idx" ON "Award"("courseId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_petId_idx" ON "PetPreventionEntry"("petId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_ownerId_idx" ON "PetPreventionEntry"("ownerId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_petId_type_performedAt_idx" ON "PetPreventionEntry"("petId", "type", "performedAt");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_reminderEnabled_remindAt_idx" ON "PetPreventionEntry"("reminderEnabled", "remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetPreventionEntry_petId_clientId_key" ON "PetPreventionEntry"("petId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAccess_trainingId_userId_key" ON "TrainingAccess"("trainingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_courseId_userId_key" ON "CourseAccess"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionSettings_weeklyAppleProductId_key" ON "AppSubscriptionSettings"("weeklyAppleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionSettings_monthlyAppleProductId_key" ON "AppSubscriptionSettings"("monthlyAppleProductId");

-- CreateIndex
CREATE INDEX "GafusWallet_updatedAt_idx" ON "GafusWallet"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GafusTransaction_idempotencyKey_key" ON "GafusTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GafusTransaction_userId_createdAt_id_idx" ON "GafusTransaction"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "GafusTransaction_userId_kind_createdAt_idx" ON "GafusTransaction"("userId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GafusTransaction_sourceEntityType_sourceEntityId_idx" ON "GafusTransaction"("sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "GafusTransaction_targetType_targetKey_idx" ON "GafusTransaction"("targetType", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "GafusRewardEvent_eventKey_key" ON "GafusRewardEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "GafusRewardEvent_transactionId_key" ON "GafusRewardEvent"("transactionId");

-- CreateIndex
CREATE INDEX "GafusRewardEvent_userId_rewardClass_decision_occurredAt_idx" ON "GafusRewardEvent"("userId", "rewardClass", "decision", "occurredAt");

-- CreateIndex
CREATE INDEX "GafusRewardEvent_userId_occurredAt_idx" ON "GafusRewardEvent"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "GafusRewardEvent_rewardKind_occurredAt_idx" ON "GafusRewardEvent"("rewardKind", "occurredAt");

-- CreateIndex
CREATE INDEX "GafusPostReactionProgram_enabledAt_idx" ON "GafusPostReactionProgram"("enabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "GafusPostReactionMilestone_rewardEventId_key" ON "GafusPostReactionMilestone"("rewardEventId");

-- CreateIndex
CREATE INDEX "GafusPostReactionMilestone_postId_createdAt_idx" ON "GafusPostReactionMilestone"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GafusPostReactionMilestone_postId_threshold_key" ON "GafusPostReactionMilestone"("postId", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "GafusTargetAccess_transactionId_key" ON "GafusTargetAccess"("transactionId");

-- CreateIndex
CREATE INDEX "GafusTargetAccess_userId_targetType_targetKey_expiresAt_idx" ON "GafusTargetAccess"("userId", "targetType", "targetKey", "expiresAt");

-- CreateIndex
CREATE INDEX "GafusTargetAccess_userId_expiresAt_idx" ON "GafusTargetAccess"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "GafusTargetAccess_expiresAt_idx" ON "GafusTargetAccess"("expiresAt");

-- CreateIndex
CREATE INDEX "GafusAdminAudit_actorId_createdAt_idx" ON "GafusAdminAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "GafusAdminAudit_targetUserId_createdAt_idx" ON "GafusAdminAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GafusAdminAudit_action_createdAt_idx" ON "GafusAdminAudit"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GafusNotificationOutbox_rewardEventId_key" ON "GafusNotificationOutbox"("rewardEventId");

-- CreateIndex
CREATE UNIQUE INDEX "GafusNotificationOutbox_attemptToken_key" ON "GafusNotificationOutbox"("attemptToken");

-- CreateIndex
CREATE INDEX "GafusNotificationOutbox_status_availableAt_leaseUntil_idx" ON "GafusNotificationOutbox"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "GafusNotificationOutbox_userId_createdAt_idx" ON "GafusNotificationOutbox"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GafusFraudSignal_status_severity_createdAt_idx" ON "GafusFraudSignal"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "GafusFraudSignal_userId_createdAt_idx" ON "GafusFraudSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GafusFraudSignal_kind_createdAt_idx" ON "GafusFraudSignal"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardedAdSession_requestNonceHash_key" ON "RewardedAdSession"("requestNonceHash");

-- CreateIndex
CREATE INDEX "RewardedAdSession_userId_createdAt_idx" ON "RewardedAdSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_userId_rewardedAt_idx" ON "RewardedAdSession"("userId", "rewardedAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_userId_status_expiresAt_idx" ON "RewardedAdSession"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_platform_status_createdAt_idx" ON "RewardedAdSession"("platform", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_createdAt_idx" ON "RewardedAdSession"("createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_rewardedAt_idx" ON "RewardedAdSession"("rewardedAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_grantedAt_idx" ON "RewardedAdSession"("grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardedTargetAccess_sessionId_key" ON "RewardedTargetAccess"("sessionId");

-- CreateIndex
CREATE INDEX "RewardedTargetAccess_userId_targetType_targetId_expiresAt_idx" ON "RewardedTargetAccess"("userId", "targetType", "targetId", "expiresAt");

-- CreateIndex
CREATE INDEX "RewardedTargetAccess_expiresAt_idx" ON "RewardedTargetAccess"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardedCreditTransaction_idempotencyKey_key" ON "RewardedCreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_createdAt_idx" ON "RewardedCreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_type_createdAt_idx" ON "RewardedCreditTransaction"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_targetType_targetId_idx" ON "RewardedCreditTransaction"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_sessionId_idx" ON "RewardedCreditTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "RewardedAdEvent_sessionId_createdAt_idx" ON "RewardedAdEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdEvent_eventType_createdAt_idx" ON "RewardedAdEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdEvent_createdAt_idx" ON "RewardedAdEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_yookassaPaymentMethodId_key" ON "AppSubscription"("yookassaPaymentMethodId");

-- CreateIndex
CREATE INDEX "AppSubscription_userId_status_currentPeriodEnd_idx" ON "AppSubscription"("userId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "AppSubscription_provider_status_currentPeriodEnd_idx" ON "AppSubscription"("provider", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "AppSubscription_provider_status_pendingExpiresAt_idx" ON "AppSubscription"("provider", "status", "pendingExpiresAt");

-- CreateIndex
CREATE INDEX "AppSubscription_provider_status_cancelAtPeriodEnd_currentPe_idx" ON "AppSubscription"("provider", "status", "cancelAtPeriodEnd", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "AppSubscription_planCode_idx" ON "AppSubscription"("planCode");

-- CreateIndex
CREATE INDEX "AppSubscription_appleOriginalTransactionId_idx" ON "AppSubscription"("appleOriginalTransactionId");

-- CreateIndex
CREATE INDEX "AppSubscriptionTrial_provider_startedAt_idx" ON "AppSubscriptionTrial"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionTrial_provider_paymentMethodFingerprintHash_idx" ON "AppSubscriptionTrial"("provider", "paymentMethodFingerprintHash");

-- CreateIndex
CREATE INDEX "AppSubscriptionTrial_subscriptionId_idx" ON "AppSubscriptionTrial"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionTrial_userId_provider_key" ON "AppSubscriptionTrial"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionPayment_idempotenceKey_key" ON "AppSubscriptionPayment"("idempotenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionPayment_yookassaPaymentId_key" ON "AppSubscriptionPayment"("yookassaPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionPayment_appleTransactionId_key" ON "AppSubscriptionPayment"("appleTransactionId");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_userId_provider_status_idx" ON "AppSubscriptionPayment"("userId", "provider", "status");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_provider_status_nextAttemptAt_idx" ON "AppSubscriptionPayment"("provider", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_planCode_idx" ON "AppSubscriptionPayment"("planCode");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_appleOriginalTransactionId_idx" ON "AppSubscriptionPayment"("appleOriginalTransactionId");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_promoCodeId_idx" ON "AppSubscriptionPayment"("promoCodeId");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_provider_providerCapturedAt_idx" ON "AppSubscriptionPayment"("provider", "providerCapturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_referralCode_key" ON "PartnerProfile"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_promoCodeId_key" ON "PartnerProfile"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReferral_buyerId_key" ON "PartnerReferral"("buyerId");

-- CreateIndex
CREATE INDEX "PartnerReferral_partnerId_createdAt_idx" ON "PartnerReferral"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCommission_partnerId_createdAt_idx" ON "PartnerCommission"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommission_paymentId_kind_key" ON "PartnerCommission"("paymentId", "kind");

-- CreateIndex
CREATE INDEX "PartnerPayout_partnerId_status_requestedAt_idx" ON "PartnerPayout"("partnerId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VkIdOneTimeLogin_tokenHash_key" ON "VkIdOneTimeLogin"("tokenHash");

-- CreateIndex
CREATE INDEX "VkIdOneTimeLogin_userId_expiresAt_idx" ON "VkIdOneTimeLogin"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "VkIdOneTimeLogin_expiresAt_idx" ON "VkIdOneTimeLogin"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationEmailAttempt_tempSessionId_key" ON "RegistrationEmailAttempt"("tempSessionId");

-- CreateIndex
CREATE INDEX "RegistrationEmailAttempt_dataFingerprint_idx" ON "RegistrationEmailAttempt"("dataFingerprint");

-- CreateIndex
CREATE INDEX "RegistrationEmailAttempt_userId_idx" ON "RegistrationEmailAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VkRegistrationContext_contextTokenHash_key" ON "VkRegistrationContext"("contextTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "VkRegistrationContext_stateHash_key" ON "VkRegistrationContext"("stateHash");

-- CreateIndex
CREATE INDEX "VkRegistrationContext_expiresAt_idx" ON "VkRegistrationContext"("expiresAt");

-- CreateIndex
CREATE INDEX "VkRegistrationContext_userId_expiresAt_idx" ON "VkRegistrationContext"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "VkRegistrationContext_resultUserId_idx" ON "VkRegistrationContext"("resultUserId");

-- CreateIndex
CREATE INDEX "VkRegistrationContext_completionFingerprint_idx" ON "VkRegistrationContext"("completionFingerprint");

-- CreateIndex
CREATE INDEX "VkRegistrationContext_selectedPromoCodeId_idx" ON "VkRegistrationContext"("selectedPromoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "VkLoginGrant_tokenHash_key" ON "VkLoginGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "VkLoginGrant_userId_expiresAt_idx" ON "VkLoginGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "VkLoginGrant_expiresAt_idx" ON "VkLoginGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "VkLoginGrant_reissuedFromId_idx" ON "VkLoginGrant"("reissuedFromId");

-- CreateIndex
CREATE INDEX "VkLoginGrant_registrationContextId_idx" ON "VkLoginGrant"("registrationContextId");

-- CreateIndex
CREATE UNIQUE INDEX "NpdReceipt_paymentId_key" ON "NpdReceipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "NpdReceipt_providerReceiptId_key" ON "NpdReceipt"("providerReceiptId");

-- CreateIndex
CREATE INDEX "NpdReceipt_connectionId_status_createdAt_idx" ON "NpdReceipt"("connectionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NpdReceipt_status_createdAt_idx" ON "NpdReceipt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NpdReceiptOperation_status_nextAttemptAt_leaseExpiresAt_idx" ON "NpdReceiptOperation"("status", "nextAttemptAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "NpdReceiptOperation_receiptId_status_idx" ON "NpdReceiptOperation"("receiptId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NpdReceiptOperation_receiptId_type_key" ON "NpdReceiptOperation"("receiptId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NpdReceiptEmailDelivery_receiptId_key" ON "NpdReceiptEmailDelivery"("receiptId");

-- CreateIndex
CREATE INDEX "NpdReceiptEmailDelivery_status_nextAttemptAt_leaseExpiresAt_idx" ON "NpdReceiptEmailDelivery"("status", "nextAttemptAt", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionPromoCode_normalizedCode_key" ON "AppSubscriptionPromoCode"("normalizedCode");

-- CreateIndex
CREATE INDEX "AppSubscriptionPromoCode_isActive_archivedAt_idx" ON "AppSubscriptionPromoCode"("isActive", "archivedAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionPromoCode_createdAt_idx" ON "AppSubscriptionPromoCode"("createdAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionPromoCodeEvent_promoCodeId_createdAt_idx" ON "AppSubscriptionPromoCodeEvent"("promoCodeId", "createdAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionPromoCodeEvent_actorId_idx" ON "AppSubscriptionPromoCodeEvent"("actorId");

-- CreateIndex
CREATE INDEX "AppSubscriptionEvent_source_eventType_createdAt_idx" ON "AppSubscriptionEvent"("source", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionEvent_processingStatus_createdAt_idx" ON "AppSubscriptionEvent"("processingStatus", "createdAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionEvent_userId_createdAt_idx" ON "AppSubscriptionEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionEvent_providerEventKey_key" ON "AppSubscriptionEvent"("providerEventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionEvent_idempotencyKey_key" ON "AppSubscriptionEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "idx_rating_course_user" ON "CourseReview"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_userId_courseId_key" ON "CourseReview"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_shortCode_key" ON "PasswordResetToken"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionToken_shortCode_key" ON "AccountDeletionToken"("shortCode");

-- CreateIndex
CREATE INDEX "AccountDeletionToken_userId_idx" ON "AccountDeletionToken"("userId");

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_deletedAt_idx" ON "AccountDeletionAudit"("deletedAt");

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_userId_idx" ON "AccountDeletionAudit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeToken_token_key" ON "EmailChangeToken"("token");

-- CreateIndex
CREATE INDEX "EmailChangeToken_userId_idx" ON "EmailChangeToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_userId_idx" ON "StepNotification"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_day_stepIndex_idx" ON "StepNotification"("day", "stepIndex");

-- CreateIndex
CREATE INDEX "StepNotification_bound_occurrence_idx" ON "StepNotification"("userId", "dayOnCourseId", "stepOnDayId");

-- CreateIndex
CREATE INDEX "StepNotification_type_idx" ON "StepNotification"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ExamResult_userStepId_key" ON "ExamResult"("userStepId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamResult_dailyCourseUserStepId_key" ON "ExamResult"("dailyCourseUserStepId");

-- CreateIndex
CREATE INDEX "ExamResult_userStepId_idx" ON "ExamResult"("userStepId");

-- CreateIndex
CREATE INDEX "ExamResult_dailyCourseUserStepId_idx" ON "ExamResult"("dailyCourseUserStepId");

-- CreateIndex
CREATE INDEX "ExamResult_stepId_idx" ON "ExamResult"("stepId");

-- CreateIndex
CREATE INDEX "ExamResult_videoDeletedAt_idx" ON "ExamResult"("videoDeletedAt");

-- CreateIndex
CREATE INDEX "ExamResult_reviewedById_idx" ON "ExamResult"("reviewedById");

-- CreateIndex
CREATE INDEX "ExamResult_reviewedAt_idx" ON "ExamResult"("reviewedAt");

-- CreateIndex
CREATE INDEX "SurveyResponse_userId_courseId_surveyFamilySlug_idx" ON "SurveyResponse"("userId", "courseId", "surveyFamilySlug");

-- CreateIndex
CREATE INDEX "SurveyResponse_stepId_idx" ON "SurveyResponse"("stepId");

-- CreateIndex
CREATE INDEX "SurveyResponse_petId_idx" ON "SurveyResponse"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_userId_stepId_key" ON "SurveyResponse"("userId", "stepId");

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
CREATE INDEX "ReminderMutationReceipt_ownerUserId_expiresAt_idx" ON "ReminderMutationReceipt"("ownerUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "Reminder_userId_type_idx" ON "Reminder"("userId", "type");

-- CreateIndex
CREATE INDEX "Reminder_enabled_idx" ON "Reminder"("enabled");

-- CreateIndex
CREATE INDEX "Reminder_type_idx" ON "Reminder"("type");

-- CreateIndex
CREATE INDEX "Reminder_reminderTime_idx" ON "Reminder"("reminderTime");

-- CreateIndex
CREATE INDEX "TrainingReminderDelivery_status_leaseExpiresAt_idx" ON "TrainingReminderDelivery"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingReminderDelivery_reminderId_localDate_key" ON "TrainingReminderDelivery"("reminderId", "localDate");

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

-- CreateIndex
CREATE INDEX "TrainerAIChat_trainerId_createdAt_idx" ON "TrainerAIChat"("trainerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TrainerAIChat_trainerId_idx" ON "TrainerAIChat"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAIConfig_trainerId_key" ON "TrainerAIConfig"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerAIConfig_trainerId_idx" ON "TrainerAIConfig"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerNote_trainerId_createdAt_idx" ON "TrainerNote"("trainerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TrainerNoteEntry_noteId_order_idx" ON "TrainerNoteEntry"("noteId", "order");

-- CreateIndex
CREATE INDEX "TrainerNoteStudent_noteId_idx" ON "TrainerNoteStudent"("noteId");

-- CreateIndex
CREATE INDEX "TrainerNoteStudent_studentId_idx" ON "TrainerNoteStudent"("studentId");

-- CreateIndex
CREATE INDEX "TrainerNoteStudent_studentId_createdAt_idx" ON "TrainerNoteStudent"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerNoteStudent_noteId_studentId_key" ON "TrainerNoteStudent"("noteId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_authorId_idx" ON "Article"("authorId");

-- CreateIndex
CREATE INDEX "Article_createdAt_idx" ON "Article"("createdAt");

-- CreateIndex
CREATE INDEX "Article_visibility_idx" ON "Article"("visibility");

-- CreateIndex
CREATE INDEX "ArticleLike_articleId_idx" ON "ArticleLike"("articleId");

-- CreateIndex
CREATE INDEX "ArticleLike_userId_idx" ON "ArticleLike"("userId");

-- CreateIndex
CREATE INDEX "ArticleViewer_articleId_idx" ON "ArticleViewer"("articleId");

-- CreateIndex
CREATE INDEX "ArticleViewer_userId_idx" ON "ArticleViewer"("userId");

-- CreateIndex
CREATE INDEX "ArticleGuestView_articleId_idx" ON "ArticleGuestView"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationCynologist_userId_key" ON "ConsultationCynologist"("userId");

-- CreateIndex
CREATE INDEX "ConsultationCynologist_isListed_idx" ON "ConsultationCynologist"("isListed");

-- CreateIndex
CREATE INDEX "ConsultationAvailabilityRule_cynologistId_idx" ON "ConsultationAvailabilityRule"("cynologistId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationAvailabilityRule_cynologistId_weekday_key" ON "ConsultationAvailabilityRule"("cynologistId", "weekday");

-- CreateIndex
CREATE INDEX "ConsultationDayOff_cynologistId_idx" ON "ConsultationDayOff"("cynologistId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationDayOff_cynologistId_date_key" ON "ConsultationDayOff"("cynologistId", "date");

-- CreateIndex
CREATE INDEX "ConsultationSlotException_cynologistId_startAt_idx" ON "ConsultationSlotException"("cynologistId", "startAt");

-- CreateIndex
CREATE INDEX "ConsultationSlot_cynologistId_status_startAt_idx" ON "ConsultationSlot"("cynologistId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationSlot_cynologistId_startAt_key" ON "ConsultationSlot"("cynologistId", "startAt");

-- CreateIndex
CREATE INDEX "ConsultationBooking_slotId_idx" ON "ConsultationBooking"("slotId");

-- CreateIndex
CREATE INDEX "ConsultationBooking_cynologistId_status_idx" ON "ConsultationBooking"("cynologistId", "status");

-- CreateIndex
CREATE INDEX "ConsultationBooking_clientId_createdAt_idx" ON "ConsultationBooking"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultationBooking_clientId_status_completedAt_idx" ON "ConsultationBooking"("clientId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "ConsultationEmailLog_bookingId_type_idx" ON "ConsultationEmailLog"("bookingId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationEmailLog_bookingId_type_key" ON "ConsultationEmailLog"("bookingId", "type");

-- CreateIndex
CREATE INDEX "ConsultationBookingIdempotency_expiresAt_idx" ON "ConsultationBookingIdempotency"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CynologistChat_clientUserId_key" ON "CynologistChat"("clientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CynologistChat_streamChannelId_key" ON "CynologistChat"("streamChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "CynologistChat_firstMessageId_key" ON "CynologistChat"("firstMessageId");

-- CreateIndex
CREATE INDEX "CynologistChat_trainerUserId_lastMessageAt_idx" ON "CynologistChat"("trainerUserId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CynologistChat_nextReminderAt_idx" ON "CynologistChat"("nextReminderAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSendOperation_streamMessageId_key" ON "ChatSendOperation"("streamMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSendOperation_senderUserId_clientMessageId_key" ON "ChatSendOperation"("senderUserId", "clientMessageId");

-- CreateIndex
CREATE INDEX "ChatAttachment_state_createdAt_idx" ON "ChatAttachment"("state", "createdAt");

-- CreateIndex
CREATE INDEX "ChatWebhookEvent_processedAt_createdAt_idx" ON "ChatWebhookEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatNotification_notificationId_key" ON "ChatNotification"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityChatSendOperation_streamMessageId_key" ON "CommunityChatSendOperation"("streamMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityChatSendOperation_senderUserId_clientMessageId_key" ON "CommunityChatSendOperation"("senderUserId", "clientMessageId");

-- CreateIndex
CREATE INDEX "CommunityChatAttachment_state_createdAt_idx" ON "CommunityChatAttachment"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionFinanceRefund_providerRefundId_key" ON "AppSubscriptionFinanceRefund"("providerRefundId");

-- CreateIndex
CREATE INDEX "AppSubscriptionFinanceRefund_refundedAt_paymentId_idx" ON "AppSubscriptionFinanceRefund"("refundedAt", "paymentId");

-- CreateIndex
CREATE INDEX "AppSubscriptionFinanceRefund_paymentId_idx" ON "AppSubscriptionFinanceRefund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitVideoExpense_requestKey_key" ON "ProfitVideoExpense"("requestKey");

-- CreateIndex
CREATE INDEX "ProfitVideoExpense_paidAt_canceledAt_idx" ON "ProfitVideoExpense"("paidAt", "canceledAt");

-- CreateIndex
CREATE INDEX "ProfitVideoExpense_partnerId_paidAt_idx" ON "ProfitVideoExpense"("partnerId", "paidAt");

-- CreateIndex
CREATE INDEX "ProfitVideoExpenseRevision_expenseId_createdAt_idx" ON "ProfitVideoExpenseRevision"("expenseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_bestAnswerId_key" ON "Question"("bestAnswerId");

-- CreateIndex
CREATE INDEX "Question_createdAt_id_idx" ON "Question"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Question_activityAt_id_idx" ON "Question"("activityAt", "id");

-- CreateIndex
CREATE INDEX "Question_authorId_createdAt_idx" ON "Question"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_category_createdAt_idx" ON "Question"("category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_authorId_clientRequestId_key" ON "Question"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "QuestionAnswer_questionId_parentId_createdAt_idx" ON "QuestionAnswer"("questionId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAnswer_authorId_createdAt_idx" ON "QuestionAnswer"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAnswer_replyToId_idx" ON "QuestionAnswer"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswer_authorId_clientRequestId_key" ON "QuestionAnswer"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "QuestionHeart_userId_idx" ON "QuestionHeart"("userId");

-- CreateIndex
CREATE INDEX "QuestionView_userId_idx" ON "QuestionView"("userId");

-- CreateIndex
CREATE INDEX "QuestionPhoto_ownerId_createdAt_idx" ON "QuestionPhoto"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionPhoto_questionId_idx" ON "QuestionPhoto"("questionId");

-- CreateIndex
CREATE INDEX "QuestionPhoto_answerId_idx" ON "QuestionPhoto"("answerId");

-- CreateIndex
CREATE INDEX "QuestionReport_resolvedAt_createdAt_idx" ON "QuestionReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_idx" ON "QuestionReport"("questionId");

-- CreateIndex
CREATE INDEX "QuestionReport_answerId_idx" ON "QuestionReport"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReport_reporterId_targetKey_key" ON "QuestionReport"("reporterId", "targetKey");

-- CreateIndex
CREATE INDEX "GalleryAlbum_ownerId_deletedAt_createdAt_id_idx" ON "GalleryAlbum"("ownerId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "GalleryPhoto_ownerId_deletedAt_status_reservationExpiresAt_idx" ON "GalleryPhoto"("ownerId", "deletedAt", "status", "reservationExpiresAt");

-- CreateIndex
CREATE INDEX "GalleryPhoto_albumId_deletedAt_createdAt_id_idx" ON "GalleryPhoto"("albumId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_photoId_key" ON "GalleryUpload"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_retryOfId_key" ON "GalleryUpload"("retryOfId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_sourceKey_key" ON "GalleryUpload"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_attemptToken_key" ON "GalleryUpload"("attemptToken");

-- CreateIndex
CREATE INDEX "GalleryUpload_status_reservationExpiresAt_leaseUntil_idx" ON "GalleryUpload"("status", "reservationExpiresAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_ownerId_clientRequestId_key" ON "GalleryUpload"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryStorageJob_dedupeKey_key" ON "GalleryStorageJob"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryStorageJob_attemptToken_key" ON "GalleryStorageJob"("attemptToken");

-- CreateIndex
CREATE INDEX "GalleryStorageJob_status_availableAt_leaseUntil_idx" ON "GalleryStorageJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "GalleryStorageJob_ownerId_photoId_idx" ON "GalleryStorageJob"("ownerId", "photoId");

-- CreateIndex
CREATE INDEX "FeedPost_status_publishedAt_id_idx" ON "FeedPost"("status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedPost_authorId_status_publishedAt_id_idx" ON "FeedPost"("authorId", "status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedPost_authorId_deletedAt_updatedAt_idx" ON "FeedPost"("authorId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPost_authorId_clientRequestId_key" ON "FeedPost"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "FeedPostRevision_postId_status_createdAt_idx" ON "FeedPostRevision"("postId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostRevision_postId_revisionNumber_key" ON "FeedPostRevision"("postId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostRevision_postId_clientRequestId_key" ON "FeedPostRevision"("postId", "clientRequestId");

-- CreateIndex
CREATE INDEX "FeedMediaAsset_postId_status_idx" ON "FeedMediaAsset"("postId", "status");

-- CreateIndex
CREATE INDEX "FeedMediaAsset_ownerId_status_idx" ON "FeedMediaAsset"("ownerId", "status");

-- CreateIndex
CREATE INDEX "FeedRevisionAttachment_mediaId_idx" ON "FeedRevisionAttachment"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedRevisionAttachment_revisionId_position_key" ON "FeedRevisionAttachment"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPoll_postId_key" ON "FeedPoll"("postId");

-- CreateIndex
CREATE INDEX "FeedPollOption_imageMediaId_idx" ON "FeedPollOption"("imageMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPollOption_pollId_id_key" ON "FeedPollOption"("pollId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPollOption_pollId_position_key" ON "FeedPollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "FeedPollVote_userId_idx" ON "FeedPollVote"("userId");

-- CreateIndex
CREATE INDEX "FeedPollVoteSelection_pollId_optionId_idx" ON "FeedPollVoteSelection"("pollId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_mediaId_key" ON "FeedUpload"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_sourceKey_key" ON "FeedUpload"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_attemptToken_key" ON "FeedUpload"("attemptToken");

-- CreateIndex
CREATE INDEX "FeedUpload_status_reservationExpiresAt_leaseUntil_idx" ON "FeedUpload"("status", "reservationExpiresAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "FeedUpload_postId_status_idx" ON "FeedUpload"("postId", "status");

-- CreateIndex
CREATE INDEX "FeedUpload_purpose_createdAt_idx" ON "FeedUpload"("purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_ownerId_clientRequestId_key" ON "FeedUpload"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedStorageJob_dedupeKey_key" ON "FeedStorageJob"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeedStorageJob_attemptToken_key" ON "FeedStorageJob"("attemptToken");

-- CreateIndex
CREATE INDEX "FeedStorageJob_status_availableAt_leaseUntil_idx" ON "FeedStorageJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "FeedStorageJob_ownerId_postId_idx" ON "FeedStorageJob"("ownerId", "postId");

-- CreateIndex
CREATE INDEX "FeedComment_postId_rootId_createdAt_id_idx" ON "FeedComment"("postId", "rootId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FeedComment_replyToId_idx" ON "FeedComment"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedComment_authorId_clientRequestId_key" ON "FeedComment"("authorId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedCommentMedia_mediaId_key" ON "FeedCommentMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedCommentMedia_commentId_position_key" ON "FeedCommentMedia"("commentId", "position");

-- CreateIndex
CREATE INDEX "FeedPostReaction_postId_kind_createdAt_id_idx" ON "FeedPostReaction"("postId", "kind", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostReaction_postId_userId_key" ON "FeedPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "FeedCommentReaction_commentId_kind_createdAt_id_idx" ON "FeedCommentReaction"("commentId", "kind", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedCommentReaction_commentId_userId_key" ON "FeedCommentReaction"("commentId", "userId");

-- CreateIndex
CREATE INDEX "FeedPostView_postId_idx" ON "FeedPostView"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedImpression_eventId_key" ON "FeedImpression"("eventId");

-- CreateIndex
CREATE INDEX "FeedImpression_userId_occurredAt_idx" ON "FeedImpression"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "FeedImpression_postId_occurredAt_idx" ON "FeedImpression"("postId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "FeedImpression_rankingSessionId_idx" ON "FeedImpression"("rankingSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedImpression_userId_postId_rankingSessionId_key" ON "FeedImpression"("userId", "postId", "rankingSessionId");

-- CreateIndex
CREATE INDEX "FeedRankingEvent_userId_createdAt_idx" ON "FeedRankingEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FeedRankingEvent_postId_createdAt_idx" ON "FeedRankingEvent"("postId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FeedRankingEvent_rankingSessionId_idx" ON "FeedRankingEvent"("rankingSessionId");

-- CreateIndex
CREATE INDEX "FeedUserAuthorAffinity_userId_score_idx" ON "FeedUserAuthorAffinity"("userId", "score" DESC);

-- CreateIndex
CREATE INDEX "FeedUserPostFeedback_postId_idx" ON "FeedUserPostFeedback"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedSmartRankerModel_version_key" ON "FeedSmartRankerModel"("version");

-- CreateIndex
CREATE INDEX "FeedSmartRankerModel_active_trainedAt_idx" ON "FeedSmartRankerModel"("active", "trainedAt" DESC);

-- CreateIndex
CREATE INDEX "FeedNotification_recipientId_readAt_createdAt_id_idx" ON "FeedNotification"("recipientId", "readAt", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedNotification_groupKey_createdAt_idx" ON "FeedNotification"("groupKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedNotificationOutbox_attemptToken_key" ON "FeedNotificationOutbox"("attemptToken");

-- CreateIndex
CREATE INDEX "FeedNotificationOutbox_status_availableAt_leaseUntil_idx" ON "FeedNotificationOutbox"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "FeedNotificationOutbox_notificationId_key" ON "FeedNotificationOutbox"("notificationId");

-- CreateIndex
CREATE INDEX "FeedBookmark_userId_createdAt_postId_idx" ON "FeedBookmark"("userId", "createdAt" DESC, "postId" DESC);

-- CreateIndex
CREATE INDEX "FeedAuthorPreference_authorId_notify_hidden_idx" ON "FeedAuthorPreference"("authorId", "notify", "hidden");

-- CreateIndex
CREATE INDEX "FeedReport_status_createdAt_id_idx" ON "FeedReport"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedReport_authorId_idx" ON "FeedReport"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReport_reporterId_targetType_targetId_key" ON "FeedReport"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "FeedModerationAction_reportId_createdAt_idx" ON "FeedModerationAction"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalMailAttempt_providerMessageId_key" ON "TransactionalMailAttempt"("providerMessageId");

-- CreateIndex
CREATE INDEX "TransactionalMailAttempt_createdAt_idx" ON "TransactionalMailAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "TransactionalMailOutbox_status_nextAttemptAt_idx" ON "TransactionalMailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TransactionalMailOutbox_status_leaseExpiresAt_idx" ON "TransactionalMailOutbox"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "TransactionalMailOutbox_expiresAt_idx" ON "TransactionalMailOutbox"("expiresAt");

-- CreateIndex
CREATE INDEX "TransactionalMailEvent_providerMessageId_occurredAt_idx" ON "TransactionalMailEvent"("providerMessageId", "occurredAt");

-- CreateIndex
CREATE INDEX "OfflineMutationReceipt_ownerId_resourceKey_revision_idx" ON "OfflineMutationReceipt"("ownerId", "resourceKey", "revision");

-- CreateIndex
CREATE INDEX "OfflineMutationReceipt_expiresAt_idx" ON "OfflineMutationReceipt"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationReceipt_ownerId_eventId_key" ON "OfflineMutationReceipt"("ownerId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationReceipt_id_ownerId_key" ON "OfflineMutationReceipt"("id", "ownerId");

-- CreateIndex
CREATE INDEX "OfflinePreventionClientBinding_ownerId_petId_idx" ON "OfflinePreventionClientBinding"("ownerId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflinePreventionClientBinding_petId_clientId_key" ON "OfflinePreventionClientBinding"("petId", "clientId");

-- CreateIndex
CREATE INDEX "OfflineMutationEffect_status_availableAt_idx" ON "OfflineMutationEffect"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationEffect_ownerId_eventId_kind_key" ON "OfflineMutationEffect"("ownerId", "eventId", "kind");

-- CreateIndex
CREATE INDEX "PetMediaDeletionIntent_status_availableAt_idx" ON "PetMediaDeletionIntent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "PetMediaDeletionIntent_ownerId_petId_idx" ON "PetMediaDeletionIntent"("ownerId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "PetMediaDeletionIntent_ownerId_dedupeKey_key" ON "PetMediaDeletionIntent"("ownerId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Conversation_directKey_key" ON "Chat2Conversation"("directKey");

-- CreateIndex
CREATE INDEX "Chat2Conversation_kind_visibility_createdAt_idx" ON "Chat2Conversation"("kind", "visibility", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Conversation_kind_scopeKey_key" ON "Chat2Conversation"("kind", "scopeKey");

-- CreateIndex
CREATE INDEX "Chat2Member_userId_hiddenAt_idx" ON "Chat2Member"("userId", "hiddenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Member_conversationId_userId_key" ON "Chat2Member"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Chat2Message_conversationId_createdAt_idx" ON "Chat2Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Message_conversationId_sequence_key" ON "Chat2Message"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Message_conversationId_authorId_clientMessageId_key" ON "Chat2Message"("conversationId", "authorId", "clientMessageId");

-- CreateIndex
CREATE INDEX "Chat2MessageReaction_userId_idx" ON "Chat2MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Media_objectKey_key" ON "Chat2Media"("objectKey");

-- CreateIndex
CREATE INDEX "Chat2Media_ownerId_status_createdAt_idx" ON "Chat2Media"("ownerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Chat2Media_conversationId_messageId_idx" ON "Chat2Media"("conversationId", "messageId");

-- CreateIndex
CREATE INDEX "Chat2MediaDeletionIntent_status_availableAt_idx" ON "Chat2MediaDeletionIntent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "Chat2Report_conversationId_status_createdAt_idx" ON "Chat2Report"("conversationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2Report_reporterId_messageId_key" ON "Chat2Report"("reporterId", "messageId");

-- CreateIndex
CREATE INDEX "Chat2OutboxEvent_deliveredAt_nextAttemptAt_idx" ON "Chat2OutboxEvent"("deliveredAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2PushReceipt_notificationId_key" ON "Chat2PushReceipt"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat2V2MediaTask_sourceKey_key" ON "Chat2V2MediaTask"("sourceKey");

-- CreateIndex
CREATE INDEX "Chat2V2MediaTask_status_nextAttemptAt_createdAt_idx" ON "Chat2V2MediaTask"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "Chat2V2MediaTask_conversationId_ownerId_status_idx" ON "Chat2V2MediaTask"("conversationId", "ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionV2MediaTask_photoId_key" ON "QuestionV2MediaTask"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionV2MediaTask_sourceKey_key" ON "QuestionV2MediaTask"("sourceKey");

-- CreateIndex
CREATE INDEX "QuestionV2MediaTask_status_nextAttemptAt_createdAt_idx" ON "QuestionV2MediaTask"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionV2MediaTask_ownerId_status_idx" ON "QuestionV2MediaTask"("ownerId", "status");

-- CreateIndex
CREATE INDEX "QuestionV2MediaTask_cleanupKind_cleanupNextAt_idx" ON "QuestionV2MediaTask"("cleanupKind", "cleanupNextAt");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDay" ADD CONSTRAINT "TrainingDay_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StepCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseBundle" ADD CONSTRAINT "DailyCourseBundle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseBundleStep" ADD CONSTRAINT "DailyCourseBundleStep_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "DailyCourseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseBundleStep" ADD CONSTRAINT "DailyCourseBundleStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_stepOnDayId_fkey" FOREIGN KEY ("stepOnDayId") REFERENCES "StepOnDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_userTrainingId_fkey" FOREIGN KEY ("userTrainingId") REFERENCES "UserTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseSchedule" ADD CONSTRAINT "DailyCourseSchedule_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "DailyCourseBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseSchedule" ADD CONSTRAINT "DailyCourseSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseUserTraining" ADD CONSTRAINT "DailyCourseUserTraining_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DailyCourseSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseUserTraining" ADD CONSTRAINT "DailyCourseUserTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseUserStep" ADD CONSTRAINT "DailyCourseUserStep_dailyCourseUserTrainingId_fkey" FOREIGN KEY ("dailyCourseUserTrainingId") REFERENCES "DailyCourseUserTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseUserStep" ADD CONSTRAINT "DailyCourseUserStep_bundleStepId_fkey" FOREIGN KEY ("bundleStepId") REFERENCES "DailyCourseBundleStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_savedRegistrationPromoCodeId_fkey" FOREIGN KEY ("savedRegistrationPromoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileIntroInstallation" ADD CONSTRAINT "MobileIntroInstallation_authOutcomeUserId_fkey" FOREIGN KEY ("authOutcomeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerVideo" ADD CONSTRAINT "TrainerVideo_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideoProgress" ADD CONSTRAINT "UserVideoProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVideoProgress" ADD CONSTRAINT "UserVideoProgress_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "TrainerVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diploma" ADD CONSTRAINT "Diploma_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetVetVisit" ADD CONSTRAINT "PetVetVisit_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetVetAttachment" ADD CONSTRAINT "PetVetAttachment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "PetVetVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetWeightEntry" ADD CONSTRAINT "PetWeightEntry_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetDocument" ADD CONSTRAINT "PetDocument_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetDocument" ADD CONSTRAINT "PetDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetPreventionEntry" ADD CONSTRAINT "PetPreventionEntry_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetPreventionEntry" ADD CONSTRAINT "PetPreventionEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAccess" ADD CONSTRAINT "TrainingAccess_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAccess" ADD CONSTRAINT "TrainingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionSettings" ADD CONSTRAINT "AppSubscriptionSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusWallet" ADD CONSTRAINT "GafusWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_adminActorId_fkey" FOREIGN KEY ("adminActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "GafusTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusPostReactionMilestone" ADD CONSTRAINT "GafusPostReactionMilestone_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GafusPostReactionProgram"("postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "GafusTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusSettings" ADD CONSTRAINT "GafusSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusSettingsRevision" ADD CONSTRAINT "GafusSettingsRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GafusAdminAudit" ADD CONSTRAINT "GafusAdminAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedAdSettings" ADD CONSTRAINT "RewardedAdSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedAdSession" ADD CONSTRAINT "RewardedAdSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedAdEvent" ADD CONSTRAINT "RewardedAdEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscription" ADD CONSTRAINT "AppSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscription" ADD CONSTRAINT "AppSubscription_manualGrantedById_fkey" FOREIGN KEY ("manualGrantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionTrial" ADD CONSTRAINT "AppSubscriptionTrial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionTrial" ADD CONSTRAINT "AppSubscriptionTrial_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkIdOneTimeLogin" ADD CONSTRAINT "VkIdOneTimeLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationEmailAttempt" ADD CONSTRAINT "RegistrationEmailAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_selectedPromoCodeId_fkey" FOREIGN KEY ("selectedPromoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_resultUserId_fkey" FOREIGN KEY ("resultUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkLoginGrant" ADD CONSTRAINT "VkLoginGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkLoginGrant" ADD CONSTRAINT "VkLoginGrant_registrationContextId_fkey" FOREIGN KEY ("registrationContextId") REFERENCES "VkRegistrationContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NpdConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpdReceiptOperation" ADD CONSTRAINT "NpdReceiptOperation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "NpdReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "NpdReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionEvent" ADD CONSTRAINT "AppSubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionEvent" ADD CONSTRAINT "AppSubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionEvent" ADD CONSTRAINT "AppSubscriptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionToken" ADD CONSTRAINT "AccountDeletionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeToken" ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepNotification" ADD CONSTRAINT "StepNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_userStepId_fkey" FOREIGN KEY ("userStepId") REFERENCES "UserStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_dailyCourseUserStepId_fkey" FOREIGN KEY ("dailyCourseUserStepId") REFERENCES "DailyCourseUserStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementCampaign" ADD CONSTRAINT "ReengagementCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementNotification" ADD CONSTRAINT "ReengagementNotification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReengagementCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementSettings" ADD CONSTRAINT "ReengagementSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderMutationReceipt" ADD CONSTRAINT "ReminderMutationReceipt_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingReminderDelivery" ADD CONSTRAINT "TrainingReminderDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAIChat" ADD CONSTRAINT "TrainerAIChat_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAIConfig" ADD CONSTRAINT "TrainerAIConfig_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNoteEntry" ADD CONSTRAINT "TrainerNoteEntry_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "TrainerNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNoteStudent" ADD CONSTRAINT "TrainerNoteStudent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "TrainerNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNoteStudent" ADD CONSTRAINT "TrainerNoteStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLike" ADD CONSTRAINT "ArticleLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLike" ADD CONSTRAINT "ArticleLike_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleViewer" ADD CONSTRAINT "ArticleViewer_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleViewer" ADD CONSTRAINT "ArticleViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleGuestView" ADD CONSTRAINT "ArticleGuestView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAppReleasePolicy" ADD CONSTRAINT "MobileAppReleasePolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationCynologist" ADD CONSTRAINT "ConsultationCynologist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAvailabilityRule" ADD CONSTRAINT "ConsultationAvailabilityRule_cynologistId_fkey" FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationDayOff" ADD CONSTRAINT "ConsultationDayOff_cynologistId_fkey" FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationSlotException" ADD CONSTRAINT "ConsultationSlotException_cynologistId_fkey" FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationSlot" ADD CONSTRAINT "ConsultationSlot_cynologistId_fkey" FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBooking" ADD CONSTRAINT "ConsultationBooking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBooking" ADD CONSTRAINT "ConsultationBooking_cynologistId_fkey" FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBooking" ADD CONSTRAINT "ConsultationBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ConsultationSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationEmailLog" ADD CONSTRAINT "ConsultationEmailLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ConsultationBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBookingIdempotency" ADD CONSTRAINT "ConsultationBookingIdempotency_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CynologistChat" ADD CONSTRAINT "CynologistChat_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CynologistChat" ADD CONSTRAINT "CynologistChat_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSendOperation" ADD CONSTRAINT "ChatSendOperation_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "CynologistChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "CynologistChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatNotification" ADD CONSTRAINT "ChatNotification_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "CynologistChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityChatSendOperation" ADD CONSTRAINT "CommunityChatSendOperation_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityChatAttachment" ADD CONSTRAINT "CommunityChatAttachment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSubscriptionFinanceRefund" ADD CONSTRAINT "AppSubscriptionFinanceRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpense" ADD CONSTRAINT "ProfitVideoExpense_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpense" ADD CONSTRAINT "ProfitVideoExpense_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpenseRevision" ADD CONSTRAINT "ProfitVideoExpenseRevision_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProfitVideoExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bestAnswerId_fkey" FOREIGN KEY ("bestAnswerId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionHeart" ADD CONSTRAINT "QuestionHeart_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionHeart" ADD CONSTRAINT "QuestionHeart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionView" ADD CONSTRAINT "QuestionView_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionView" ADD CONSTRAINT "QuestionView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBlock" ADD CONSTRAINT "QuestionBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryAlbum" ADD CONSTRAINT "GalleryAlbum_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "GalleryAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryUpload" ADD CONSTRAINT "GalleryUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryUpload" ADD CONSTRAINT "GalleryUpload_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostRevision" ADD CONSTRAINT "FeedPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMediaAsset" ADD CONSTRAINT "FeedMediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMediaAsset" ADD CONSTRAINT "FeedMediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRevisionAttachment" ADD CONSTRAINT "FeedRevisionAttachment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "FeedPostRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRevisionAttachment" ADD CONSTRAINT "FeedRevisionAttachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPoll" ADD CONSTRAINT "FeedPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollOption" ADD CONSTRAINT "FeedPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollOption" ADD CONSTRAINT "FeedPollOption_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVoteSelection" ADD CONSTRAINT "FeedPollVoteSelection_pollId_userId_fkey" FOREIGN KEY ("pollId", "userId") REFERENCES "FeedPollVote"("pollId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVoteSelection" ADD CONSTRAINT "FeedPollVoteSelection_pollId_optionId_fkey" FOREIGN KEY ("pollId", "optionId") REFERENCES "FeedPollOption"("pollId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentMedia" ADD CONSTRAINT "FeedCommentMedia_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentMedia" ADD CONSTRAINT "FeedCommentMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostView" ADD CONSTRAINT "FeedPostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostView" ADD CONSTRAINT "FeedPostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPersonalizationPreference" ADD CONSTRAINT "FeedPersonalizationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedImpression" ADD CONSTRAINT "FeedImpression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedImpression" ADD CONSTRAINT "FeedImpression_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostStats" ADD CONSTRAINT "FeedPostStats_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUserAuthorAffinity" ADD CONSTRAINT "FeedUserAuthorAffinity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUserAuthorAffinity" ADD CONSTRAINT "FeedUserAuthorAffinity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUserPostFeedback" ADD CONSTRAINT "FeedUserPostFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUserPostFeedback" ADD CONSTRAINT "FeedUserPostFeedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBookmark" ADD CONSTRAINT "FeedBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBookmark" ADD CONSTRAINT "FeedBookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAuthorPreference" ADD CONSTRAINT "FeedAuthorPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAuthorPreference" ADD CONSTRAINT "FeedAuthorPreference_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineMutationReceipt" ADD CONSTRAINT "OfflineMutationReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineResourceRevision" ADD CONSTRAINT "OfflineResourceRevision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePreventionClientBinding" ADD CONSTRAINT "OfflinePreventionClientBinding_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePreventionClientBinding" ADD CONSTRAINT "OfflinePreventionClientBinding_receiptId_ownerId_fkey" FOREIGN KEY ("receiptId", "ownerId") REFERENCES "OfflineMutationReceipt"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineMutationEffect" ADD CONSTRAINT "OfflineMutationEffect_ownerId_eventId_fkey" FOREIGN KEY ("ownerId", "eventId") REFERENCES "OfflineMutationReceipt"("ownerId", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetCreateReceipt" ADD CONSTRAINT "PetCreateReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Conversation" ADD CONSTRAINT "Chat2Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Member" ADD CONSTRAINT "Chat2Member_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Member" ADD CONSTRAINT "Chat2Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Message" ADD CONSTRAINT "Chat2Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Message" ADD CONSTRAINT "Chat2Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2MessageReaction" ADD CONSTRAINT "Chat2MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2MessageReaction" ADD CONSTRAINT "Chat2MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Media" ADD CONSTRAINT "Chat2Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Media" ADD CONSTRAINT "Chat2Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Media" ADD CONSTRAINT "Chat2Media_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Report" ADD CONSTRAINT "Chat2Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Report" ADD CONSTRAINT "Chat2Report_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Report" ADD CONSTRAINT "Chat2Report_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Topic" ADD CONSTRAINT "Chat2Topic_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Block" ADD CONSTRAINT "Chat2Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2Block" ADD CONSTRAINT "Chat2Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2OutboxEvent" ADD CONSTRAINT "Chat2OutboxEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2PushReceipt" ADD CONSTRAINT "Chat2PushReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat2PushReceipt" ADD CONSTRAINT "Chat2PushReceipt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GAFUS REVIEW-ONLY BOOTSTRAP: fresh, empty DB, NOT production migrations.
-- Historical SQL has been transplanted from unmodified migration files.
-- Apply ONLY after 000-current-prisma-schema.candidate.sql.

-- source: 20260126010000_add_note_entries (extension uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_original_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_original_amount_check" CHECK (
    "originalAmount" IS NULL OR ("amount" IS NOT NULL AND "originalAmount" >= 0)
  );

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionPayment_period_order_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_period_order_check" CHECK (
    "periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" > "periodStart"
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_amount_check" CHECK (
    "promoCodeId" IS NULL
    OR "amount" = ROUND(
      "originalAmount" * (100 - "promoDiscountPercent") / 100,
      2
    )
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_discount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_discount_check" CHECK (
    "promoDiscountPercent" IS NULL
    OR (
      "promoDiscountPercent" BETWEEN 1 AND 50
      AND "promoDiscountPercent" = TRUNC("promoDiscountPercent")
    )
  );

-- source: 20260813201000_expand_app_subscription_promo_scope (CHECK AppSubscriptionPayment_promo_scope_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_scope_check" CHECK (
    "promoCodeId" IS NULL
    OR (
      "provider" = 'YOOKASSA'
      AND "kind" = 'INITIAL'
      AND "planCode" IN ('MONTHLY', 'THREE_MONTHS')
      AND "currency" = 'RUB'
    )
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPayment_promo_snapshot_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_promo_snapshot_check" CHECK (
    (
      "promoCodeId" IS NULL
      AND "promoCodeSnapshot" IS NULL
      AND "promoDiscountPercent" IS NULL
    )
    OR
    (
      "promoCodeId" IS NOT NULL
      AND "promoCodeSnapshot" IS NOT NULL
      AND "promoDiscountPercent" IS NOT NULL
      AND "originalAmount" IS NOT NULL
      AND "amount" IS NOT NULL
    )
  );

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionPayment_yookassa_amount_check)
ALTER TABLE "AppSubscriptionPayment" ADD CONSTRAINT "AppSubscriptionPayment_yookassa_amount_check" CHECK (
    "provider" <> 'YOOKASSA' OR ("amount" IS NOT NULL AND "currency" = 'RUB')
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCodeEvent_discountPercent_check)
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCodeEvent_revision_check)
ALTER TABLE "AppSubscriptionPromoCodeEvent" ADD CONSTRAINT "AppSubscriptionPromoCodeEvent_revision_check" CHECK ("revision" >= 1);

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_archived_inactive_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_archived_inactive_check" CHECK (
    "archivedAt" IS NULL OR "isActive" = false
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_code_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_code_check" CHECK (
    "code" = BTRIM("code")
    AND LENGTH("code") BETWEEN 1 AND 64
    AND "code" ~ '^[A-Za-z0-9_-]+$'
    AND "normalizedCode" = UPPER("code")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_discountPercent_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_discountPercent_check" CHECK (
    "discountPercent" BETWEEN 1 AND 50
    AND "discountPercent" = TRUNC("discountPercent")
  );

-- source: 20260812120000_add_app_subscription_promo_codes (CHECK AppSubscriptionPromoCode_revision_check)
ALTER TABLE "AppSubscriptionPromoCode" ADD CONSTRAINT "AppSubscriptionPromoCode_revision_check" CHECK ("revision" >= 1);

-- source: 20260510235500_add_app_subscription (CHECK AppSubscriptionSettings_currency_check)
ALTER TABLE "AppSubscriptionSettings" ADD CONSTRAINT "AppSubscriptionSettings_currency_check" CHECK ("currency" = 'RUB');

-- source: 20261004120000_subscription_agreement_terms (CHECK AppSubscription_renewal_terms_positive)
ALTER TABLE "AppSubscription" ADD CONSTRAINT "AppSubscription_renewal_terms_positive" CHECK (("renewalPriceRub" IS NULL OR "renewalPriceRub" > 0)
    AND ("renewalIntervalDays" IS NULL OR "renewalIntervalDays" > 0));

-- source: 20261022153000_course_version_global_trigger (CHECK Course_version_positive)
ALTER TABLE "Course" ADD CONSTRAINT "Course_version_positive" CHECK ("version" > 0);

-- source: 20261010200000_smart_feed_events (CHECK FeedRankingEvent_duration_chk)
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_duration_chk" CHECK ("durationMs" >= 0 AND "durationMs" <= 120000);

-- source: 20261010200000_smart_feed_events (CHECK FeedRankingEvent_kind_chk)
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_kind_chk" CHECK ("kind" IN ('dwell','post_open','profile_open'));

-- source: 20261029173500_feed_comment_media (CHECK FeedUpload_purpose_check)
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_purpose_check" CHECK ("purpose" IN ('post', 'comment'));

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionMilestone_threshold_positive)
ALTER TABLE "GafusPostReactionMilestone" ADD CONSTRAINT "GafusPostReactionMilestone_threshold_positive" CHECK ("threshold" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionProgram_highwater_nonnegative)
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_highwater_nonnegative" CHECK ("highWaterReactionCount" >= 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusPostReactionProgram_threshold_positive)
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_threshold_positive" CHECK ("thresholdStep" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusRewardEvent_amount_nonnegative)
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_amount_nonnegative" CHECK ("amount" >= 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusSettings_config_positive)
ALTER TABLE "GafusSettings" ADD CONSTRAINT "GafusSettings_config_positive" CHECK ("activityLimit" >= 0 AND "activityWindowSeconds" > 0 AND "reactionThreshold" > 0 AND "accessDurationSeconds" > 0 AND "postReward" >= 0 AND "questionReward" >= 0 AND "answerReward" >= 0 AND "reactionReward" >= 0 AND "bestAnswerReward" >= 0 AND "courseStepCost" > 0 AND "miniGuideCost" > 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusTargetAccess_positive_duration)
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_positive_duration" CHECK ("expiresAt" > "grantedAt");

-- source: 20261021135000_gafus_article_access (CHECK GafusTargetAccess_target_shape)
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_target_shape" CHECK (
  ("targetType"::text = 'COURSE_STEP' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL)
  OR ("targetType"::text = 'MINI_GUIDE' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL)
  OR ("targetType"::text = 'ARTICLE' AND "courseId" IS NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL AND "targetKey" LIKE 'article:%')
);

-- source: 20261010190000_add_gafus_economy (CHECK GafusTransaction_balances_valid)
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_balances_valid" CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0 AND "balanceAfter" = "balanceBefore" + "delta");

-- source: 20261010190000_add_gafus_economy (CHECK GafusTransaction_delta_nonzero)
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_delta_nonzero" CHECK ("delta" <> 0);

-- source: 20261010190000_add_gafus_economy (CHECK GafusWallet_balance_nonnegative)
ALTER TABLE "GafusWallet" ADD CONSTRAINT "GafusWallet_balance_nonnegative" CHECK ("balance" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_device_id_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_device_id_check" CHECK (length(btrim("deviceId")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_inn_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_inn_check" CHECK ("inn" ~ '^[0-9]{12}$');

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_cipher_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_cipher_check" CHECK (octet_length("refreshTokenCipher") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_iv_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_iv_check" CHECK (octet_length("refreshTokenIv") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_key_version_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_key_version_check" CHECK ("refreshTokenKeyVersion" > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_refresh_token_tag_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_refresh_token_tag_check" CHECK (octet_length("refreshTokenTag") > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdConnection_singleton_check)
ALTER TABLE "NpdConnection" ADD CONSTRAINT "NpdConnection_singleton_check" CHECK ("id" = 'default');

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_attempt_count_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_attempt_count_check" CHECK ("attemptCount" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_lease_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptEmailDelivery_recipient_email_check)
ALTER TABLE "NpdReceiptEmailDelivery" ADD CONSTRAINT "NpdReceiptEmailDelivery_recipient_email_check" CHECK (length(btrim("recipientEmail")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptOperation_attempt_count_check)
ALTER TABLE "NpdReceiptOperation" ADD CONSTRAINT "NpdReceiptOperation_attempt_count_check" CHECK ("attemptCount" >= 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceiptOperation_lease_check)
ALTER TABLE "NpdReceiptOperation" ADD CONSTRAINT "NpdReceiptOperation_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_amount_kopecks_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_amount_kopecks_check" CHECK ("amountKopecks" > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_currency_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_currency_check" CHECK ("currency" = 'RUB');

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_interval_days_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_interval_days_check" CHECK ("intervalDays" IN (14, 30, 90));

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_issued_urls_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_issued_urls_check" CHECK (
    "status" <> 'ISSUED' OR ("printUrl" IS NOT NULL AND "jsonUrl" IS NOT NULL)
  );

-- source: 20261022190000_npd_30_day_plan_intervals (CHECK NpdReceipt_plan_interval_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_plan_interval_check" CHECK (
    ("planCode" = 'TWO_WEEKS' AND "intervalDays" IN (14, 30))
    OR ("planCode" = 'MONTHLY' AND "intervalDays" = 30)
    OR ("planCode" = 'THREE_MONTHS' AND "intervalDays" IN (30, 90))
  );

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_service_name_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_service_name_check" CHECK (length(btrim("serviceName")) > 0);

-- source: 20260828120000_add_npd_receipts (CHECK NpdReceipt_urls_paired_check)
ALTER TABLE "NpdReceipt" ADD CONSTRAINT "NpdReceipt_urls_paired_check" CHECK (
    ("printUrl" IS NULL) = ("jsonUrl" IS NULL)
  );

-- source: 20261017190000_g05_pet_create_receipt (CHECK PetCreateReceipt_payloadHash_format)
ALTER TABLE "PetCreateReceipt" ADD CONSTRAINT "PetCreateReceipt_payloadHash_format" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$');

-- source: 20261017190000_g05_pet_create_receipt (CHECK PetCreateReceipt_responseStatus_check)
ALTER TABLE "PetCreateReceipt" ADD CONSTRAINT "PetCreateReceipt_responseStatus_check" CHECK ("responseStatus" = 201);

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_attempts_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_attempts_check" CHECK ("attempts" >= 0);

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_provider_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_provider_check" CHECK ("provider" IN ('cloudru-documents','isolated-avatar','legacy-yandex'));

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_reason_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_reason_check" CHECK ("reason" IN ('pet-delete','document-delete','candidate','photo-replaced'));

-- source: 20261026074500_pet_media_deletion_intent (CHECK PetMediaDeletionIntent_status_check)
ALTER TABLE "PetMediaDeletionIntent" ADD CONSTRAINT "PetMediaDeletionIntent_status_check" CHECK ("status" IN ('pending','processing','done'));

-- source: 20261010150000_pet_vet_visits (CHECK PetVetAttachment_size_check)
ALTER TABLE "PetVetAttachment" ADD CONSTRAINT "PetVetAttachment_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);

-- source: 20260813180000_expand_rewarded_daily_limit (CHECK RewardedAdSettings_daily_limit_allowed)
ALTER TABLE "RewardedAdSettings" ADD CONSTRAINT "RewardedAdSettings_daily_limit_allowed" CHECK ("dailyAdLimit" BETWEEN 0 AND 100);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditTransaction_amount_positive)
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_amount_positive" CHECK ("amount" > 0);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditWallet_balance_range)
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_balance_range" CHECK ("balance" >= 0 AND "balance" <= 5);

-- source: 20260531140000_add_rewarded_credits (CHECK RewardedCreditWallet_pending_refund_non_negative)
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_pending_refund_non_negative" CHECK ("pendingRefundCredits" >= 0);

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_source_consistency)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_source_consistency" CHECK (
        (
          "source" = 'REWARDED_AD'::"RewardedTargetAccessSource"
          AND "platform" IS NOT NULL
        )
        OR
        (
          "source" = 'LEGACY_GAFUS'::"RewardedTargetAccessSource"
          AND "platform" IS NULL
          AND "sessionId" IS NULL
        )
      );

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_target_id_nonempty)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_target_id_nonempty" CHECK (length(btrim("targetId")) > 0);

-- source: 20260805120000_add_rewarded_target_access (CHECK RewardedTargetAccess_valid_period)
ALTER TABLE "RewardedTargetAccess" ADD CONSTRAINT "RewardedTargetAccess_valid_period" CHECK ("expiresAt" > "grantedAt");

-- source: 20261018113000_offline_resource_video_history_additive (CHECK off021_video_position_pair_ck)
ALTER TABLE "OfflineResourceRevision" ADD CONSTRAINT "off021_video_position_pair_ck" CHECK (
    ("videoLastPositionSec" IS NULL AND "videoRecordedAt" IS NULL)
    OR
    ("videoLastPositionSec" IS NOT NULL AND "videoRecordedAt" IS NOT NULL
     AND "videoLastPositionSec" BETWEEN 0 AND 2073600)
  );

-- source: 20261010160000_account_storage_cleanup + 20261025155900_account_cleanup_add_private_scopes
-- Explicitly named equivalent of the latest active legacy inline constraints.
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_status_check"
  CHECK ("status" IN ('pending','processing','done'));
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_scope_check"
  CHECK ("scope" IN ('public','gallery','feed','stream','questions','documents'));

-- source: 20260510235500_add_app_subscription (partial index AppSubscriptionEvent_idempotencyKey_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_idempotencyKey_unique"
  ON "AppSubscriptionEvent"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- source: 20260510235500_add_app_subscription (partial index AppSubscriptionEvent_providerEventKey_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_providerEventKey_unique"
  ON "AppSubscriptionEvent"("providerEventKey")
  WHERE "providerEventKey" IS NOT NULL;

-- source: 20260511203000_add_app_subscription_payment_succeeded_at (ordinary index AppSubscriptionPayment_subscriptionId_status_succeededAt_idx)
CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_subscriptionId_status_succeededAt_idx"
  ON "AppSubscriptionPayment"("subscriptionId", "status", "succeededAt");

-- source: 20260510235500_add_app_subscription (ordinary index AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx)
CREATE INDEX IF NOT EXISTS "AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx"
  ON "AppSubscription"("provider", "status", "cancelAtPeriodEnd", "currentPeriodEnd");

-- source: 20260510235500_add_app_subscription (partial index AppSubscription_userId_provider_active_unique)
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_userId_provider_active_unique"
  ON "AppSubscription"("userId", "provider")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE');

-- source: 20261027172500_chat2_v2_media_task (partial index Chat2V2MediaTask_cleanup_pending_idx)
CREATE INDEX IF NOT EXISTS "Chat2V2MediaTask_cleanup_pending_idx"
  ON "Chat2V2MediaTask"("cleanupKind","cleanupNextAt","cleanupLeaseUntil")
  WHERE "cleanupKind" IS NOT NULL AND "cleanupCompletedAt" IS NULL;

-- source: 20260421140000_consultation_booking_slot_partial_unique (partial index ConsultationBooking_slotId_active_key)
CREATE UNIQUE INDEX "ConsultationBooking_slotId_active_key"
ON "ConsultationBooking" ("slotId")
WHERE "status" IN ('PENDING_TRAINER_CONFIRMATION', 'CONFIRMED');

-- source: 20260429123000_enforce_pet_document_owner_consistency (ordinary index PetDocument_petId_ownerId_idx)
CREATE INDEX "PetDocument_petId_ownerId_idx" ON "PetDocument"("petId", "ownerId");

-- source: 20261025041500_step_notification_occurrence (partial index StepNotification_active_bound_unique)
CREATE UNIQUE INDEX "StepNotification_active_bound_unique"
  ON "StepNotification" ("userId", "dayOnCourseId", "stepOnDayId")
  WHERE "type" = 'step' AND "sent" = false
    AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION guard_app_subscription_promo_code_identity)
CREATE FUNCTION "guard_app_subscription_promo_code_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  state_changed BOOLEAN;
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."normalizedCode" IS DISTINCT FROM OLD."normalizedCode"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'promo code identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD."archivedAt" IS NOT NULL
    AND NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt"
  THEN
    RAISE EXCEPTION 'archived promo code cannot be restored or re-archived' USING ERRCODE = '23514';
  END IF;

  state_changed := NEW."discountPercent" IS DISTINCT FROM OLD."discountPercent"
    OR NEW."isActive" IS DISTINCT FROM OLD."isActive"
    OR NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt";

  IF state_changed AND NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'promo code state change must increment revision exactly once' USING ERRCODE = '23514';
  END IF;

  IF NOT state_changed AND NEW."revision" <> OLD."revision" THEN
    RAISE EXCEPTION 'promo code revision cannot change without a state change' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION prevent_app_subscription_promo_code_event_mutation)
CREATE FUNCTION "prevent_app_subscription_promo_code_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'promo code events are immutable' USING ERRCODE = '23514';
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (FUNCTION guard_app_subscription_payment_price_snapshot)
CREATE FUNCTION "guard_app_subscription_payment_price_snapshot"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."originalAmount" IS DISTINCT FROM OLD."originalAmount"
    OR NEW."promoCodeId" IS DISTINCT FROM OLD."promoCodeId"
    OR NEW."promoCodeSnapshot" IS DISTINCT FROM OLD."promoCodeSnapshot"
    OR NEW."promoDiscountPercent" IS DISTINCT FROM OLD."promoDiscountPercent"
  THEN
    RAISE EXCEPTION 'app subscription payment price snapshot is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- source: 20261010180000_smart_feed (FUNCTION feed_normalize_profile_city)
CREATE FUNCTION "feed_normalize_profile_city"() RETURNS trigger AS $$
BEGIN
  NEW."cityKey" := CASE WHEN NEW."city" IS NULL THEN NULL
    ELSE NULLIF(LEFT(TRANSLATE(
      LOWER(TRIM(REGEXP_REPLACE(
        NORMALIZE(NEW."city", NFKC), '[[:space:]]+', ' ', 'g'
      ))),
      'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
      'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    ), 160), '') END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- source: 20261010200000_smart_feed_events (FUNCTION feed_normalize_breed_key)
CREATE FUNCTION "feed_normalize_breed_key"(raw TEXT) RETURNS VARCHAR(160) AS $$
DECLARE value TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  value := LEFT(TRANSLATE(
    LOWER(TRIM(REGEXP_REPLACE(NORMALIZE(raw, NFKC), '[[:space:]]+', ' ', 'g'))),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
  ), 160);
  IF value IN ('labrador', 'labrador retriever', 'лабрадор ретривер', 'лабрадор-ретривер') THEN value := 'лабрадор'; END IF;
  IF value IN ('golden', 'golden retriever') THEN value := 'золотистый ретривер'; END IF;
  IF value IN ('йорк', 'yorkshire terrier') THEN value := 'йоркширский терьер'; END IF;
  IF value = 'french bulldog' THEN value := 'французский бульдог'; END IF;
  RETURN NULLIF(value, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- source: 20261010200000_smart_feed_events (FUNCTION feed_normalize_pet_breed)
CREATE FUNCTION "feed_normalize_pet_breed"() RETURNS trigger AS $$
BEGIN
  NEW."breedKey" := "feed_normalize_breed_key"(NEW."breed");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- source: 20261015020000_course_content_revision (FUNCTION gafus_bump_course_content_revision)
CREATE FUNCTION gafus_bump_course_content_revision() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "CourseContentRevision"
       SET "revision" = "revision" + 1
     WHERE "id" = 1;
    RETURN NULL;
END;
$$;

-- source: 20261022153000_course_version_global_trigger (FUNCTION gafus_course_increment_version)
CREATE FUNCTION "gafus_course_increment_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Application code must NEVER bump/set version itself. One UPDATE = one
  -- database increment; explicit client-side increment would double count.
  IF NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Course.version is database-managed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."version" >= 2147483647 THEN
    RAISE EXCEPTION 'Course.version exhausted'
      USING ERRCODE = '22003';
  END IF;
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END
$fn$;

-- source: 20261027011000_chat2_media_deletion_ledger (FUNCTION chat2_capture_media_deletion)
CREATE FUNCTION "chat2_capture_media_deletion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Keep Prisma timestamp(3) values UTC despite database session timezone.
  INSERT INTO "Chat2MediaDeletionIntent"("objectKey", "availableAt", "createdAt")
    VALUES (OLD."objectKey", timezone('UTC', clock_timestamp()), timezone('UTC', clock_timestamp()))
  -- If a reserved/successful upload is subsequently cascaded out, re-arm it.
  ON CONFLICT ("objectKey") DO UPDATE SET
    "status"='PENDING',"availableAt"=timezone('UTC',clock_timestamp()),
    "claimedUntil"=NULL,"completedAt"=NULL,"errorCode"=NULL;
  RETURN NULL;
END;
$$;

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPromoCode_identity_guard)
CREATE TRIGGER "AppSubscriptionPromoCode_identity_guard"
BEFORE UPDATE ON "AppSubscriptionPromoCode"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_promo_code_identity"();

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPromoCodeEvent_immutable)
CREATE TRIGGER "AppSubscriptionPromoCodeEvent_immutable"
BEFORE UPDATE OR DELETE ON "AppSubscriptionPromoCodeEvent"
FOR EACH ROW
EXECUTE FUNCTION "prevent_app_subscription_promo_code_event_mutation"();

-- source: 20260812120000_add_app_subscription_promo_codes (TRIGGER AppSubscriptionPayment_price_snapshot_guard)
CREATE TRIGGER "AppSubscriptionPayment_price_snapshot_guard"
BEFORE UPDATE ON "AppSubscriptionPayment"
FOR EACH ROW
EXECUTE FUNCTION "guard_app_subscription_payment_price_snapshot"();

-- source: 20261010180000_smart_feed (TRIGGER feed_profile_city_key_sync)
CREATE TRIGGER "feed_profile_city_key_sync"
  BEFORE INSERT OR UPDATE OF "city" ON "UserProfile"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_profile_city"();

-- source: 20261010200000_smart_feed_events (TRIGGER feed_pet_breed_key_sync)
CREATE TRIGGER "feed_pet_breed_key_sync"
  BEFORE INSERT OR UPDATE OF "breed" ON "Pet"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_pet_breed"();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_course)
CREATE TRIGGER "course_content_revision_course"
AFTER INSERT OR UPDATE OR DELETE ON "Course"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_day_on_course)
CREATE TRIGGER "course_content_revision_day_on_course"
AFTER INSERT OR UPDATE OR DELETE ON "DayOnCourse"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_training_day)
CREATE TRIGGER "course_content_revision_training_day"
AFTER INSERT OR UPDATE OR DELETE ON "TrainingDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_step_on_day)
CREATE TRIGGER "course_content_revision_step_on_day"
AFTER INSERT OR UPDATE OR DELETE ON "StepOnDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261015020000_course_content_revision (TRIGGER course_content_revision_step)
CREATE TRIGGER "course_content_revision_step"
AFTER INSERT OR UPDATE OR DELETE ON "Step"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

-- source: 20261022153000_course_version_global_trigger (TRIGGER Course_global_version_increment)
CREATE TRIGGER "Course_global_version_increment"
  BEFORE UPDATE ON "Course"
  FOR EACH ROW
  EXECUTE FUNCTION "gafus_course_increment_version"();

-- source: 20261027011000_chat2_media_deletion_ledger (TRIGGER chat2_capture_media_deletion_trigger)
CREATE TRIGGER "chat2_capture_media_deletion_trigger"
AFTER DELETE ON "Chat2Media" FOR EACH ROW
EXECUTE FUNCTION "chat2_capture_media_deletion"();

-- GAFUS ONLY-NEW-EMPTY-DB bootstrap seeds, no user records, no legacy backfills.
-- sources: 20260424143000, 20260510235500, 20260531140000,
--          20260726120000, 20261015020000 + final 20261004120000 tariff defaults.
-- AppSubscriptionSettings 20260510235500 original seed referenced retired
-- intervalDays; the current schema has weeklyIntervalDays/monthlyIntervalDays.
-- Current 200/1465/1185/2470 RUB and 7/30/30/30 days are DB defaults,
-- verified against schema output by assemble.py.
INSERT INTO "AppSubscriptionSettings" ("key", "updatedAt")
  VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

-- Old web reward flags no longer exist in the latest RewardedAdSettings.
INSERT INTO "RewardedAdSettings"
  ("key", "androidEnabled", "iosEnabled", "dailyAdLimit", "testMode", "updatedAt")
  VALUES ('default', false, false, 1, true, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AccountDeletionCounter" ("id", "totalDeleted", "createdAt", "updatedAt")
  VALUES ('global', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CourseContentRevision" ("id", "revision")
  VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MobileAppReleasePolicy"
  ("key", "iosReviewVersion", "revision", "createdAt", "updatedAt")
  VALUES ('default', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

-- Historical 20260726120000 selects the current RewardedAdSettings iosEnabled
-- (false on fresh DB), and sets reviewEnabled false. Never open review mode.
INSERT INTO "AppFeatureFlag" ("key", "enabled", "reviewEnabled", "updatedAt")
  VALUES ('mobile_rewarded_ads_ios', false, false, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;
