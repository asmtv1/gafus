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
