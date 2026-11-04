-- REVIEW ONLY: execute with the candidate in ONE psql --single-transaction call.
-- Never attach this fresh-only path to an existing database or release workflow.
DO $fresh_only$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname <> 'public' AND nspname <> 'information_schema'
      AND nspname NOT LIKE 'pg_%'
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql'
  ) THEN
    RAISE EXCEPTION 'FRESH_ONLY_DATABASE_NOT_EMPTY';
  END IF;
END
$fresh_only$;
