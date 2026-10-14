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
CREATE INDEX "TransactionalMailOutbox_status_nextAttemptAt_idx" ON "TransactionalMailOutbox"("status", "nextAttemptAt");
CREATE INDEX "TransactionalMailOutbox_status_leaseExpiresAt_idx" ON "TransactionalMailOutbox"("status", "leaseExpiresAt");
CREATE INDEX "TransactionalMailOutbox_expiresAt_idx" ON "TransactionalMailOutbox"("expiresAt");
