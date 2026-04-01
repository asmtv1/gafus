-- CreateEnum: PaymentProvider (YOOKASSA | APPLE)
CREATE TYPE "PaymentProvider" AS ENUM ('YOOKASSA', 'APPLE');

-- AlterTable Course: Apple IAP product id для платных курсов в iOS
ALTER TABLE "Course" ADD COLUMN "appleIapProductId" TEXT;
CREATE UNIQUE INDEX "Course_appleIapProductId_key" ON "Course"("appleIapProductId");

-- AlterTable Payment: провайдер оплаты и идентификатор транзакции Apple
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'YOOKASSA';
ALTER TABLE "Payment" ADD COLUMN "appleTransactionId" TEXT;
CREATE UNIQUE INDEX "Payment_appleTransactionId_key" ON "Payment"("appleTransactionId");
