-- Append-only provider webhook journal: rolling receivedAt reads for operations/Admin.
-- A bounded transactional index build fails closed on lock contention or long scan.
-- No data rewrite, no historical migration changes, no invalid partial index on failure.
BEGIN;
SET LOCAL lock_timeout = '1200ms';
SET LOCAL statement_timeout = '8000ms';
CREATE INDEX "TransactionalMailEvent_receivedAt_idx" ON "TransactionalMailEvent" USING BRIN ("receivedAt");
COMMIT;
