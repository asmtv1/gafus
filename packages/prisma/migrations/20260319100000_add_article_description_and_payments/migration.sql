-- Add description to Article
ALTER TABLE "Article" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

-- Create ArticlePayment table for paid article purchases
CREATE TABLE "ArticlePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "amountRub" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "yookassaPaymentId" TEXT,
    "confirmationUrl" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticlePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticlePayment_yookassaPaymentId_key" ON "ArticlePayment"("yookassaPaymentId");
CREATE INDEX "ArticlePayment_userId_idx" ON "ArticlePayment"("userId");
CREATE INDEX "ArticlePayment_articleId_idx" ON "ArticlePayment"("articleId");
CREATE INDEX "ArticlePayment_status_idx" ON "ArticlePayment"("status");

ALTER TABLE "ArticlePayment" ADD CONSTRAINT "ArticlePayment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticlePayment" ADD CONSTRAINT "ArticlePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
