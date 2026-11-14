# GAFUS architecture — v24 locally accepted (2026-11-12)

## Scope, no deployment

Local worktree only: **no production changes, commits, merges or pushes**. Concurrent agents' uncommitted work is preserved. This report documents the completed local checks; external cloud/staging acceptance remains separate.

- **Daily course:** API owns `apps/api/src/modules/daily-course/composition/dailyCourseApplication.ts` and binds `@gafus/course-progress-server/daily-course-service` through explicit cache revision and training-duration ports. The Core daily-course SQL-facing facade is removed, while pure schemas and import parsing remain in Core. Migrated API consumers and relevant characterization tests; approved literal type-only imports through the strict application boundary.
- **Learner progress:** moved owner-scoped detailed progress policy/aggregation and its six regressions into `packages/course-progress-server/src/userProgressApplication.ts`; removed Core SQL port binding.
- **Consultation booking and slots:** moved booking composition and slot lifecycle implementation from Core into `@gafus/consultation-server/booking-application` and `/slot-service`; rewired authenticated API routes, trainer schedule composition, SLA and reminder workers. Core retains pure DTO/authorization/error policies; provider and persistence remain server-owned.
- **Concurrent integrations:** updated the strict application graph to include the anonymous public-paid-course outline and inject its pure policy via composition, without allowing runtime Core imports in Application. Do not conflate this parallel work with our own removed edges.

## Acceptance evidence

The combined staged regression `core-server-bulk-v24` ended with **33/33 gates PASS**, final durable job `a141e6f58a6f1ab03dd81ebbdf29b521223ddf407ae771fd` exited **0**. Manifest: `~/Library/Logs/gafus-refactor-regression/core-server-bulk-v24/results.tsv` (exactly 33 PASS lines). The first six successful gates were carried from the original interrupted run and full API was independently rerun; all remaining stages were rerun and final architecture checks repeated. We explicitly did **not** count the earlier canceled `SIGTERM` invocation as PASS.

- Architecture boundaries PASS, 69-workspace dependency graph PASS (zero cycles), monitoring and runtime contracts PASS.
- **61/61 builds** PASS, no cache.
- API **2,739 PASS**, 266 opt-in/skipped; Core **2,045 PASS**; Worker **261 PASS**, 13 skipped; consultation server **51 PASS**.
- Web **33/33 isolated batches**, **3,144 tests PASS**, six skipped, all **303 source test files accounted**. Independent Web run ID `core-server-bulk-v24-onlyme` and logs `~/Library/Logs/gafus-refactor-regression/core-server-bulk-v24-onlyme-web-chunks`.
- Mobile **2,742 PASS**, one skipped; trainer panel **726 PASS**; admin panel **242 PASS**.
- Monorepo TypeScript **123/123 tasks PASS** (122 cached, one executed); whitespace diff check PASS, excluding the already-existing native compressor patch.
- Additional **three disposable PostgreSQL QA gates PASS**: `consultation-catalog-isolated-pg.sh`, `consultation-eligibility-isolated-pg.sh`, `consultation-email-outbox-isolated-pg.sh`. Included trainer-scope rights, concurrent schedule updates, booking owner lock, 168h cooldown, queue ACK idempotence, six concurrent mail intent creates.

## Architecture inventory

The original 142 Core→server runtime imports now have **41 remaining / 101 eliminated**, with no new imports. During v24 the concurrent baseline was already ratcheted to 41 by another agent (`docs/audit/core-server-facade-baseline.json`); the post-acceptance guard therefore shows `41 remaining, 0 resolved, 0 new` rather than the old delta against baseline 77. Do not ratchet again without additional verified reduction. See `docs/audit/core-server-adapter-risk-inventory-20261111.md` for current categories.

## Follow-up gates / known risks

- Shared development machine: a separate Web regression concurrently used the same run ID, writing to the same directory; we terminated only our own conflicting runner and replayed Web fully under a unique ID. Add atomic run-ID lock / refusal on active collision to QA script as a future infrastructure fix.
- One earlier full-run API subprocess encountered transient `uv_cwd` and `open` EPERM and was canceled; independently retried full API PASS with exit code 0. Do not treat the canceled job as acceptance evidence.
- **41 reverse imports still need migration**, especially higher-risk account, authorization, financial, pet-write and course-progress paths. No claim of a finished 9.5/10 architecture.
- External acceptance still requires authorized staging / provider resources: actual Cloud.ru 360p failure callback, Beget CDN edge ACL fault injection, OTLP traces and alert receipt, production-shaped p95/p99 and failover, approved staging restore/rollback. These were not simulated against production.
