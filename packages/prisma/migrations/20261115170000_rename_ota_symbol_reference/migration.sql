-- Remove the legacy AppTracer-specific column name without discarding
-- historical evidence: new signed updates require immutable private S3 maps.
ALTER TABLE "MobileOtaRelease" RENAME COLUMN "appTracerRef" TO "symbolsRef";
