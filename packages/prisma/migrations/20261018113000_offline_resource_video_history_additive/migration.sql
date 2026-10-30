-- AG1 review ONLY: separate additive candidate AFTER existing 143 historical migrations.
-- Requires AG4 independent verified schema/history reconciliation; not registered/applied.
-- On an isolated upgrade whose OfflineResourceRevision table lacks these columns.
-- Do not run against existing AG4 video canary where both columns/check already exist.
-- No IF NOT EXISTS, automatic migrate resolve, destructive backfill or history writes.
ALTER TABLE "OfflineResourceRevision"
  ADD COLUMN "videoLastPositionSec" INTEGER,
  ADD COLUMN "videoRecordedAt" TIMESTAMPTZ(3);
ALTER TABLE "OfflineResourceRevision"
  ADD CONSTRAINT "off021_video_position_pair_ck"
  CHECK (
    ("videoLastPositionSec" IS NULL AND "videoRecordedAt" IS NULL)
    OR
    ("videoLastPositionSec" IS NOT NULL AND "videoRecordedAt" IS NOT NULL
     AND "videoLastPositionSec" BETWEEN 0 AND 2073600)
  );
-- Existing rows acquire NULL/NULL, remain valid, and are not updated or counted.
-- CHECK allows backward seeking: lower new position with a newer revision/timestamp.
-- Revision CAS, ownership, authorization and stale-write prevention live in Core,
-- not in this column-pair CHECK. Legacy UserVideoProgress is untouched.
