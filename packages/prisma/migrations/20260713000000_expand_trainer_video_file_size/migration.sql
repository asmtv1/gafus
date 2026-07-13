-- Trainer videos may be up to 3 GiB, which exceeds PostgreSQL INTEGER.
ALTER TABLE "TrainerVideo"
ALTER COLUMN "fileSize" TYPE BIGINT
USING "fileSize"::BIGINT;
