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

-- CreateIndex
CREATE INDEX "DailyCourseBundle_authorId_idx" ON "DailyCourseBundle"("authorId");

-- CreateIndex
CREATE INDEX "DailyCourseBundle_updatedAt_idx" ON "DailyCourseBundle"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseBundleStep_bundleId_order_key" ON "DailyCourseBundleStep"("bundleId", "order");

-- CreateIndex
CREATE INDEX "DailyCourseBundleStep_bundleId_order_idx" ON "DailyCourseBundleStep"("bundleId", "order");

-- CreateIndex
CREATE INDEX "DailyCourseBundleStep_stepId_idx" ON "DailyCourseBundleStep"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseSchedule_date_key" ON "DailyCourseSchedule"("date");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_date_idx" ON "DailyCourseSchedule"("date");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_bundleId_idx" ON "DailyCourseSchedule"("bundleId");

-- CreateIndex
CREATE INDEX "DailyCourseSchedule_createdById_idx" ON "DailyCourseSchedule"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseUserTraining_userId_scheduleId_key" ON "DailyCourseUserTraining"("userId", "scheduleId");

-- CreateIndex
CREATE INDEX "DailyCourseUserTraining_scheduleId_idx" ON "DailyCourseUserTraining"("scheduleId");

-- CreateIndex
CREATE INDEX "DailyCourseUserTraining_userId_idx" ON "DailyCourseUserTraining"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_bundleStepId_key" ON "DailyCourseUserStep"("dailyCourseUserTrainingId", "bundleStepId");

-- CreateIndex
CREATE INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_idx" ON "DailyCourseUserStep"("dailyCourseUserTrainingId");

-- CreateIndex
CREATE INDEX "DailyCourseUserStep_bundleStepId_idx" ON "DailyCourseUserStep"("bundleStepId");

-- AddForeignKey
ALTER TABLE "DailyCourseBundle" ADD CONSTRAINT "DailyCourseBundle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseBundleStep" ADD CONSTRAINT "DailyCourseBundleStep_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "DailyCourseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCourseBundleStep" ADD CONSTRAINT "DailyCourseBundleStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
