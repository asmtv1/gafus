-- AG4 review-only reference. DO NOT run until separately approved isolated synthetic AG4 SQL scope.
-- Idempotent, bounded batch; retained owner/key prevents a second CREATE with same key.
-- No account, original reminder, legacy fallback or other table mutation.
WITH expired AS (
  SELECT "ownerUserId", "operationKey"
  FROM "ReminderMutationReceipt"
  WHERE "expiresAt" <= CURRENT_TIMESTAMP
    AND ("responseJson" IS NOT NULL OR "reminderId" IS NOT NULL
         OR "fingerprint" <> repeat('0', 64) OR "state" <> 'EXPIRED')
  ORDER BY "expiresAt", "ownerUserId", "operationKey"
  LIMIT 200 FOR UPDATE SKIP LOCKED
)
UPDATE "ReminderMutationReceipt" r
SET "responseJson" = NULL,
    "reminderId" = NULL,
    "fingerprint" = repeat('0', 64),
    "state" = 'EXPIRED'
FROM expired e
WHERE r."ownerUserId" = e."ownerUserId" AND r."operationKey" = e."operationKey";
-- Collector only observes integer affected count. NEVER log RETURNING user,key or responseJson.
