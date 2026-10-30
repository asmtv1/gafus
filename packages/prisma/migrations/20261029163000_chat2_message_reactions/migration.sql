-- Additive Chat 2.0 reactions. No existing content is modified.
CREATE TABLE "Chat2MessageReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" VARCHAR(12) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chat2MessageReaction_pkey" PRIMARY KEY ("messageId","userId"),
  CONSTRAINT "Chat2MessageReaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Chat2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chat2MessageReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Chat2MessageReaction_userId_idx" ON "Chat2MessageReaction"("userId");
