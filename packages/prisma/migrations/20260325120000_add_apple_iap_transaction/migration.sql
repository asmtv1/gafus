-- CreateEnum
CREATE TYPE "AppleIapEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateTable
CREATE TABLE "AppleIapTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "environment" "AppleIapEnvironment" NOT NULL,
    "courseId" TEXT,
    "articleId" TEXT,
    "jwsPayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleIapTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppleIapTransaction_originalTransactionId_key" ON "AppleIapTransaction"("originalTransactionId");

-- CreateIndex
CREATE INDEX "AppleIapTransaction_userId_idx" ON "AppleIapTransaction"("userId");

-- CreateIndex
CREATE INDEX "AppleIapTransaction_userId_courseId_idx" ON "AppleIapTransaction"("userId", "courseId");

-- CreateIndex
CREATE INDEX "AppleIapTransaction_userId_articleId_idx" ON "AppleIapTransaction"("userId", "articleId");

-- AddForeignKey
ALTER TABLE "AppleIapTransaction" ADD CONSTRAINT "AppleIapTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppleIapTransaction" ADD CONSTRAINT "AppleIapTransaction_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppleIapTransaction" ADD CONSTRAINT "AppleIapTransaction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- XOR: ровно один из courseId / articleId (Prisma CHECK не генерирует)
ALTER TABLE "AppleIapTransaction" ADD CONSTRAINT "chk_course_or_article"
CHECK (
  ("courseId" IS NOT NULL AND "articleId" IS NULL)
  OR ("courseId" IS NULL AND "articleId" IS NOT NULL)
);
