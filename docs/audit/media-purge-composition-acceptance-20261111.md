# Media CDN purge: Core port migration and local acceptance (2026-11-11)

## Scope and safety

Only `/Users/asmtv1/Desktop/gafus-refactor` was changed. `gafus1`, production,
Cloud.ru Jobs, live CDN and staging were not modified. The working tree contained
pre-existing and concurrent uncommitted changes; those were not reset or committed.

## Architecture

- `services/mediaDelivery/purgeQueue.ts` keeps a pure policy and a typed,
  transaction-scoped `EnqueueDeletedMediaPurge` port instead of reexporting SQL.
- Feed and Gallery Core state machines accept the required purge writer through
  constructor/context dependency injection. Their production composition in
  `feed-server` and `gallery-server` supplies the existing idempotent PostgreSQL
  implementation. The write still takes place in the *caller-owned transaction*
  after the S3 deletion check and before completion ACK; the callback does not
  dispatch a third-party request while holding the DB transaction.
- Real application/test factories were adjusted (25 direct callsites), including
  the local Gallery Cloud harness. `gallery-cloud` has an explicit direct package
  dependency for that harness; the shipping Cloud Jobs continue to exclude
  Prisma and other forbidden infrastructure from their isolated bundles.
- The Feed negative regression ensures a rejected purge writer does not produce
  terminal completion, without falsely forbidding a preceding lease heartbeat.
- `gallery-storage/scripts/build.mjs` now emits TypeScript declarations to a
  per-build temporary directory with `finally` cleanup. This prevents concurrent
  rebuilds from deleting each other's shared `.types` artifacts; the prior
  failure was `ENOENT .types/gallery-storage/src/cdn.d.ts`.

The Core -> server scanner initially showed 91 edges for this continuation.
This migration eliminated 2, yielding 89. The **frozen ratchet now contains 89**;
while other work proceeded concurrently, the scanner subsequently reported
**88 actual / 1 newly resolved / 0 new**. The newer independent migration is
**not certified by this receipt** and this task did not rewrite the shared
frozen baseline on its behalf. Do not claim all Core -> server dependencies are
removed.

## Verified terminal receipts

- `media-purge-v14` full regression: **FAILED** at forced build,
  `gallery-storage#build` (missing transient `.d.ts`); retained as evidence.
- `media-purge-v14b` **PASS, exit 0**: all **33/33** independent gates, including
  61/61 uncached build tasks, architecture and package graph with 0 cycles,
  monitoring, API, Core, Worker, all server packages, Web, Mobile, trainer/admin
  panels, root typecheck and whitespace.
- Core: **2130 passed** (143 conditional skips); API: **2677 passed**
  (266 skips); Worker: **217 passed** (13 skips).
- Web: **3144 passed / 6 skipped**, with all 303 source test files accounted for.
  Mobile: **2742 passed / 1 skipped**. Trainer: **726 passed**. Admin: **239 passed**.
- Root typecheck: **123/123 tasks PASS** (90 cached). The independent
  `@gafus/gallery-cloud` build/typecheck produced isolated maintenance/job
  bundles of 704192/704383 bytes with no forbidden Prisma imports.
- `architecture-chaos-local.sh media-purge-v14b`: **5/5 PASS, exit 0**;
  isolated PG18 concurrent claims, leases, fencing, DLQ and transaction
  semantics; separate Worker ACK/killed-process replay; local Redis/BullMQ
  unknown Cloud ACK; phase-F PostgreSQL policy/ACL/CAS; local DB backup/restore.
- SHA-256 of the 8 main modified implementation/build files was checked again
  after the acceptance run, unchanged despite concurrent edits elsewhere.

Logs and stage receipts:
`~/Library/Logs/gafus-refactor-regression/media-purge-v14b/results.tsv`
`~/Library/Logs/gafus-refactor-regression/media-purge-v14b/chaos-results.tsv`
`~/Library/Logs/gafus-refactor-regression/media-purge-v14b-web-chunks/`

## Not accepted / remaining

The plan is **NOT fully implemented or independently rated 9–9.5/10**.
Around 88 actual Core -> server reverse dependencies remain, including
security-sensitive auth/economy/ACL/transactional facades. These require
explicit ports, service composition, owner/authorization checks and regression
before they can safely be removed. Concurrent work touched the Notes domain
while these receipts were produced, so the record does not claim a frozen
checkout or certify that separate change.

Six staging/provider-dependent acceptance categories remain unverified:
complete HTTP/Application migration and typed error mapping; real Cloud.ru
360p unknown-ACK/reconciliation; searchable production-like OTLP traces and
live alert delivery; Beget edge 403/404/ACL; multi-instance load and SLOs;
staging database restore/release/rollback. Synthetic, local PASS is not a
substitute for the external gates. Production remains unchanged until separate
approval, per the original plan.
