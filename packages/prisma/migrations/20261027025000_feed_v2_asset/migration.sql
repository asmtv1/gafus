-- Refactor-only, additive in-place preparation of the existing Moments media table.
-- The WORK PostgreSQL snapshot contains user/test media; never discard existing rows or columns.
-- No new FeedV2Asset table, no old media conversion, no HLS use in application code.
-- It is deliberate that legacy HLS columns remain physically present for rollback/snapshot safety.
-- Re-running after another agent has provisioned these fields is safe.
ALTER TABLE "FeedMediaAsset"
  ADD COLUMN IF NOT EXISTS "smallKey" TEXT,
  ADD COLUMN IF NOT EXISTS "mp4Keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
