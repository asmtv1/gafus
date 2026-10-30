-- GAFUS Refactor: add two AccountStorageCleanup scopes without deleting rows.
-- Release-safe schema guards: accept only the reviewed OLD or NEW exact CHECK.
-- The OLD-to-NEW transition requires the table to be EMPTY; otherwise abort
-- so a release operator can reconcile nonempty production data independently.
-- No DML, no migration resets, no changes to existing status/unique constraints.
-- Verified first against a separate local restore of the Oct 23 production dump.
BEGIN;
SET LOCAL lock_timeout = '1200ms';
SET LOCAL statement_timeout = '8000ms';
DO $guard$
DECLARE actual text;
BEGIN
  IF to_regclass('"AccountStorageCleanup"') IS NULL THEN
    RAISE EXCEPTION 'REFUSING_ACCOUNT_SCOPE_MISSING_TABLE';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO actual
    FROM pg_constraint
    WHERE conrelid = '"AccountStorageCleanup"'::regclass
      AND conname = 'AccountStorageCleanup_scope_check';
  IF actual = 'CHECK ((scope = ANY (ARRAY[''public''::text, ''gallery''::text, ''feed''::text, ''stream''::text, ''questions''::text, ''documents''::text])))' THEN
    -- Another local migration or approved deployment already applied this
    -- exact additive change. Record migration without rewriting any rows.
    NULL;
  ELSIF actual = 'CHECK ((scope = ANY (ARRAY[''public''::text, ''gallery''::text, ''feed''::text, ''stream''::text])))' THEN
    IF (SELECT count(*) FROM "AccountStorageCleanup") <> 0 THEN
      RAISE EXCEPTION 'REFUSING_ACCOUNT_SCOPE_NONEMPTY_WORK_STATE_BACKUP_REQUIRED';
    END IF;
    EXECUTE 'ALTER TABLE "AccountStorageCleanup" DROP CONSTRAINT "AccountStorageCleanup_scope_check"';
    EXECUTE 'ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_scope_check" CHECK ("scope" IN (''public'',''gallery'',''feed'',''stream'',''questions'',''documents''))';
  ELSE
    RAISE EXCEPTION 'REFUSING_ACCOUNT_SCOPE_UNEXPECTED_CHECK';
  END IF;
END
$guard$;
COMMIT;
