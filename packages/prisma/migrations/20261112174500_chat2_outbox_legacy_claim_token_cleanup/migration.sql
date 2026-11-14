-- Forward-only hardening of mixed 1.7.2/1.7.3 outbox execution.
-- Legacy ACK/retry clears claimedUntil but does not know the later claimToken
-- column. A delivered or released row must not retain that stale token.
-- Retain the DLQ SELECT quarantine and stale UPDATE fencing from the previous
-- migration. This can be deployed while both old and new Workers are alive.
CREATE OR REPLACE FUNCTION public."chat2PreventLegacyDlqRedelivery"()
RETURNS trigger
LANGUAGE plpgsql
AS $gafus$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."deadLetteredAt" IS NOT NULL
       AND OLD."deliveredAt" IS NULL
       AND NEW."deadLetteredAt" IS NOT NULL
       AND (
         NEW."claimedUntil" IS DISTINCT FROM OLD."claimedUntil"
         OR NEW."attempts" IS DISTINCT FROM OLD."attempts"
         OR NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt"
       ) THEN
      RETURN NULL; -- Legacy Worker must see updateMany count=0.
    END IF;
    IF OLD."claimedUntil" IS NOT NULL
       AND NEW."claimedUntil" IS NULL
       AND NEW."claimToken" IS NOT NULL THEN
      NEW."claimToken" := NULL; -- Legacy ACK or retry release.
    END IF;
  END IF;
  IF NEW."deadLetteredAt" IS NOT NULL AND NEW."deliveredAt" IS NULL THEN
    NEW."nextAttemptAt" := TIMESTAMP '9999-12-31 00:00:00';
  END IF;
  RETURN NEW;
END;
$gafus$;

-- Existing rows released by a legacy Worker before this migration are safe
-- to normalize. Never clear a token while an active lease is held.
UPDATE public."Chat2OutboxEvent"
SET "claimToken" = NULL
WHERE "claimedUntil" IS NULL AND "claimToken" IS NOT NULL;
