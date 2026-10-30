-- AG1 additive review-only migration candidate, NOT applied and NOT in prisma/migrations.
-- Intended path once AG4 grants exclusive history writer:
-- packages/prisma/migrations/20261018110000_reminder_mutation_receipt/migration.sql
-- Full User/Reminder data and 140+ pre-existing migration ledger preserved.
-- No IF NOT EXISTS: preexisting ad-hoc table requires AG4-led history reconciliation.
CREATE TABLE "ReminderMutationReceipt" (
    "ownerUserId" TEXT NOT NULL,
    "operationKey" VARCHAR(36) NOT NULL,
    "operationKind" VARCHAR(16) NOT NULL DEFAULT 'CREATE',
    "fingerprint" VARCHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "reminderId" TEXT,
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderMutationReceipt_pkey" PRIMARY KEY ("ownerUserId", "operationKey")
);
CREATE INDEX "ReminderMutationReceipt_ownerUserId_expiresAt_idx"
    ON "ReminderMutationReceipt"("ownerUserId", "expiresAt");
ALTER TABLE "ReminderMutationReceipt"
    ADD CONSTRAINT "ReminderMutationReceipt_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
-- Key/owner composite tombstone must outlive expiresAt; no automatic DELETE.
-- No FK on "reminderId": deletion of Reminder must not free a spent operationKey.
-- responseJson redaction/expiry lifecycle is a separate AG4 privacy decision.
