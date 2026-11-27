-- Only trusted new mail producers classify reset attempts. Never infer old categories from content.
ALTER TABLE "TransactionalMailAttempt" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general';
CREATE INDEX "TransactionalMailAttempt_category_createdAt_idx"
  ON "TransactionalMailAttempt"("category", "createdAt");
