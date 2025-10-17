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
CREATE INDEX "ReengagementMetrics_date_idx" ON "ReengagementMetrics"("date");

-- AddForeignKey
ALTER TABLE "ReengagementCampaign" ADD CONSTRAINT "ReengagementCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementNotification" ADD CONSTRAINT "ReengagementNotification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReengagementCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReengagementSettings" ADD CONSTRAINT "ReengagementSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
