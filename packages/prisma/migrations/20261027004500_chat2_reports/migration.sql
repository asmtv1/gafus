-- Chat2 safety reporting: additive. Does not alter legacy Stream tables.
CREATE TABLE "Chat2Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reporterId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "reason" VARCHAR(24) NOT NULL,
  "comment" VARCHAR(500) NOT NULL DEFAULT '',
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Chat2Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Report_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Chat2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2Report_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Chat2Report_reporterId_messageId_key" ON "Chat2Report"("reporterId","messageId");
CREATE INDEX "Chat2Report_conversationId_status_createdAt_idx" ON "Chat2Report"("conversationId","status","createdAt");
