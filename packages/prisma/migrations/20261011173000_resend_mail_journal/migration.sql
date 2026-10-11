CREATE TABLE "TransactionalMailAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "providerMessageId" TEXT,
 "recipientCount" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "errorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "acceptedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "TransactionalMailAttempt_providerMessageId_key" ON "TransactionalMailAttempt"("providerMessageId");
CREATE INDEX "TransactionalMailAttempt_createdAt_idx" ON "TransactionalMailAttempt"("createdAt");
CREATE TABLE "TransactionalMailEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "providerMessageId" TEXT NOT NULL,
 "type" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "errorCode" TEXT
);
CREATE INDEX "TransactionalMailEvent_providerMessageId_occurredAt_idx" ON "TransactionalMailEvent"("providerMessageId", "occurredAt");
