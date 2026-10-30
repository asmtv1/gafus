-- Chat2 private-media deletion ledger persists after User, Message or Conversation cascades.
-- No FK by design; no modification to legacy Stream or production schema.
CREATE TABLE "Chat2MediaDeletionIntent" (
  "objectKey" TEXT NOT NULL PRIMARY KEY,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Chat2MediaDeletionIntent_status_availableAt_idx"
  ON "Chat2MediaDeletionIntent"("status", "availableAt");

-- AFTER DELETE also runs when PostgreSQL deletes Chat2Media through a FK cascade.
-- Running this trigger inside the deleting transaction makes the task durable:
-- either both user/media deletion and the cleanup intent commit, or neither does.
CREATE FUNCTION "chat2_capture_media_deletion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Keep Prisma timestamp(3) values UTC despite database session timezone.
  INSERT INTO "Chat2MediaDeletionIntent"("objectKey", "availableAt", "createdAt")
    VALUES (OLD."objectKey", timezone('UTC', clock_timestamp()), timezone('UTC', clock_timestamp()))
  -- If a reserved/successful upload is subsequently cascaded out, re-arm it.
  ON CONFLICT ("objectKey") DO UPDATE SET
    "status"='PENDING',"availableAt"=timezone('UTC',clock_timestamp()),
    "claimedUntil"=NULL,"completedAt"=NULL,"errorCode"=NULL;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "chat2_capture_media_deletion_trigger"
AFTER DELETE ON "Chat2Media" FOR EACH ROW
EXECUTE FUNCTION "chat2_capture_media_deletion"();
