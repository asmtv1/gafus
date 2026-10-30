-- AG4 ONLY: approved candidate CHECK truth-table, no old migration edits.
-- Run ONLY in a brand-new disposable AG4 fresh-baseline clone after source pin.
ALTER TABLE "OfflineResourceRevision"
  ADD CONSTRAINT "off021_video_position_pair_ck"
  CHECK (
    ("videoLastPositionSec" IS NULL AND "videoRecordedAt" IS NULL)
    OR
    ("videoLastPositionSec" IS NOT NULL
     AND "videoRecordedAt" IS NOT NULL
     AND "videoLastPositionSec" BETWEEN 0 AND 2073600)
  );
