ALTER TABLE "DogWalkRecord" ADD COLUMN "gpsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DogWalkRecord" ADD COLUMN "gpsMeters" INTEGER;
ALTER TABLE "DogWalkRecord" ADD CONSTRAINT "DogWalkRecord_gpsMeters_check" CHECK ("gpsMeters" IS NULL OR ("gpsMeters" >= 0 AND "gpsMeters" <= 1000000));
CREATE TABLE "DogWalkTrackPoint" (
 "userId" TEXT NOT NULL,
 "walkClientId" VARCHAR(64) NOT NULL,
 "seq" INTEGER NOT NULL,
 "segment" INTEGER NOT NULL,
 "latitude" DOUBLE PRECISION NOT NULL,
 "longitude" DOUBLE PRECISION NOT NULL,
 "timestamp" TIMESTAMP(3) NOT NULL,
 "accuracy" DOUBLE PRECISION,
 "speed" DOUBLE PRECISION,
 "accepted" BOOLEAN NOT NULL,
 "reason" VARCHAR(24) NOT NULL,
 "deltaMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
 CONSTRAINT "DogWalkTrackPoint_pkey" PRIMARY KEY ("userId", "walkClientId", "seq"),
 CONSTRAINT "DogWalkTrackPoint_coordinate_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
 CONSTRAINT "DogWalkTrackPoint_distance_check" CHECK ("deltaMeters" >= 0 AND "deltaMeters" <= 1000)
);
CREATE INDEX "DogWalkTrackPoint_userId_walkClientId_segment_seq_idx" ON "DogWalkTrackPoint"("userId", "walkClientId", "segment", "seq");
ALTER TABLE "DogWalkTrackPoint" ADD CONSTRAINT "DogWalkTrackPoint_walk_fkey" FOREIGN KEY ("userId", "walkClientId") REFERENCES "DogWalkRecord"("userId", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
