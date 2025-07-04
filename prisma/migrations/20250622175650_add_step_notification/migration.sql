-- CreateTable
CREATE TABLE "StepNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "endTs" INTEGER NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "subscription" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StepNotification_userId_idx" ON "StepNotification"("userId");

-- CreateIndex
CREATE INDEX "StepNotification_day_stepIndex_idx" ON "StepNotification"("day", "stepIndex");

-- AddForeignKey
ALTER TABLE "StepNotification" ADD CONSTRAINT "StepNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
