-- Restore unique index on PushSubscription.endpoint
-- This prevents duplicate subscriptions with the same endpoint

-- First, remove any duplicate subscriptions (keep the latest one)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY "createdAt" DESC) as rn
  FROM "PushSubscription"
)
DELETE FROM "PushSubscription" 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Create unique index on endpoint
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");
