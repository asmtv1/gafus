-- Anonymous rendition starts. Deduplicate retried requests by their client UUID.
CREATE TABLE "VideoPlaybackQualityEvent" (
  "id" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "surface" VARCHAR(10) NOT NULL,
  "platform" VARCHAR(10) NOT NULL,
  "quality" SMALLINT NOT NULL,
  "mode" VARCHAR(10) NOT NULL,
  "available360" BOOLEAN NOT NULL,
  "available720" BOOLEAN NOT NULL,
  "networkClass" VARCHAR(10) NOT NULL,
  "saveData" BOOLEAN NOT NULL DEFAULT false,
  "fallback" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "VideoPlaybackQualityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoPlaybackQualityEvent_surface_check" CHECK ("surface" IN ('moments','chat')),
  CONSTRAINT "VideoPlaybackQualityEvent_platform_check" CHECK ("platform" IN ('web','ios','android')),
  CONSTRAINT "VideoPlaybackQualityEvent_quality_check" CHECK ("quality" IN (360,720)),
  CONSTRAINT "VideoPlaybackQualityEvent_mode_check" CHECK ("mode" IN ('auto','manual')),
  CONSTRAINT "VideoPlaybackQualityEvent_network_check" CHECK ("networkClass" IN ('wifi','ethernet','cellular','unknown')),
  CONSTRAINT "VideoPlaybackQualityEvent_available_check"
    CHECK ("available360" OR "available720"),
  CONSTRAINT "VideoPlaybackQualityEvent_selected_check"
    CHECK (("quality" = 360 AND "available360") OR ("quality" = 720 AND "available720"))
);
CREATE INDEX "VideoPlaybackQualityEvent_createdAt_idx"
  ON "VideoPlaybackQualityEvent"("createdAt");
