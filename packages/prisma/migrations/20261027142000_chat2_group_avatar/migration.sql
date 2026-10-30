-- Group avatars use existing private chat media and its durable S3-deletion ledger.
ALTER TABLE "Chat2Conversation" ADD COLUMN IF NOT EXISTS "avatarMediaId" TEXT;
