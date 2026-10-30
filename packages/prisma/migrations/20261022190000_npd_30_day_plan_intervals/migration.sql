-- Preserve historical 14/90-day receipts while allowing the current
-- 30-day public Premium offers (billing codes are historical labels).
BEGIN;

ALTER TABLE "NpdReceipt"
  DROP CONSTRAINT "NpdReceipt_plan_interval_check";

ALTER TABLE "NpdReceipt"
  ADD CONSTRAINT "NpdReceipt_plan_interval_check" CHECK (
    ("planCode" = 'TWO_WEEKS' AND "intervalDays" IN (14, 30))
    OR ("planCode" = 'MONTHLY' AND "intervalDays" = 30)
    OR ("planCode" = 'THREE_MONTHS' AND "intervalDays" IN (30, 90))
  );

COMMIT;
