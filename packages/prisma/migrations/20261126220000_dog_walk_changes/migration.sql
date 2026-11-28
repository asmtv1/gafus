BEGIN;
CREATE TABLE "DogWalkChange" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientId" VARCHAR(64) NOT NULL,
  "version" BIGSERIAL NOT NULL,
  PRIMARY KEY ("userId", "clientId")
);
CREATE UNIQUE INDEX "DogWalkChange_userId_version_key" ON "DogWalkChange" ("userId", "version");

-- The cursor is allocated after taking the owner lock. A second writer for
-- the same owner cannot commit a larger cursor while the first is pending.
CREATE FUNCTION record_dog_walk_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gafus/walk/' || NEW."userId", 0));
  INSERT INTO "DogWalkChange" ("userId", "clientId") VALUES (NEW."userId", NEW."clientId")
  ON CONFLICT ("userId", "clientId") DO UPDATE SET "version" = EXCLUDED."version";
  RETURN NULL;
END;
$$;
CREATE TRIGGER dog_walk_created AFTER INSERT ON "DogWalkRecord"
  FOR EACH ROW EXECUTE FUNCTION record_dog_walk_change();
CREATE TRIGGER dog_walk_updated AFTER UPDATE ON "DogWalkRecord"
  FOR EACH ROW WHEN ((OLD."startedAt", OLD."finishedAt", OLD."durationSeconds", OLD.steps,
    OLD."estimatedMeters", OLD."timerMode", OLD."incompleteSteps", OLD."gpsEnabled", OLD."gpsMeters")
    IS DISTINCT FROM (NEW."startedAt", NEW."finishedAt", NEW."durationSeconds", NEW.steps,
    NEW."estimatedMeters", NEW."timerMode", NEW."incompleteSteps", NEW."gpsEnabled", NEW."gpsMeters"))
  EXECUTE FUNCTION record_dog_walk_change();
CREATE TRIGGER dog_walk_deleted AFTER INSERT ON "DogWalkTombstone"
  FOR EACH ROW EXECUTE FUNCTION record_dog_walk_change();
COMMIT;
