\set ON_ERROR_STOP on
-- Synthetic pre-migration Feed data. Run only on new gafus_poll_ci_* databases.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^gafus_poll_ci_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Not an isolated Feed poll CI database';
  END IF;
  IF EXISTS (SELECT 1 FROM "FeedPost" WHERE id LIKE 'stage3_post_%') THEN
    RAISE EXCEPTION 'Expected no existing test publications';
  END IF;
END $$;
INSERT INTO "User" ("id", "username", "password")
SELECT 'stage3_user_' || lpad(i::text, 4, '0'),
       'stage3_user_' || lpad(i::text, 4, '0'), 'synthetic-test-only'
FROM generate_series(1, 120) i;
INSERT INTO "FeedPost" ("id", "authorId", "clientRequestId", "status", "publishedAt", "deletedAt", "updatedAt")
SELECT 'stage3_post_' || lpad(i::text, 4, '0'),
       'stage3_user_' || lpad((1 + ((i - 1) % 120))::text, 4, '0'), 'stage3_req_' || i,
       CASE WHEN i % 13 = 0 THEN 'deleted'::"FeedPostStatus"
            WHEN i % 7 = 0 THEN 'draft'::"FeedPostStatus"
            ELSE 'published'::"FeedPostStatus" END,
       CASE WHEN i % 7 = 0 AND i % 13 <> 0 THEN NULL ELSE now() - interval '3 days' END,
       CASE WHEN i % 13 = 0 THEN now() - interval '1 day' ELSE NULL END, now()
FROM generate_series(1, 600) i;
INSERT INTO "FeedPostRevision"
  ("id", "postId", "revisionNumber", "status", "text", "clientRequestId", "updatedAt")
SELECT 'stage3_revision_' || lpad(i::text, 4, '0'),
       'stage3_post_' || lpad(i::text, 4, '0'), 1,
       CASE WHEN i % 7 = 0 AND i % 13 <> 0 THEN 'draft'::"FeedRevisionStatus"
            ELSE 'ready'::"FeedRevisionStatus" END,
       'Synthetic publication ' || i, 'stage3_rev_req_' || i, now()
FROM generate_series(1, 600) i;
UPDATE "FeedPost" SET "activeRevisionId" = 'stage3_revision_' || right(id, 4)
WHERE id LIKE 'stage3_post_%' AND status IN ('published', 'deleted');
INSERT INTO "FeedMediaAsset"
  ("id", "postId", "ownerId", "kind", "status", "thumbKey", "fullKey", "updatedAt")
SELECT 'stage3_media_' || lpad(i::text, 4, '0'),
       p."id", p."authorId", 'photo'::"FeedMediaKind", 'ready'::"FeedMediaStatus",
       'posts/test/' || i || '/thumb.webp', 'posts/test/' || i || '/full.webp', now()
FROM generate_series(1, 300) i
JOIN "FeedPost" p ON p."id" = 'stage3_post_' || lpad(i::text, 4, '0');
INSERT INTO "FeedRevisionAttachment" ("revisionId", "mediaId", "position")
SELECT 'stage3_revision_' || lpad(i::text, 4, '0'),
       'stage3_media_' || lpad(i::text, 4, '0'), 0
FROM generate_series(1, 300) i;
INSERT INTO "FeedComment" ("id", "postId", "authorId", "text", "clientRequestId", "updatedAt")
SELECT 'stage3_comment_' || lpad(i::text, 4, '0'), p."id", p."authorId",
       'Synthetic comment ' || i, 'stage3_comment_req_' || i, now()
FROM generate_series(1, 200) i
JOIN "FeedPost" p ON p."id" = 'stage3_post_' || lpad(i::text, 4, '0');
INSERT INTO "FeedPostReaction" ("id", "postId", "userId", "kind", "updatedAt")
SELECT 'stage3_reaction_' || lpad(i::text, 4, '0'), p."id", p."authorId",
       'heart'::"FeedReactionKind", now()
FROM generate_series(1, 200) i
JOIN "FeedPost" p ON p."id" = 'stage3_post_' || lpad(i::text, 4, '0');
COMMIT;
