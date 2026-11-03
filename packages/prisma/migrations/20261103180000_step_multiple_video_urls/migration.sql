-- Additive ordered attachments, preserving existing Step.videoUrl values.
ALTER TABLE "Step" ADD COLUMN IF NOT EXISTS "videoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
