\set ON_ERROR_STOP on
-- Migration regression checks. Run ONLY on isolated gafus_poll_stage/test/ci databases.
-- All fixture writes are rolled back, including the intentional cascade/deletion checks.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^gafus_poll_(stage|test|ci)[a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Refusing to run poll migration tests outside a dedicated test database';
  END IF;
  IF (SELECT count(*) FROM "FeedPost" WHERE id LIKE 'stage3_post_%') = 0 THEN
    RAISE EXCEPTION 'Pre-migration publication fixtures are required';
  END IF;
  IF EXISTS (SELECT 1 FROM "FeedPoll" WHERE "postId" LIKE 'stage3_post_%') THEN
    RAISE EXCEPTION 'Existing posts unexpectedly acquired polls';
  END IF;
END $$;

INSERT INTO "User" (id, username, password) VALUES
  ('stage3_contract_owner', 'stage3_contract_owner', 'test-only'),
  ('stage3_contract_reader', 'stage3_contract_reader', 'test-only'),
  ('stage3_contract_reader2', 'stage3_contract_reader2', 'test-only');
INSERT INTO "FeedPost" (id, "authorId", "clientRequestId", status, "updatedAt") VALUES
  ('stage3_contract_post1', 'stage3_contract_owner', 'contract-post-1', 'published', now()),
  ('stage3_contract_post2', 'stage3_contract_owner', 'contract-post-2', 'published', now());
INSERT INTO "FeedMediaAsset"
  (id, "postId", "ownerId", kind, status, "thumbKey", "fullKey", "updatedAt")
VALUES ('stage3_contract_media1', 'stage3_contract_post1', 'stage3_contract_owner',
        'photo', 'ready', 'posts/test/1/thumb.webp', 'posts/test/1/full.webp', now());
INSERT INTO "FeedPoll"
  (id, "postId", question, "isAnonymous", "hideResults", "updatedAt")
VALUES
  ('stage3_contract_poll1', 'stage3_contract_post1', 'Question 1', true, true, now()),
  ('stage3_contract_poll2', 'stage3_contract_post2', 'Question 2', false, false, now());
INSERT INTO "FeedPollOption" (id, "pollId", position, text, "imageMediaId") VALUES
  ('stage3_contract_option1', 'stage3_contract_poll1', 0, 'Photo', 'stage3_contract_media1'),
  ('stage3_contract_option2', 'stage3_contract_poll1', 1, 'Text', NULL),
  ('stage3_contract_option3', 'stage3_contract_poll2', 0, 'Other poll', NULL);
INSERT INTO "FeedPollVote" ("pollId", "userId", "updatedAt") VALUES
  ('stage3_contract_poll1', 'stage3_contract_reader', now()),
  ('stage3_contract_poll1', 'stage3_contract_reader2', now()),
  ('stage3_contract_poll2', 'stage3_contract_reader', now());
INSERT INTO "FeedPollVoteSelection" ("pollId", "userId", "optionId") VALUES
  ('stage3_contract_poll1', 'stage3_contract_reader', 'stage3_contract_option1'),
  ('stage3_contract_poll1', 'stage3_contract_reader2', 'stage3_contract_option2'),
  ('stage3_contract_poll2', 'stage3_contract_reader', 'stage3_contract_option3');

DO $$ BEGIN
  IF (SELECT count(*) FROM "FeedPollVote" WHERE "pollId"='stage3_contract_poll1') <> 2 THEN
    RAISE EXCEPTION 'Vote count mismatch';
  END IF;
  IF (SELECT count(*) FROM "FeedPollVoteSelection" WHERE "pollId"='stage3_contract_poll1') <> 2 THEN
    RAISE EXCEPTION 'Selection count mismatch';
  END IF;
  IF (SELECT count(*) FROM "FeedPollOption" WHERE "pollId"='stage3_contract_poll1') <> 2 THEN
    RAISE EXCEPTION 'Option count mismatch';
  END IF;

  BEGIN
    INSERT INTO "FeedPoll" (id,"postId",question,"updatedAt") VALUES
      ('stage3_contract_poll_duplicate','stage3_contract_post1','Duplicate',now());
    RAISE EXCEPTION 'Second poll on post was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollOption" (id,"pollId",position,text) VALUES
      ('stage3_contract_option_duplicate','stage3_contract_poll1',0,'Duplicate position');
    RAISE EXCEPTION 'Duplicate option position was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollVote" ("pollId","userId","updatedAt") VALUES
      ('stage3_contract_poll1','stage3_contract_reader',now());
    RAISE EXCEPTION 'Second vote for user and poll was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollVoteSelection" ("pollId","userId","optionId") VALUES
      ('stage3_contract_poll1','stage3_contract_reader','stage3_contract_option1');
    RAISE EXCEPTION 'Duplicate option selection was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollVoteSelection" ("pollId","userId","optionId") VALUES
      ('stage3_contract_poll1','stage3_contract_reader','stage3_contract_option3');
    RAISE EXCEPTION 'Cross-poll selection was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollVoteSelection" ("pollId","userId","optionId") VALUES
      ('stage3_contract_poll1','stage3_contract_reader','stage3_contract_nonexistent_option');
    RAISE EXCEPTION 'Unknown poll option was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "FeedPollVote" ("pollId","userId","updatedAt") VALUES
      ('stage3_contract_poll1','stage3_contract_nonexistent_user',now());
    RAISE EXCEPTION 'Unknown voter was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- Images reference the existing FeedMediaAsset; the asset FK is SET NULL on deletion.
DELETE FROM "FeedMediaAsset" WHERE id='stage3_contract_media1';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FeedPollOption"
      WHERE id='stage3_contract_option1' AND "imageMediaId" IS NULL) THEN
    RAISE EXCEPTION 'Image FK ON DELETE SET NULL failed';
  END IF;
END $$;

-- Deleting a post physically must cascade through the poll, options, votes, selections.
DELETE FROM "FeedPost" WHERE id='stage3_contract_post1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "FeedPoll" WHERE id='stage3_contract_poll1')
     OR EXISTS (SELECT 1 FROM "FeedPollOption" WHERE "pollId"='stage3_contract_poll1')
     OR EXISTS (SELECT 1 FROM "FeedPollVote" WHERE "pollId"='stage3_contract_poll1')
     OR EXISTS (SELECT 1 FROM "FeedPollVoteSelection" WHERE "pollId"='stage3_contract_poll1') THEN
    RAISE EXCEPTION 'Physical post delete did not cascade through the poll';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "FeedPoll" WHERE id='stage3_contract_poll2') THEN
    RAISE EXCEPTION 'Deleting one post deleted another poll';
  END IF;
END $$;

-- Deleting a voter removes their votes but does not delete the author's post/poll.
DELETE FROM "User" WHERE id='stage3_contract_reader';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "FeedPollVote" WHERE "userId"='stage3_contract_reader')
     OR EXISTS (SELECT 1 FROM "FeedPollVoteSelection" WHERE "userId"='stage3_contract_reader') THEN
    RAISE EXCEPTION 'Voter cascade delete failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "FeedPoll" WHERE id='stage3_contract_poll2') THEN
    RAISE EXCEPTION 'Deleting a voter removed the author poll';
  END IF;
END $$;

SELECT 'PASS: uniqueness, cross-poll FK, asset SET NULL, cascades, existing posts unchanged' AS result;
ROLLBACK;
