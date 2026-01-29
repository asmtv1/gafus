-- AlterTable: добавить priceRub в Course
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "priceRub" DECIMAL(10,2);

-- CreateEnum: PaymentStatus
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "amountRub" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "yookassaPaymentId" TEXT,
    "confirmationUrl" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: yookassaPaymentId unique
CREATE UNIQUE INDEX "Payment_yookassaPaymentId_key" ON "Payment"("yookassaPaymentId");

-- CreateIndex: userId
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex: courseId
CREATE INDEX "Payment_courseId_idx" ON "Payment"("courseId");

-- CreateIndex: status
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- Partial unique index: один PENDING на пару (userId, courseId)
CREATE UNIQUE INDEX "Payment_userId_courseId_pending_key" ON "Payment"("userId", "courseId") WHERE "status" = 'PENDING';

-- AddForeignKey: Payment -> User
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Payment -> Course
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
