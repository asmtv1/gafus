-- Expand-only compatibility fence for simultaneously deployed 1.7.2 and 1.7.3 Chat2 Workers.
-- Legacy 1.7.2 has no deadLetteredAt predicate: without this guard it may
-- reclaim, publish, and ACK a terminal DLQ event while newer workers exclude it.
-- Preserve old worker read/write compatibility and allow only explicit admin
-- replay (which clears deadLetteredAt and resets nextAttemptAt/attempts).
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
      -- Silently reject old SELECT→UPDATE claim and stale ACK, so Prisma
      -- updateMany reports count=0 without crashing the legacy Worker.
      RETURN NULL;
    END IF;
  END IF;
  IF NEW."deadLetteredAt" IS NOT NULL AND NEW."deliveredAt" IS NULL THEN
    -- Old Worker SELECT checks nextAttemptAt but not deadLetteredAt.
    -- A finite sentinel is Prisma DateTime-readable and cannot be due.
    NEW."nextAttemptAt" := TIMESTAMP '9999-12-31 00:00:00';
  END IF;
  RETURN NEW;
END;
$gafus$;

CREATE TRIGGER "chat2LegacyDlqRedeliveryFence"
BEFORE INSERT OR UPDATE ON public."Chat2OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION public."chat2PreventLegacyDlqRedelivery"();

-- Quarantine any terminal rows created before the fence was installed.
-- This is a reversible scheduling change; no events are deleted or ACKed.
UPDATE public."Chat2OutboxEvent"
SET "nextAttemptAt" = TIMESTAMP '9999-12-31 00:00:00'
WHERE "deadLetteredAt" IS NOT NULL AND "deliveredAt" IS NULL
  AND "nextAttemptAt" < TIMESTAMP '9999-12-31 00:00:00';
