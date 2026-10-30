# INFRA032 — supplied raw PG dump: quarantine restore → synthetic learning structure

> **SUPERSEDED FOR PRODUCTION COMPATIBILITY (2026-10-24).** This runbook's
> `local-development-quarantine-sanitize.sql` is *only* a destructive six-table
> synthetic fixture generator, not an anonymized production snapshot. It cannot
> establish compatibility with newer production migrations, statuses, payments,
> entitlements, callbacks, notifications or content-version relationships. Never
> use this script for the forward-compatibility test database; no restore or
> sanitizer execution is authorized in this review. Consult the new forward
> schema/migration matrix and privacy-gated relational-preserving design first.

**2026-10-23 | TOC + SCHEMA_ONLY_VERIFIED; RESTORE_NOT_RUN; SANITIZE_NOT_RUN; API_BOOT_DENIED.**

This applies **only** inside `/Users/asmtv1/Desktop/gafus-refactor`; the raw dump folder exists at `./gafus dump/`. Never access GAFUS Main, a remote database, production Next, cloud storage or any production secret. Do not publish/commit the raw dump, a quarantine DB, logs with data, or a database password. Do not print `COPY`/`INSERT` contents or actual note/account/payment rows.

## What is actually verified, without opening user rows

- The supplied folder contains **two regular files**, **zero symlinks**, **zero nested directories**; one PG **custom-format** `.dump` (about **4.75 MiB**) and one small auxiliary file. `pg_restore --list` succeeds offline using **local pg_restore 14.19**; dump metadata indicates **PG server/pg_dump 15.18**, archive format **1.14-0**. Metadata compatibility means TOC/schema can be read; it does **not** prove a PG14 SERVER can restore a PG15 dump. Require a scratch server with **PostgreSQL 15+** and review any extension compatibility before execution.
- TOC has **1,232 entries**, **173 TABLE definitions and 173 TABLE DATA entries**: **166 public tables** and **7 tables in `gafus_legacy_purchase_archive`**. The latter contains historical purchase data and MUST be removed wholesale from the sanitized result. Archive includes functions, triggers and an extension, so no outbound-behavior guarantee exists until those schema objects are reviewed in an isolated network sandbox.
- `packages/prisma/schema.prisma` currently has **171 models**: 165 match archived `public` table names, one additional archive-only `public._prisma_migrations` table, and **six models created later** (`OfflineMutationEffect`, `OfflineMutationReceipt`, `OfflinePreventionClientBinding`, `OfflineResourceRevision`, `PetCreateReceipt`, `ReminderMutationReceipt`) are **missing**. **DO NOT migrate or `db push` at restore time**, and do not call the imported schema ready for current API.
- Verified actual archive **schema-only DDL** contains all **63** required columns for `User`, `Course`, `TrainingDay`, `Step`, `DayOnCourse`, `StepOnDay`; no row content read or displayed. The five core structural tables plus synthetic `User` references can be reconstructed with intact course→day→step link keys and `order` after rekeying.
- `.gitignore` now has an exact-root `/gafus dump/` deny pattern; both existing raw files passed `git check-ignore`. Source was **not moved, renamed, deleted, read as rows or added to Git**.

**Repeat the allowed metadata-only check:**

```sh
cd /Users/asmtv1/Desktop/gafus-refactor
node scripts/refactor/local-development-quarantine-inspect.mjs --inspect
node --test scripts/refactor/local-development-quarantine-inspect.test.mjs
```

The CLI intentionally refuses `--restore`, `--sanitize` and other commands. It internally reads only the 5-byte `PGDMP` signature, the PostgreSQL TOC and `pg_restore --schema-only` metadata, never table records, and prints counts/guard status only.

## Standalone quarantine requirements — cannot be skipped

Before any actual restore, independently approve a **new local-only PostgreSQL 15+ instance** with no existing app/worker consumers, no external networking or extensions with network access, and a loopback-only TCP listener. Choose and verify a **fresh non-default, nonconflicting `PG_PORT`**, a unique scratch login `PG_USER=gafus_refactor_local_<name>` with NO production rights, and a **new empty database** named `PG_DB=gafus_refactor_local_quarantine_<name>`. Do not derive any of these variables or passwords from a production `.env`, the archive, or another local repo. Do not use shared PG instances/Unix socket fallback. The future server's data files and any secret material must stay inside the allowed project directory or within separately approved isolated infrastructure; no new external paths or symlinks may be used.

The currently approved **preparation** scope has NO verified quarantine server/process identity and no permission to install/start a new database/container or to run migrations. Therefore **no connection, restore, sanitize or database provisioning was executed**. A metadata-only archive and a successful static local-target preflight never establish an isolated target.

### Future-only, not executed: target identity and initial restore

```sh
# NOT AUTHORIZED YET. PG_PORT, PG_DB and PG_USER must refer to a positively
# verified NEW empty standalone LOCAL PG15+ instance and quarantine database.
# Keep passwords outside process argv, tracked files, receipts, logs and history.
# First check actual database identity in read-only mode:
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" \
  -U "$PG_USER" -d "$PG_DB" \
  -tAc "SELECT current_database() ~ '^gafus_refactor_local_quarantine_[a-z0-9_]+$' AND current_user ~ '^gafus_refactor_local_[a-z0-9_]+$' AND inet_server_addr() = '127.0.0.1'::inet AND current_setting('server_version_num')::integer >= 150000 AND NOT pg_is_in_recovery();"
# Must return exactly 't', and operator must prove the standalone process and
# that PG_DB was newly created from template0, empty and not used by any app.
# Fail shut if any prerequisite is unknown, PG15 objects/functions are not reviewed,
# or network egress isolation is not independently established.
# Only then, after separately authorized quarantine restore:
pg_restore --host=127.0.0.1 --port="$PG_PORT" --username="$PG_USER" \
  --dbname="$PG_DB" --no-owner --no-acl --exit-on-error \
  --single-transaction 'gafus dump'/*.dump
```

**Never** use `pg_restore --create`, `--clean`, `--if-exists`, `prisma migrate reset`, `db push`, `seed.ts`, shared socket defaults or `--jobs` before a new scoped approval. Restoring `public._prisma_migrations` does NOT certify current migrations/schema. If any `pg_restore` error occurs, stop and inspect only schema/SQLSTATE metadata offline; do not brute-force with higher privileges or production credentials.

### Future-only, not executed: quarantine sanitizer and release checks

`scripts/refactor/local-development-quarantine-sanitize.sql` is an **unexecuted, destructive, schema-specific review candidate**. It has an explicit single SQL transaction and fails before mutation if database/role/server are not local quarantined PostgreSQL 15+, if the table counts are not precisely `public=166`, `legacy=7`, or if unexpected schema/table dependency layouts are detected. It builds temporary random rekey maps for users/courses/days/steps/links, checks link preservation, removes the entire seven-table legacy purchase archive, truncates ALL archived public rows including `_prisma_migrations`, and inserts **only six tables** with synthetic placeholder data: `User`, `Course`, `TrainingDay`, `Step`, `DayOnCourse`, `StepOnDay`.

The target rows contain **new opaque IDs** and technical relations/order only; all user names, email/phone, original password hashes, sessions, tokens, push/mail/payment/reward/provider data, raw notes/content, images, video and external job payloads are removed from the sanitized data tables. User passwords become an invalid unloggable fixed placeholder; these are NOT real accounts and cannot be used to authenticate. Course descriptions, step content and any media fields are replaced with blanks/nulls; no production identifying values should leave the quarantine. All other public tables must be empty, no legacy schema may remain, no contact or paid/media fields may survive in the six retained tables, or the transaction aborts. The script deliberately **does not apply newer Prisma migrations**, and its SQL/trigger behavior is not yet runtime proven.

```sh
# BLOCKED until separate SQL/isolated-DB/runtime authorization AND a successful
# quarantined full restore. Never run on a dev, shared or production database.
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" \
  -U "$PG_USER" -d "$PG_DB" \
  -f scripts/refactor/local-development-quarantine-sanitize.sql
# SQL contains its own BEGIN/COMMIT; on SQL error psql exits and transaction
# rolls back on disconnect. Do not leak unredacted SQL error detail to shared logs.
```

**Separate acceptance after execution (not done):** on the same quarantined localhost PG15+ independently assert the original nonpublic purchase schema is gone, only six named public tables contain rows, all other tables including notes, payments, sessions, push, jobs and `_prisma_migrations` have zero rows, six-table FK checks are valid, media fields empty and contact fields null. Collect **only sanitized table counts and boolean predicates**, never row values; independently review remaining functions/triggers, extension ownership and networking. Archive TOC + static SQL do not prove these conditions, and raw quarantine must remain inaccessible to the Hono API.

Even after a successful quarantine transaction, **do not connect the app to this quarantine DB**. After a new explicit release/verification gate, take a **new sanitized-only pg_dump** from the now-cleansed quarantine and restore it into a newly created scratch test database, then recheck all metadata/safety conditions. Any sanitized export must remain Git-ignored within `scripts/refactor/local-development-data-inbox/` and must never be treated as production-grade anonymization until independent privacy review. The development and destructive-test databases must remain separate. No actual sanitized archive was generated in this packet.

## Precise outstanding blockers / owner unblock

| Gate owner                  | Source-backed blocker                                                                                                                                | Minimal next approval/action                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local DB/infra              | No verified standalone PG15+ local server, free dedicated port, isolated role/database, egress policy or empty catalog.                              | Approve isolated PG15+ provisioning under project-only paths, then verify actual process + read-only SQL identity and no consumers.                                                  |
| Database schema owner       | 6 Prisma models absent in dump; archive contains 7 legacy purchase tables, extension/functions/triggers; static sanitizer unexecuted.                | Review schema, FKs, DDL, extension effects; authorize quarantined-only restore and one SQL sanitizer execution; prove FK/row-erasure tests. No migrations until separately approved. |
| Privacy/data owner          | Archive contains production-derived personal/payment/media data; no prior anonymization evidence.                                                    | Independently verify synthetic-only data, erased external-effect tables, remaining functions and absence of raw identifiers before any sanitized export/release.                     |
| API/auth/queues/media owner | Existing Hono entry has Redis/media/remote side effects, no loopback guard; Web Vite is explicitly mock-only and browser auth Origin gate unchanged. | Prior approved INFRA032 local entrypoint and external-effect isolation plan must be completed separately before Hono/browser connects even to sanitized test DB.                     |

**Explicit statuses:** `CUSTOM_TOC_VERIFIED`, `SCHEMA_ONLY_COLUMNS_VERIFIED`, `GIT_IGNORE_VERIFIED`, `SANITIZER_SOURCE_ONLY_UNEXECUTED`, `QUARANTINE_RESTORE_NOT_RUN`, `DB_SANITIZED_NOT_VERIFIED`, `HONO_API_BOOT_BLOCKED`, `G3_G4_OPEN`. No production, commit, push or deploy. Never silently treat this archive as safe merely because metadata matches expected names.
