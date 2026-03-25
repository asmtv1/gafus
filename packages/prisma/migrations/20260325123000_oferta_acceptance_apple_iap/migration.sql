-- AlterTable
ALTER TABLE "OfertaAcceptance" ADD COLUMN "appleIapTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "OfertaAcceptance_appleIapTransactionId_idx" ON "OfertaAcceptance"("appleIapTransactionId");

-- AddForeignKey
ALTER TABLE "OfertaAcceptance" ADD CONSTRAINT "OfertaAcceptance_appleIapTransactionId_fkey" FOREIGN KEY ("appleIapTransactionId") REFERENCES "AppleIapTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
