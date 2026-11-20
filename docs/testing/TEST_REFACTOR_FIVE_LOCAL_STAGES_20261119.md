# GAFUS — five local testing improvements (2026-11-19)

## Result

All five requested local tasks were exercised on /Users/asmtv1/Desktop/gafus-refactor, main HEAD 04052d616fa72f8edd2ad49f496f5c744c710fed. The working tree has parallel uncommitted changes. These tests **do not constitute the full ten-stage release acceptance**. No commit, push, deployment, live provider call or mandatory CI/release gate promotion was performed.

### 1. Lifecycle, parallel use and cancellation — PASS 4/4

Reproduce:

    node scripts/qa/test-owned-local-services-lifecycle.mjs

Evidence: .qa/testing/qa-local-lifecycle-322028fe-02e4-4999-8c9c-194debed2388/summary.json

Two private PostgreSQL18 and Redis pairs, distinct ephemeral localhost ports and directories, SQL and Redis cross-instance isolation. Terminating A frees only A without touching B; terminating B also releases its own data/ports. Synthetic startup failure exits nonzero and cleans up. Source: scripts/qa/owned-local-services-lifecycle.sh and scripts/qa/test-owned-local-services-lifecycle.mjs.

Only catchable SIGTERM was tested. No SIGKILL, kernel panic, Docker Compose cancellation or power-loss cleanup assertion.

### 2. Thirteen package-level test entrypoints — PASS

Regenerated inventory: **70 workspaces / 57 existing test scripts + 13 new explicit test:unit scripts / 70 with a test route**; discovered source test files 1938, but only an explicit subset was exercised. Every one of the thirteen final non-gating test:unit commands was rerun directly and passed (exit 0, ALL_THIRTEEN_FINAL_TEST_UNIT_SCRIPTS_PASS). The existing turbo test gate was separately checked with a real Turbo dry-run: 57 original executable test tasks, 13 advisory packages with <NONEXISTENT> test placeholders, and zero newly executable required tasks. Original root test:unit --package @gafus/chat-media-quality produced REPORT 0.

The 13-group local smoke: **86/86 named assertions across 18 files** passed, receipt .qa/testing/workspace-gaps-147b00c0-c33b-44ec-81b9-3c12b266a050/summary.json.

Catalog: tests/catalog/workspace-advisory-groups.json. The new test:unit routes are partial unit smoke, not every provider test. Inventory marks them advisoryUnitOnly and scripts/qa/test-system.mjs excludes them from automatic ci/full selection. The root turbo run test continues to see only the original 57 test scripts; no package test was added to it. Confirmed: new CI-required tasks = ZERO, manual unit can select 13. No mandatory release gate change.

### 3. Coverage and critical business branch assertions — measured

Run:

    node scripts/qa/workspace-coverage-advisory.mjs

V8/Istanbul output covers all eligible production .ts/.tsx files in each of the eleven Vitest-based workspace scopes, including files not imported by the selected tests; test cases and sources are checked against the inventory. **292/3234 lines (9.03%), 367/3786 branches (9.69%)**. Source scope is 11 workspaces, NOT the full monorepo. The remaining bull-board and logger Node-runner scopes are explicitly unmeasured in common Istanbul coverage, not assigned fake 100%. Aggregation sums raw counters, not per-group percentages.

Receipt: .qa/testing/workspace-coverage-ade4a769-bfaf-4dc7-a850-8e31ef55005b/summary.json

Added provider/finance boundary assertions in packages/subscription-payment-server/src/paymentRiskBoundaries.test.ts: exact identity, ownership, plan, amount/currency, pending/unpaid/refund state, active saved method and zero commission for invalid plans. Nine tests (with prior provider suite) PASS on network-blocked local stubs. For two measured finance sources: **71/178 lines, 60/167 branches**, receipt .qa/testing/payment-risk-coverage-20261119/coverage-summary.json (+ coverage-final.json and LCOV). This is a scoped measurement, NOT full money-domain coverage.

Two more tests on optional/invalid OTA revision handling were added to the existing feature flags suite: 5/5 cases pass. Previous mounted Hono, SQL account deletion and Worker checks remain separate; no new browser/native/provider acceptance is claimed.

### 4. Migration rollback/interruption — PASS 5/5

Run:

    PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa/prisma-migration-faults-local.py

Receipt: .qa/testing/qa-prisma-faults-779abee6-3049-4955-bf58-49013d24137c/summary.json

Fresh disposable PostgreSQL18, targeted SIGTERM of a single synthetic SQL client during uncommitted DDL, full rollback, deliberate error in atomic multi-statement DDL, exact duplicate replay rejected with original row unchanged. The regular historic Prisma migration chain again returned **P3018**, recorded as expected *failure*, NOT as a fixed historical bootstrap. Distinct private databases and server were completely removed, port released. Existing production/staging or default local DB were not accessed. Option A fresh-only baseline from prior work is a separate tested approach and does not fix direct historical migration replay.

### 5. CI report failure modes — PASS 11/11

Run:

    node scripts/qa/test-ci-fail-closed-local.mjs
    pnpm test:system:contract

Receipt: .qa/testing/qa-ci-synthetic-d6598c84-ca07-4af9-8ab6-eac1cb2198c3/summary.json

Real local plan/report CLI with synthetic fixtures. Valid pass succeeds; failed assertion, skip, missing JSON, missing receipt, foreign SHA, process exit mismatch, duplicate result, modified plan fingerprint fail closed. Retry pass now visibly prints and records unstableAttempts instead of hiding flakiness. **71/71 test-system contract assertions PASS**. This is NOT an execution of GitHub Actions or manual deploy; no workflow gate was altered.

## Remaining acceptance / safety

Docker engine unavailable: Compose cancellation on the actual container stand still open. Physical native Android/iOS QA, signed OTA package and revision, Apple and YooKassa sandbox verification, real S3 and CDN deletion, complete original-Chrome account deletion UI journey, and strict PostgreSQL15 historical migration replay P3018 remain open. Required GitHub CI jobs, same committed SHA and release-gate approval remain open; no legacy runner should be deleted on partial source coverage alone.

All QA reports are under ignored .qa/testing directories. There was no commit, push, deployment, account/customer mutation, external API call or modification of mandatory release gates. New source scripts remain in the dirty working tree, which means a fresh checkout of the old HEAD alone does NOT contain these improvements.

## Supplement: verified supervised SIGKILL and Turbo hash

A later local QA continuation added supervised SIGKILL and forged-owner-receipt rejection, **7/7 PASS**, and repaired Vite config inputs to the Turbo web test cache. See [TEST_REFACTOR_LOCAL_SIGKILL_AND_TURBO_CACHE_20261119.md](./TEST_REFACTOR_LOCAL_SIGKILL_AND_TURBO_CACHE_20261119.md) for before/after hashes and owned cleanup receipts. The earlier SIGTERM-only statement above reflects the first checkpoint, not the expanded test.
