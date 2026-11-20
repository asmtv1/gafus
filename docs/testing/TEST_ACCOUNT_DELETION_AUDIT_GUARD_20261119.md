# GAFUS — append-only audit of account deletion (local QA, 2026-11-19)

## Local result: PASS for the isolated PostgreSQL path

Tested against uncommitted working tree based on `main` `04052d616fa72f8edd2ad49f496f5c744c710fed`. This is **not** a GitHub Actions, production, migration-of-existing-database, or end-to-end browser acceptance receipt.

| Check | Result | Evidence |
| --- | --- | --- |
| `bash scripts/qa/account-deletion-rows-isolated-pg.sh` | **5/5 PASS**, exit 0 | Fresh owned PostgreSQL 18, original Prisma account deletion code, synthetic user, rollback, actual SQL trigger |
| `pnpm test:integration --scenario account.delete` | **REPORT 0** (one selected suite, five named cases) | `.qa/testing/qa-f194d972-e689-433b-a383-af0b1f965301/summary.md` |
| `pnpm test:system:contract` | **69/69 PASS** | Catalog/receipt contract validation |
| `pnpm --filter @gafus/identity-write-server exec tsc --noEmit -p tsconfig.json` | Exit 0 | Type checking |
| `node ci-cd/bootstrap/prisma-fresh/review-gate.mjs` | **14 static contracts PASS** | Frozen 163 historical migration checksums; 21 forward migrations |
| `bash scripts/qa/prisma-fresh-chain-isolated-pg18.sh` | **Exit 0** | Local fresh-only Option A: 163 historical names officially baselined on a NEW empty PostgreSQL 18, 21 subsequent migrations applied, **184 migration ledger entries / 0 failed**, two additional `migrate deploy` passes are no-op, and schema parity passes |

## Delivered change

- New forward SQL migration `packages/prisma/migrations/20261119121000_account_deletion_audit_immutable/migration.sql` installs two triggers using a shared PL/pgSQL function to forbid `UPDATE`, `DELETE` and `TRUNCATE` on `AccountDeletionAudit`.
- The real-PG row test verifies that direct SQL attempts fail and that original audit data and count remain unchanged. Existing tests still cover the owner's challenge, rollback on cleanup failure, transaction commit and account cascade.
- Disposable test setup applies the new forward trigger migration explicitly after `prisma db push`. **`db push` alone does not install SQL triggers.** The disposable database is discarded at teardown, so the test no longer deletes audit rows to clean itself up.
- Fixed a pre-existing false-success hazard in the Mac Bash 3.2 wrapper: under `set -u`, expanding an empty `extra[@]` could skip Vitest while a trailing `printf` made the process report exit 0. The wrapper now chooses the report/no-report command explicitly, so a real Vitest run is required for PASS.

## Scope and remaining acceptance

These ordinary SQL triggers are **not tamper-proof WORM storage**: a privileged database administrator can remove/disable them; external backup/retention controls are separate. No migration was applied to an existing or production database, and no `migrate resolve` was executed there. The fresh-only Option A path is **not** a clean replay of the historical Prisma migration chain on PostgreSQL 15, whose `P3018/42P01` issue remains a separate gap.

The original Web UI deletion acceptance is **still incomplete** and cannot be claimed as browser PASS. The earlier browser tool refused a synthetic confirmation-code entry; this run neither circumvented that restriction nor claimed the rest of that UI path was checked. Actual Cloud.ru/S3 object removal, Beget CDN invalidation, provider roles and real worker deployment remain unverified. Prior fake-provider Worker tests only establish local SQL queue semantics.

The iOS/Android device tests, payment provider sandboxes, GitHub CI execution and required release gates also remain open. These changes are local and uncommitted; there has been **no push, production deploy, required-gate modification or external-storage operation**.
