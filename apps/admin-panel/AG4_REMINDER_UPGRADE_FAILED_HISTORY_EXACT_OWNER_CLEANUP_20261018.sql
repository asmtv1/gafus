-- AG4 exactly owned scratch fixture cleanup only; leave failed migration ledger for forensic audit.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='12000ms';
DO $$ BEGIN
 IF current_database()<>'gafus_ag4_reminder_upgrade143_20261018'
 OR (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>140
 OR (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name='20261017090000_off021_offline_mutation_journal')<>1
 OR (SELECT count(*) FROM "User")<>1 OR (SELECT count(*) FROM "Reminder")<>1
 OR EXISTS(SELECT 1 FROM "User" WHERE id<>'ag4_reminder_upgrade_owner_20261018')
 OR EXISTS(SELECT 1 FROM "Reminder" WHERE id<>'ag4_reminder_upgrade_keep_20261018' OR "userId"<>'ag4_reminder_upgrade_owner_20261018')
 OR to_regclass('public."ReminderMutationReceipt"') IS NOT NULL
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())<>0
 THEN RAISE EXCEPTION 'AG4_FAILED_HISTORY_CLEANUP_GUARD';END IF;
END $$;
DELETE FROM "Reminder" WHERE id='ag4_reminder_upgrade_keep_20261018' AND "userId"='ag4_reminder_upgrade_owner_20261018';
DELETE FROM "User" WHERE id='ag4_reminder_upgrade_owner_20261018';
DO $$ BEGIN
 IF (SELECT count(*) FROM "User")<>0 OR (SELECT count(*) FROM "Reminder")<>0
 THEN RAISE EXCEPTION 'AG4_FAILED_HISTORY_OWNER_NOT_ZERO';END IF;
END $$;
COMMIT;
