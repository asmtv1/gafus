# PostgreSQL fresh install forensic findings and implemented solution — 2026-10-11

## Cause: historical migration replay is not independently valid
Direct migrate deploy on a truly empty database failed at 20241108120000_exam_result_trainer_review because ExamResult had not yet been created. The directory contains two incompatible full init snapshots (20251030160201 and 20260104231543). A test that used Jan-2026 init as a baseline failed on the 20260306120000_backfill_password_set_at migration due to missing User.passwordSetAt and then missing Account. These are historical facts, not a failure of the new additive migration.

## Solution: guarded fresh-only bootstrap
Use packages/prisma/scripts/bootstrap-fresh-postgres.sh ONLY against an empty, expendable database. It checks for any existing public tables/views, checks the generated historical SQL objects, performs Prisma db push, atomically applies migration-only SQL features from packages/prisma/scripts/fresh-db-extras.sql, then marks existing migration history applied via prisma migrate resolve, and calls prisma migrate status.

The source-controlled SQL generator is packages/prisma/scripts/generate-fresh-db-extras.py. It reads the original ordered historical migrations without mutating them, extracts current CHECK constraints (respecting later constraint replacement), partial unique indexes, functions/triggers and required extensions. CI enforces --check and performs an actual fresh PostgreSQL 16 bootstrap.

## Real local verification
- PostgreSQL 14, isolated disposable database gafus_refactor_bootstrap_complete, socket and port 55439; no existing production data accessed.
- Fresh bootstrap returned 0 and Prisma migrate status: Database schema is up to date.
- Verified actual pg_catalog objects: 54 CHECK constraints, five custom triggers, two partial indexes.
- Verified 133 applied migration records.
- Prisma migrate diff --from-url disposable --to-schema-datamodel schema.prisma --script yielded an empty migration.
- Attempting to rerun bootstrap against same non-empty database correctly refused with exit code 1.
- Additional six selected PostgreSQL concurrency tests are tracked in TEST_RESULTS.md.

## Limitations and rollout
Existing environments MUST use prisma migrate deploy, never bootstrap. Production migration table, drift and pre-deploy backups have not been verified. The guarded fresh-only bootstrap repairs new-install viability WITHOUT retroactively fixing checksum-invalid historical SQL. GitHub's PostgreSQL 16 CI job is authored but not yet run.
