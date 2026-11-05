CREATE TABLE "DogWalkRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" VARCHAR(64) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "steps" INTEGER NOT NULL,
  "estimatedMeters" INTEGER NOT NULL,
  "timerMode" VARCHAR(12) NOT NULL,
  "incompleteSteps" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DogWalkRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DogWalkRecord_duration_check" CHECK ("durationSeconds" >= 0 AND "durationSeconds" <= 604800),
  CONSTRAINT "DogWalkRecord_steps_check" CHECK ("steps" >= 0 AND "steps" <= 2000000),
  CONSTRAINT "DogWalkRecord_meters_check" CHECK ("estimatedMeters" >= 0 AND "estimatedMeters" <= 1000000),
  CONSTRAINT "DogWalkRecord_time_check" CHECK ("finishedAt" >= "startedAt"),
  CONSTRAINT "DogWalkRecord_timer_mode_check" CHECK ("timerMode" IN ('stopwatch', 'countdown'))
);
CREATE UNIQUE INDEX "DogWalkRecord_userId_clientId_key" ON "DogWalkRecord" ("userId", "clientId");
CREATE INDEX "DogWalkRecord_userId_startedAt_idx" ON "DogWalkRecord" ("userId", "startedAt" DESC);
ALTER TABLE "DogWalkRecord" ADD CONSTRAINT "DogWalkRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
