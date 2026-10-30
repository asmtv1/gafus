-- Chat 2.0 additive schema, no Stream history deletion or production operations.
CREATE TYPE "Chat2Kind" AS ENUM ('DIRECT','CYNOLOGIST','COMMUNITY','COURSE','CITY','BREED','GROUP');
CREATE TYPE "Chat2Visibility" AS ENUM ('PUBLIC','PRIVATE','UNLISTED');
CREATE TABLE "Chat2Conversation" (
  "id" TEXT PRIMARY KEY, "kind" "Chat2Kind" NOT NULL,
  "visibility" "Chat2Visibility" NOT NULL DEFAULT 'PRIVATE',
  "name" VARCHAR(120), "description" VARCHAR(2000),
  "directKey" TEXT UNIQUE, "scopeKey" TEXT, "createdById" TEXT,
  "nextSequence" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Chat2Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Chat2Conversation_kind_scopeKey_key" ON "Chat2Conversation"("kind","scopeKey");
CREATE INDEX "Chat2Conversation_kind_visibility_createdAt_idx" ON "Chat2Conversation"("kind","visibility","createdAt");
CREATE TABLE "Chat2Member" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "role" VARCHAR(16) NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReadSequence" BIGINT NOT NULL DEFAULT 0,
  "mutedUntil" TIMESTAMP(3), "hiddenAt" TIMESTAMP(3),
  CONSTRAINT "Chat2Member_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Chat2Member_conversationId_userId_key" ON "Chat2Member"("conversationId","userId");
CREATE INDEX "Chat2Member_userId_hiddenAt_idx" ON "Chat2Member"("userId","hiddenAt");
CREATE TABLE "Chat2Message" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "sequence" BIGINT NOT NULL,
  "authorId" TEXT NOT NULL, "clientMessageId" VARCHAR(64) NOT NULL,
  "text" VARCHAR(8000) NOT NULL, "replyToId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Chat2Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Chat2Message_conversationId_sequence_key" ON "Chat2Message"("conversationId","sequence");
CREATE UNIQUE INDEX "Chat2Message_conversationId_authorId_clientMessageId_key" ON "Chat2Message"("conversationId","authorId","clientMessageId");
CREATE INDEX "Chat2Message_conversationId_createdAt_idx" ON "Chat2Message"("conversationId","createdAt");
CREATE TABLE "Chat2Media" (
  "id" TEXT PRIMARY KEY, "messageId" TEXT, "conversationId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL UNIQUE, "name" VARCHAR(180) NOT NULL, "kind" VARCHAR(20) NOT NULL,
  "mime" VARCHAR(128) NOT NULL, "bytes" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chat2Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Chat2Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Media_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Chat2Media_ownerId_status_createdAt_idx" ON "Chat2Media"("ownerId","status","createdAt");
CREATE INDEX "Chat2Media_conversationId_messageId_idx" ON "Chat2Media"("conversationId","messageId");
CREATE TABLE "Chat2Topic" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chat2Topic_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Chat2Block" (
  "blockerId" TEXT NOT NULL, "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chat2Block_pkey" PRIMARY KEY ("blockerId","blockedId"),
  CONSTRAINT "Chat2Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Chat2OutboxEvent" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "messageId" TEXT,
  "eventType" VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3),
  CONSTRAINT "Chat2OutboxEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Chat2OutboxEvent_deliveredAt_nextAttemptAt_idx" ON "Chat2OutboxEvent"("deliveredAt","nextAttemptAt");
CREATE TABLE "Chat2PushReceipt" (
  "messageId" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
  "notificationId" TEXT UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chat2PushReceipt_pkey" PRIMARY KEY ("messageId","recipientId"),
  CONSTRAINT "Chat2PushReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2PushReceipt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
