# Historical reminder source-only test fixtures

These four files are required by `g1-reminder-receipt-migration-history.review.test.ts` and `g1-reminder-packaged-core-review-gate.contract.test.ts` under `apps/api/src/routes/v1/`.

The `.sql` file is a **REVIEW_ONLY historical proposal**, not a Prisma migration: never execute it against a database or include it in a production migration. The `.patch`, `.json`, and `.mjs` files are read as text by the tests; they are not production runtime dependencies.

Moved from the ignored legacy agent directory so the tests can work on a fresh checkout once committed. See `docs/maintenance/API_ARTIFACT_CLEANUP_2026-10-29.md`.
