-- CreateTable
CREATE TABLE "AccountDeletionAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "hadEmail" BOOLEAN NOT NULL DEFAULT false,
    "initiatedBy" TEXT NOT NULL DEFAULT 'SELF_SERVICE',
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionCounter" (
    "id" TEXT NOT NULL,
    "totalDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_deletedAt_idx" ON "AccountDeletionAudit"("deletedAt");

-- CreateIndex
CREATE INDEX "AccountDeletionAudit_userId_idx" ON "AccountDeletionAudit"("userId");

-- Seed singleton counter row
INSERT INTO "AccountDeletionCounter" ("id", "totalDeleted", "createdAt", "updatedAt")
VALUES ('global', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
