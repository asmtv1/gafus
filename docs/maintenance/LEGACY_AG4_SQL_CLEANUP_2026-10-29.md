# Временные SQL-файлы AG4 — ревизия 29.10.2026

Область: только `apps/admin-panel/AG4*.sql` в GAFUS Refactor. SQL-скрипты не запускались.

Проверено 38 SQL-файлов. Удалено 33: не отслеживаются Git и не упоминаются напрямую среди сканированных исходников/документации.
Сценарии датированы 18.10.2026; старые fixture/cleanup/rollback/readonly пробы.
5 файлов с текстовыми ссылками оставлены, даже если ссылки могут относиться только к архивным заданиям.

## Сохранены (5)
- `apps/admin-panel/AG4_REMINDER_EXPIRED_RECEIPT_REDACT_PII_KEEP_COMPOSITE_TOMBSTONE_REVIEW_ONLY_20261018.sql` — ссылки: `packages/core/src/services/reminders/g1ReminderExpiryPII_AG4_SOURCE_HANDOFF_20261018.v1.json`
- `apps/admin-panel/AG4_REMINDER_SOURCE_DIRECT_GREEN_OWNER_EXACT_COMMIT_CLEANUP_20261018.sql` — ссылки: `apps/api/g1-reminder-idempotency-review-v1/AG1_REMINDER_P0_AG4_REALPG7_GREEN_PACKAGED_EXPORTS_SOURCE_REVIEW_HANDOFF_20261018.v1.json`
- `apps/admin-panel/AG4_REMINDER_UPGRADE_FAILED_HISTORY_EXACT_OWNER_CLEANUP_20261018.sql` — ссылки: `apps/api/g1-reminder-idempotency-review-v1/AG1_REMINDER_143_FRESH_UPGRADE_EXECUTABLE_FIX_CANDIDATES_AG4_REVIEW_20261018.v1.json`
- `apps/admin-panel/AG4_VET_AG1_SELECTONLY_ROLE_AND_OWNER_FIXTURE_20261018.sql` — ссылки: `apps/api/g1-vet-visit-detail-review-v1/AG1_VET_SELECTONLY_REALPG_HONO10_PASS_AG4_POSTCHECK_HANDOFF_20261018.v1.json`
- `apps/admin-panel/AG4_VIDEO_PAIR_SQL_3VL_CORRECTED_FRESH_NEWLINEAGE_REVIEW_20261018.sql` — ссылки: `apps/api/g1-reminder-idempotency-review-v1/ag1-off021-video-pair-schema-ddl-review.test.mjs`, `apps/api/g1-reminder-idempotency-review-v1/ag1-reminder-fresh-upgrade-history-repair-review.mjs`, `apps/api/g1-reminder-idempotency-review-v1/ag1-off021-video-pair-schema-ddl-review.mjs`, `apps/api/g1-reminder-idempotency-review-v1/ag1-reminder-144-video-3vl-realpg-regression.test.mjs`, `apps/api/g1-reminder-idempotency-review-v1/AG1_REMINDER_144_CORRECTED_3VL_POSTBASELINE_DMMF_AG4_HANDOFF_20261018.v1.json`

## Удалены (33)
- `apps/admin-panel/AG4_ACHIEVEMENTS_ACTUAL_PG_BEFORE_AFTER_SQL_20261018.sql`
- `apps/admin-panel/AG4_ACHIEVEMENTS_OWNER_FIXTURE_POST_LEASE_CLEANUP_REVIEW_ONLY_20261018.sql`
- `apps/admin-panel/AG4_ACHIEVEMENTS_SYNTHETIC_PG_ROLE_AND_SEED_20261018.sql`
- `apps/admin-panel/AG4_AG2_FEED_AUTHOR_BEFORE_AFTER_SELECTONLY_SNAPSHOT_20261018.sql`
- `apps/admin-panel/AG4_AG2_FEED_AUTHOR_POST_HTTP_EXACT_FIXTURE_CLEANUP_REVIEW_ONLY_20261018.sql`
- `apps/admin-panel/AG4_AG2_FEED_AUTHOR_READONLY_SEED_EXACT_20261018.sql`
- `apps/admin-panel/AG4_AG2_VET_INPROCESS_SYNTHETIC_FIXTURE_SELECTONLY_ROLE_BOOTSTRAP_20261018.sql`
- `apps/admin-panel/AG4_AG2_WALLET_EXACT_FIXTURE_POST_GET_CLEANUP_REVIEW_ONLY_20261018.sql`
- `apps/admin-panel/AG4_AG2_WALLET_READONLY_BEFORE_AFTER_SQL_20261018.sql`
- `apps/admin-panel/AG4_AG2_WALLET_ROLE_BOOTSTRAP_20261018.sql`
- `apps/admin-panel/AG4_AG2_WALLET_SEED_EXACT_20261018.sql`
- `apps/admin-panel/AG4_FRESH_NEW_LINEAGE_VIDEO_PAIR_REALPG_POSITIVE_NEGATIVE_ROLLBACK_20261018.sql`
- `apps/admin-panel/AG4_G05_TWO_CHECKS_SOURCE_CORRECTED_VIDEO_PAIR_FRESH_OVERLAY_20261018.sql`
- `apps/admin-panel/AG4_PROFILE_HONO_OWNER_AB_GUARDED_ZERO_CLEANUP_20261018.sql`
- `apps/admin-panel/AG4_PROFILE_HONO_TWO_SYNTHETIC_OWNERS_SEED_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_FRESH_UPGRADE_READONLY_CATALOG_QUERIES_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_PACKAGED_ADD_MODEL_SCRATCH_ONLY_TRANSACTION_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_PACKAGED_OWNER_EXACT_COMMIT_CLEANUP_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_REAL_HONO_RED_OWNER_EXACT_CLEANUP_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_REAL_HONO_RETEST_AFTER_AG1_FIX_RESEED_REVIEW_ONLY_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_REAL_HTTP_ROLE_AND_SYNTHETIC_OWNERS_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_UPGRADE140_TO143_SYNTHETIC_OWNER_PRESERVE_SEED_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_V2_RECEIPT_REALPG_ISOLATED_TRANSACTION_PROBE_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_VERIFIED_UPGRADE144_EXACT_OWN_FIXTURE_CLEANUP_ZERO_20261018.sql`
- `apps/admin-panel/AG4_REMINDER_VERIFIED_UPGRADE144_SYNTHETIC_ONLY_OWNER_PRESERVE_SEED_20261018.sql`
- `apps/admin-panel/AG4_VET_READ_ONLY_BASELINE_SQL_20261018.sql`
- `apps/admin-panel/AG4_VIDEO_FRESH_CORRECTED_NEW_DB_POSITIVE3_NEGATIVE4_ROLLBACK_20261018.sql`
- `apps/admin-panel/AG4_VIDEO_PAIR_CORRECTED_UPGRADE_140_PHYSICAL_DDL_REVIEW_20261018.sql`
- `apps/admin-panel/AG4_VIDEO_UPGRADE140_CORRECTED_EXACT_OWNER_CLEANUP_20261018.sql`
- `apps/admin-panel/AG4_VIDEO_UPGRADE140_CORRECTED_EXISTING_ROW_PLUS_3POS_4NEG_ROLLBACK_20261018.sql`
- `apps/admin-panel/AG4_VIDEO_UPGRADE140_PRE_DDL_SYNTHETIC_EXISTING_REVISION_SEED_20261018.sql`
- `apps/admin-panel/AG4_WALLET_ABORTED_GET6_OWNER_EXACT_CLEANUP_20261018.sql`
- `apps/admin-panel/AG4_WALLET_ABORT_CLEANUP_REVIEW_CORRECTED_BEGIN_NOT_RUN_20261018.sql`

**Ограничения:** Prisma migrations, тестовые базы и дампы не трогались. Поиск прямых ссылок не гарантирует отсутствие динамического использования; это очищенные архивные скрипты, не часть пакета сборки.
