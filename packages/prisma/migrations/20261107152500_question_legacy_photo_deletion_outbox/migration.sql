-- Expand-only, independently deployable queue for deleted QuestionPhoto legacy keys.
-- No FK: cleanup must survive photo and user deletion; an API SQL rollback
-- must roll back this enqueue and its photo-row deletion together.
CREATE TABLE "QuestionLegacyPhotoDeletion" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionLegacyPhotoDeletion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuestionLegacyPhotoDeletion_status_availableAt_createdAt_idx"
    ON "QuestionLegacyPhotoDeletion"("status", "availableAt", "createdAt");
