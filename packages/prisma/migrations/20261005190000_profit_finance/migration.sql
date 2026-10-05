-- AlterTable
ALTER TABLE "AppSubscriptionPayment" ADD COLUMN     "financeRefundsIncomplete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "financeSyncedAt" TIMESTAMP(3),
ADD COLUMN     "providerCapturedAt" TIMESTAMP(3),
ADD COLUMN     "providerIncomeAmount" DECIMAL(12,2),
ADD COLUMN     "providerPaymentMethodType" VARCHAR(64);

-- CreateTable
CREATE TABLE "AppSubscriptionFinanceRefund" (
    "id" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSubscriptionFinanceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitVideoExpense" (
    "id" TEXT NOT NULL,
    "requestKey" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "partnerId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceKopecks" INTEGER NOT NULL DEFAULT 50000,
    "amountKopecks" INTEGER NOT NULL,
    "comment" VARCHAR(512),
    "actorId" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitVideoExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitVideoExpenseRevision" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitVideoExpenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscriptionFinanceRefund_providerRefundId_key" ON "AppSubscriptionFinanceRefund"("providerRefundId");

-- CreateIndex
CREATE INDEX "AppSubscriptionFinanceRefund_refundedAt_paymentId_idx" ON "AppSubscriptionFinanceRefund"("refundedAt", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitVideoExpense_requestKey_key" ON "ProfitVideoExpense"("requestKey");

-- CreateIndex
CREATE INDEX "ProfitVideoExpense_paidAt_canceledAt_idx" ON "ProfitVideoExpense"("paidAt", "canceledAt");

-- CreateIndex
CREATE INDEX "ProfitVideoExpense_partnerId_paidAt_idx" ON "ProfitVideoExpense"("partnerId", "paidAt");

-- CreateIndex
CREATE INDEX "ProfitVideoExpenseRevision_expenseId_createdAt_idx" ON "ProfitVideoExpenseRevision"("expenseId", "createdAt");

-- CreateIndex
CREATE INDEX "AppSubscriptionPayment_provider_providerCapturedAt_idx" ON "AppSubscriptionPayment"("provider", "providerCapturedAt");

-- AddForeignKey
ALTER TABLE "AppSubscriptionFinanceRefund" ADD CONSTRAINT "AppSubscriptionFinanceRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpense" ADD CONSTRAINT "ProfitVideoExpense_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpense" ADD CONSTRAINT "ProfitVideoExpense_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitVideoExpenseRevision" ADD CONSTRAINT "ProfitVideoExpenseRevision_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ProfitVideoExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "AppSubscriptionFinanceRefund_paymentId_idx" ON "AppSubscriptionFinanceRefund"("paymentId");
