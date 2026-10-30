-- AG4-only disposable successful Reminder V2 Hono mixed concurrency fixture cleanup.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='12000ms';
DO $$ BEGIN
 IF current_database()<>'gafus_ag4_reminder_http_20261018'
 OR (SELECT count(*) FROM "_prisma_migrations")<>140
 OR (SELECT count(*) FROM "User")<>2 OR (SELECT count(*) FROM "Reminder")<>6
 OR (SELECT count(*) FROM "ReminderMutationReceipt")<>4
 OR (SELECT count(*) FROM "Reminder" WHERE "userId"='ag4_reminder_http_a_20261018')<>5
 OR (SELECT count(*) FROM "Reminder" WHERE "userId"='ag4_reminder_http_b_20261018')<>1
 OR (SELECT count(*) FROM "ReminderMutationReceipt" WHERE "ownerUserId"='ag4_reminder_http_a_20261018')<>3
 OR EXISTS(SELECT 1 FROM "User" WHERE id NOT IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018'))
 OR EXISTS(SELECT 1 FROM "Reminder" WHERE "userId" NOT IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018'))
 OR EXISTS(SELECT 1 FROM "ReminderMutationReceipt" WHERE "ownerUserId" NOT IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018'))
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())<>0
 THEN RAISE EXCEPTION 'AG4_REMINDER_GREEN_CLEANUP_GUARD_DENIED';END IF;
END $$;
DELETE FROM "ReminderMutationReceipt" WHERE "ownerUserId" IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018');
DELETE FROM "Reminder" WHERE "userId" IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018');
DELETE FROM "User" WHERE id IN('ag4_reminder_http_a_20261018','ag4_reminder_http_b_20261018');
DO $$ BEGIN
 IF (SELECT count(*) FROM "User")<>0 OR (SELECT count(*) FROM "Reminder")<>0
 OR (SELECT count(*) FROM "ReminderMutationReceipt")<>0
 OR (SELECT count(*) FROM "_prisma_migrations")<>140
 THEN RAISE EXCEPTION 'AG4_REMINDER_GREEN_POST_CLEANUP_NOT_ZERO';END IF;
END $$;
COMMIT;
