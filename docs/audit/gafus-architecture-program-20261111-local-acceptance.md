# GAFUS architecture program — 11 November 2026 local verification

## Safety and scope

- Workspace: `/Users/asmtv1/Desktop/gafus-refactor`, branch `main`, with a large **pre-existing dirty working tree**. Do not reset, clean, overwrite or commit unrelated files.
- The original `/Users/asmtv1/Desktop/gafus1` and all production services, schemas, Cloud.ru Jobs, CDN configurations and monitoring provider settings were **not changed**.
- These are **local changes only**, pending a separately approved deployment. Passing local tests does not install dashboards or alert rules into the remote evaluator.

## Reconciled architecture baseline

- `scripts/check-architecture-layers.mjs` detects **zero direct Core → Prisma imports**. After the cross-platform regression completed green, the frozen baseline was safely ratcheted **24 → 0**; follow-up boundary check now reports **0 existing / 0 new**.
- `scripts/check-workspace-graph.mjs` reports **65 projects, zero dependency cycles**.
- Importing the ORM from Hono routes, importing infrastructure in explicit `domain/` or `application/` paths, bypassing exported subpaths and newly introduced workspace cycles are checked by existing CI guards.
- Import debt is **not truly zero**: the Core package still contains **142 direct imports/re-exports of server adapters** across transitional compatibility facades. The new `scripts/check-core-server-facades.mjs` ratchets these imports against `docs/audit/core-server-facade-baseline.json` and prohibits new server dependencies within real Domain/Application paths. These are deliberate technical debt, not evidence of a clean inward-only dependency graph.
- Several production Core facades still expose transaction-oriented interfaces. Do not treat removing Prisma imports alone as independent domain logic; replace these with narrow ports when clients migrate off compatibility exports.

## Observability, media and Worker updates in this checkout

- Hono request middleware issues a trusted unique `requestId` and `operationId` for every request, accepts only valid W3C `traceparent` and emits an independent `X-Request-Id` header. HTTP spans are correlated with all IDs without user-input IDs as metric labels.
- Chat2 Worker publishes process-local `job_attempts_total`, `job_failures_total` and `job_duration_seconds` metrics with fixed labels; lease-loss/retry/dead-letter outcomes are separately visible. No raw failure message or PII enters metric labels.
- Alloy forwards these metric families, Grafana provisions API and Media/Chat views, and the Prometheus rule file includes a volume-and-ratio-gated retry storm alert. **Remote alert evaluation was not invoked**; check the provider's rule evaluator and notification routing before relying on these alerts.
- Existing Chat2 outbox continues to use transactional enqueue, fenced claims and leases, bounded backoff, DLQ and manual admin retry. Existing 720p availability and delayed 360p recovery behavior remains unchanged; do not dispatch remote Cloud.ru Jobs during local verification.
- Turbo `prisma:generate` is now non-cacheable, because pnpm generates Prisma Client in its shared virtual store outside the declared Turbo output root. Its input is the actual `packages/prisma/schema.prisma`, not an incorrect nested path.
- A mounted API training-day test now mocks the Feed Redis connection explicitly instead of accidentally opening or requiring an active Redis client. A new consultation-write package suite tests date, availability, booking replay and idempotency input validation without DB connections.

## Reproducible local test commands

```sh
pnpm check:core-boundaries
node scripts/check-workspace-graph.mjs
node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
pnpm exec turbo run build --filter=@gafus/api... --filter=@gafus/worker... --filter=@gafus/web-vite... --force
bash scripts/qa/architecture-final-regression.sh architecture-20261111
```

Durable run logs and per-stage PASS/FAIL receipts are stored under
`~/Library/Logs/gafus-refactor-regression/architecture-20261111-v2/`.
Web's exhaustive per-test-file receipts are under the matching `-web-chunks/`
directory. Do **not** infer success from a queued/running job: check the final exit code and all stage receipts.

The native compressor patch has pre-existing trailing whitespace, so the regression script excludes only `patches/react-native-compressor@1.16.0.patch` from its whitespace gate; this does not certify that native patch and does not rewrite it.

## What does *not* constitute 9.5/10 acceptance

The earlier 18-scenario matrix had 12 PASS and 6 PARTIAL before this continuation; the latest local tests may refine individual claims but cannot turn **external** tests green. The unresolved gates are:

1. All important HTTP routes go through Application, with no hidden Core→server orchestration dependencies, and consistent typed error translation in each route.
2. Real Cloud.ru 360p Job execution, ambiguous ACK and callback/reconciliation under a failure, verified against a separately approved isolated cloud environment.
3. Complete operationId trace search across API/Worker/Cloud callback in a configured OTLP collector, with real alert delivery and retention.
4. Combined Beget edge CDN 403/404 injection and ACL denial, not just local MinIO/proxy mocks.
5. Production-like concurrent API/Worker load, failover and measured p95/p99 baseline against a comparable environment.
6. Approved staging database restore with measured RPO/RTO, controlled deployment, rollback, feature flag and alert drill.

The user's attached plan **explicitly forbids production changes until separately authorized**. No production, third-party cloud execution or public CDN mutation is to be used as a shortcut to claim green acceptance. The numeric rating remains **unverified** until those gates and the remaining architectural debt are resolved.


## Completion receipts — local CI, recovery and recovery drills

The first two end-to-end runs revealed and led to fixes of the test-only Redis port mock and the missing `consultation-write-server/vitest.config.ts`. Their **original FAILED receipts are retained**; no failed run is relabelled as PASS. The corrected run is split between completed phases, with exact logs and exit codes:

| Gate | Confirmed result |
| --- | --- |
| Boundary checks after baseline ratchet | 24/24 tests PASS; 0 Core direct ORM exceptions; 142 frozen server-adapter facades, 0 new |
| Workspace dependency graph | 65 projects, 0 cycles |
| API/Worker/Web forced build | 57/57 uncached build tasks PASS; Prisma Client generator warning eliminated |
| Monitoring contract | 3/3 PASS; Grafana JSON parsed/checked |
| Core test suite | PASS (`test-core.log`) |
| API test suite | PASS (`test-api.log`), including previously failing mounted Redis mock |
| Worker suite | PASS (`test-worker.log`) |
| Course-progress, identity-write, media, pets, questions, notifications, subscription-finance | PASS in their individual `test-*.log` files |
| Consultation-write suite | 7/7 PASS after test configuration added |
| Web full per-file test registry | 3144 PASS / 6 intentional SKIP, all 303 test files accounted |
| Mobile full suite | 2742 PASS / 1 intentional SKIP, 360 test files accounted |
| Trainer panel | 726 PASS |
| Admin panel | 239 PASS |
| Root TypeScript typecheck graph | 115/115 successful tasks (50 from cache), PASS |
| Whitespace (excluding only prior native compressor patch) | PASS |

- Completed main full-pass continuation job: `b2725596f4aeb5dc391d9db54130dfc8bdbe6889aabf4071` **exited 0**, with receipts `architecture-20261111-v2/results.tsv`. Earlier `eb541f765523b741ffb6f3e700624f1e486f1fed2c27acc2` had a failure limited to consultation-write test configuration, which was fixed and rechecked in the continuation.
- Isolated, actual-process chaos test job: `54b92bcbf740ab6c2f7a7af9daaac9ee5f4c0c5c09d7de82` **exited 0**. `architecture-20261111-v2/chaos-results.tsv` confirms **5/5 PASS**: PG18 8-way concurrent claim + lease takeover/stale-owner fencing/DLQ/rollback/commit; separate actual Worker processes with ACK-then-kill/recovery; isolated Redis/BullMQ unknown Cloud ACK replay safety; separate PostgreSQL transaction/CAS/owner/scheduler exercises; actual local backup and restore.
- These checks are **local** with synthetic actors, isolated PG18/Redis and a fake broker/provider. They DO NOT establish the six external gates below.
- No deployment, commit, push, production data access, production Cloud Jobs or legacy app changes occurred.

## Remaining implementation and acceptance work

The documented program is **not fully complete**, and the project must **not** be certified at 9–9.5/10 yet. Follow-up work is concrete:

1. Gradually move the **142 server-adapter imports** still originating from Core compatibility facades into API/Application composition roots or narrow injected ports, with business-policy tests and explicit transaction fences; don't hide them by weakening the static check. Also move direct `@gafus/prisma` package dependencies from runtime to test/dev only after consumers and lockfile changes can be safely reviewed.
2. Expand tracing to every critical API/domain/outbox/cloud callback, and DB/dependency instrumentation as specified by the plan. Server-to-server telemetry, especially live OTLP queryability and remote alert delivery, still needs a verified collector and monitoring route.
3. Cloud.ru 360p reconciler must be validated against actual Job/callback behavior, including unknown-ACK lookup, and Beget CDN edge ACL must be tested against a controlled staging edge; local fake Cloud provider cannot prove these.
4. Run SLO/p95/p99 baseline load under production-like multi-instance API/Workers and verify migrations, rollback, remote backup restore (measured RPO/RTO), and release flags on a separately authorized staging environment.

These are tracked as **PARTIAL / externally gated**, not passed by inference. Separate approval for staging/provider access and a follow-up production release decision is necessary. Current production stays untouched.

## Follow-up: Core → server port migration (AQ–AS, 11 November 2026)

This section supersedes the historical **142 remaining** figure above. The
historical starting snapshot remains immutable at
`docs/audit/core-server-facade-initial-20261111.json`, with a per-import
risk/shape/file inventory in
`docs/audit/core-server-adapter-risk-inventory-20261111.md`.

### AQ — 20 eliminated, previous complete regression accepted

- **First 14:** obsolete Core facades for achievements, admin reengagement/ads,
  mobile intro retired. API admin analytics now has a thin application read
  contract, server composition, and role-preserving Hono transport. Achievements
  statistics DTO belongs to `@gafus/types`.
- **Another 3:** tracker facade, expired reminder PII redaction facade and exam
  retention facade retired. Feature flags Core facade intentionally **retained**
  because eight active Core consumers still require a proper port migration.
- **Another 1:** chat display role uses a pure paid-entitlement read port bound
  in identity-write-server.
- **Another 2:** Gafus status/settings use explicit SQL-read ports bound by
  API composition. These retain owner-scoped balance, activity aggregation,
  rolling earning window and fixed economy price policy.
- Observability: API `X-Request-Id` and `X-Operation-Id`, nested bounded
  use-case spans, Worker outbox push/publish/media cleanup/DB-ACK child spans,
  fixed low-cardinality attempts/errors/histograms and dashboards/alerts.
- The previously running full local job
  `1a3ed1e658f6e446eec18c523f11bab0fe454885a91c0cc5`
  **EXITED 0**. Exact evidence:
  `~/Library/Logs/gafus-refactor-regression/architecture-20261111-ports-v2/results.tsv`:
  23/23 gates PASS, 57/57 uncached builds, 115/115 typechecks, Core
  2114 PASS, API 2661 PASS, Web 3144 PASS/6 SKIP (303 files accounted),
  Mobile, trainer/admin panels PASS, whitespace PASS.
- Physical package-export checks
  `8f8c30a0e99ff079816108e46087d8386e5d8e86b514059c`
  also **EXITED 0**. All evidence is local; not staging certification.

### AR — course/video read ports, 2 further edges eliminated

- Video policy in `packages/core/src/services/video/videoAccessService.ts`
  now takes a narrow `VideoAccessReadPorts` interface; API module
  `modules/video/composition/video-access.ts` connects the existing
  course-read-server projection and Core course-step entitlement. No data is
  read through a client-provided actor; a reused TrainingDay cannot confer
  another course's access. The 7 new policy tests and 135 relevant API tests
  PASS; full API/Core tests also PASS with exit-0 job
  `d2bdc22255a436c277a05441c703c820df73c1528a73e563`.
- The editor's Core snapshot reader has an explicit read port; API
  `modules/trainer-courses/composition/editor-snapshot-port.ts` binds the
  unchanged database-backed single-transaction REPEATABLE READ reader.
  HTTP contract tests 18 PASS, source architecture list 74 PASS including
  negative checks for severing the SQL snapshot port; API module targeted
  suite 132 PASS. Core real-PG tests bind the same explicit reader.
- No relaxation of owner/role/access checks. The editor's activation/feature
  flags remain unchanged.

### AS — pure billing rules, 5 more edges eliminated

- Created **`@gafus/subscription-shared`** and moved source implementations
  of five pure modules: `appleEnvironment`, `paymentPure`, `plans`,
  `profitMath`, `promoCode`. Server package retains the existing export
  subpaths and re-exports identical functions; Core imports the shared
  policy directly. Payment state SQL, live Apple/YooKassa verification,
  finance locks/refunds, consent and idempotency are unchanged.
- Shared package: **5/5** policy/source-boundary tests PASS; server compatibility
  exports: **2/2** tests PASS; Core subscription + registration relevant
  tests: **266 PASS / 13 opt-in SKIP**. API/Core/Worker targeted typechecks
  PASS. Frozen offline pnpm install and 66-package/0-cycle graph PASS.
- OTLP collector receives bounded trace metadata (**2/2** local tests).
  Isolated real local PostgreSQL+Redis+Centrifugo Hono/Worker Chat2 E2E:
  **6/6 PASS**, verified event `operationId` equals HTTP
  `X-Operation-Id`; durable job
  `5b76765501cec1206beceadc9d57793b571f28185b25f6a7`
  **EXITED 0**. Does not validate remote tracing or production brokers.
- Ratchet before final broad regression: **115 remaining / 27 resolved /
  0 new**, from the initial 142. Core direct Prisma imports: 0. The
  complete AR–AS cross-platform job is
  `78bc3e829910800cca53cffa8d5a9b09cf99857473b11ac9`
  and its verified results must be added **only after** it exits zero.
- No prod/staging/legacy gafus1 changes, no git commit or push.

### Still open

The 115 remaining backward Core→server imports are **real debt**, not
automatically safe to delete. Next batches: isolate Core consultation query
reads/write ports with the existing PostgreSQL booking transaction, and
separately the course/read and trainer AI adapters, retaining owner checks,
retry/readback, paid entitlement and current-role authorization. Do not
declare full architecture completion on source-only import counts. Six
external/staging gates remain blocked until specifically authorized
environments and real-provider/edge operations exist.

### AT — owner-scoped Pets read and Notification boundary (11 November 2026)

- In `packages/core/src/services/pets/petsReadService.ts`, the Core policy now
  receives narrow read callbacks instead of importing `pets-server/pet-reads`.
  The registered API `modules/pets/composition/read-pets.ts` supplies the
  existing `readOwnedPets` and `readOwnedPetDetail` SQL projections. Both
  projections require the authenticated owner; no client-selected owner
  parameter or unscoped `findUnique` has been introduced. The historical
  lenient empty-list fallback remains for Web callers; strict Hono reads
  still rethrow database errors without logging owner IDs or private messages.
  New pure Core port tests: **4/4 PASS**. API strict composition gate:
  **75/75 PASS**, including new negative fixtures for a substituted unscoped
  SQL reader and for an unknown read port.
- Three redundant Core notification re-export leaves
  (`immediatePushService`, `stepNotificationService`, `pushWorkerService`)
  were removed; API and Worker now use the already-compiled
  `@gafus/notifications-server` contract directly. The durable runtime
  implementation and stable server package exports were not rewritten.
  Core's existing public notification root is temporarily retained, since
  Core notes, consultation and exam policies still need explicit callback
  composition before that final edge can be removed.
- Pet-prevention reminders no longer import push implementations even through
  the Core notification barrel. An explicit `PetPreventionPushPort.enqueue`
  is passed from the Worker composition. The previous Moscow-time reminder
  scheduling, deduplication and acknowledgement only on `queued:true`
  remain enforced. Core notification/pet-prevention/exam/booking focused suite
  **116 PASS/2 opt-in SKIP**, targeted API **142/142 PASS**, targeted Worker
  **15/15 PASS**; Core/API/Worker TypeScript gates PASS.
- This batch removed **4** transitional Core→server source imports,
  reducing the open count from **115 to 111** without new imports.

### AU — Questions immutable schemas/error contracts (11 November 2026)

- Moved the actual Zod question/answer/create/update/report schemas and the
  shared `QuestionError` class/HTTP mapper into
  `@gafus/questions-shared`. Core no longer imports two SQL-server
  compatibility subpaths, while `questions-write-server/errors` and
  `questions-write-server/schemas` remain stable re-exports.
- No SQL write path, photo owner binding, idempotency UUID, encrypted media
  locator, transaction or cleanup worker was changed. Validation retains
  duplicate-photo and max-attachment restrictions; unknown provider errors
  never serialize raw exception messages or secrets to HTTP.
- New shared-contract tests **4/4 PASS** and exact exported
  class/schema-object identity tests in the write server **2/2 PASS**.
  Core Questions **13/13 PASS** and Questions Server **32 PASS/22 opt-in
  SKIP**. Package builds and API/Worker TypeScript checks PASS.
- Updated mandatory physical pnpm runtime-export checks to include the two
  new shared-contract packages and their seven named entrypoints. The
  preserved legacy payment-server package still re-exports its existing
  Apple/promo/finance-facing paths.
- Initial immutable inventory: 142; current **109 remaining / 33
  eliminated / 0 new**, workspace **67 packages / 0 cycles**.
  The full uncached cross-platform regression job for these batches is
  `8814ee5e6b1dea9be32d7a2d2c6b909161b159ad64143f60`.
  **Do not mark this job PASS or ratchet the mutable baseline until its
  exit_code=0 and all results.tsv gates have been confirmed.**
  A separate physical runtime-negative-fixture job:
  `d3ba74e5ec35cf7e0e3ec2db664db0130cdb71ec9734163f`,
  likewise pending at documentation time.
- These are local working-tree changes only: no production/staging, git
  commit, push or legacy `gafus1` modifications. Six external/staging
  gates from the original architecture acceptance matrix remain PARTIAL.
### AV — Article like entitlement port (11 November 2026)

- Core articleLikeService now takes the narrow ArticleLikePorts read/write contract instead of importing article-server/likes. The API composition binds the existing articleExists query and advisory-locked toggleArticleLikeAtomic transaction; server public exports are unchanged.
- Existing actor/article/platform paywall remains before any mutating SQL. The API preserves 200/402/404 error codes, private caching and JSON DTO. Core 5 PASS; API route 11 PASS; API composition 2 PASS. Core build and API typecheck PASS.
- Disposable real PostgreSQL18 receipt b26fa1b0a3135210ab5934d17c2fdd1eda558fb4adeb687d EXIT 0: 12 concurrent pair locks, 6/6 toggles, composite PK, owner isolation and stale author rejection.
- The related facade import count dropped by one: 142 original, 108 remaining before the next batch.

### AW — Independent pure Pet media deletion policy

- Extracted the complete 152-line owner/provider/lease/deduplication policy into a new ORM-free **@gafus/pets-shared** package. The old **@gafus/pets-server/pet-media-deletion-outbox** endpoint still reexports identical functions; Core now references only pets-shared. No SQL claim/CAS logic or provider implementation was changed or enabled.
- Retained explicit denial of unsafe or foreign locators, denied activation of legacy Yandex media deletion, SHA-256 stable deduplication, current-token fencing, owner lock and retry/backoff. Core policy 18 PASS; shared policy 4 PASS; server legacy export identity 1 PASS; Core, pets-server and pets-shared builds plus API/Worker types PASS.
- The physical pnpm production runtime guard now enforces all three shared packages and eight extra named export paths, API 37 packages / 219 compiled JS/DTS, Worker 36 / 209. New 256-test physical negative fixture job 83929934244d52058ddd18cef78615e3de224d9f6788fd0c pending final exit receipt.
- Local PG18 confirmations: Pet read 2c58d8fc589dd4a06b2ce8d1bff0220ca0aef5b555a04a1d EXIT0; Pet row transaction 51508ff5c523f77cdacd521e39ab8d1ff82fb624c6dba1cb EXIT0; Media outbox concurrency cf3d4a31def1211cb4c2542bee6fb8f1f23dedbaddaf3bce EXIT0.
- Failed full v4 and v5 receipts are retained: v4 failed five stale API arity assertions, fixed and 28/28 retested; v5 passed forced build, Core, API, Worker, domain packages and Web 3144/6, but failed six old Mobile arity assertions in two files, fixed with 35/35 targeted Mobile PASS.
- Follow-up full AR-AW matrix job c4706d001770e4ea94ea2d0101496be9a75e92f959aaf578 with results architecture-20261111-ports-v6/results.tsv. Do NOT declare PASS or ratchet the mutable baseline until verified exit 0.
- Original inventory currently **107 remaining / 35 eliminated / 0 new**; **68 workspace packages / 0 cycles**. Six genuine external staging/provider gates remain PARTIAL, no production, staging, legacy gafus1, commit or push.


### AX–AZ — Recovery, Feed/Gallery shared boundaries and pet-prevention ports (11 November 2026)

- **Recovered immutable results:** ports-v5 Web: 3144 PASS/6 SKIP; Mobile: 6 previously failing argument-arity tests. ports-v6: 60/60 uncached builds; Core/API/Worker/Web/Mobile PASS; trainer had 4 stale Pets mock-signature assertions. Patched the exact mocks; replayed full trainer-panel (726/726 PASS), full admin-panel (239/239 PASS), and monorepo typecheck (121/121 PASS) in recovery job 944dedbb96cd2fc5e6023efd4343fc0f84eb120a5bd22c78 (exit 0). A combined recovery receipt is stored separately; historical failed run receipts remain unchanged.
- **Frozen historical checkpoint:** 107 Core-to-server edges at completion of the recovered cross-platform baseline; no new edges and zero workspace cycles. The user-specified 109 was a previous count, superseded by the Article and Pet shared-policy migrations already present in the active source tree.
- **Feed/Gallery typed contracts:** copied the single source of FeedDb, GalleryDb, typed projection rows and immutable FEED_POST_INCLUDE / FEED_AUTHOR_SELECT into @gafus/media-shared/media-db-ports. The stable public @gafus/media-server/media-db-ports export now re-exports the identical objects. Core Feed/Gallery references point exclusively to media-shared; four backward import edges resolved without changing any DB query or ACL. Shared-port structural/identity tests passed, Core Feed/Gallery 211 PASS/62 opt-in SKIP; 61 uncached API/Worker/Web dependency builds and 123-task typecheck passed.
- **CDN purge path policy:** moved the pure allowlist/duplicate elimination/count guard to @gafus/media-shared/purge-paths. Kept enqueueDeletedMediaPurge and its transactional SQL strictly in @gafus/media-server/deleted-media-purge. Existing server export and function identity preserved. Added negative tests for legacy HLS, private sources, foreign provider URLs, signed strings and >1024 entries. Core and server outbox tests passed. Physical runtime package+JS+DTS negative fixture suite: 260/260 PASS, job ee96319043f5856457bde185dd901bfd1008fac72d38db0b exited 0.
- **Pet-prevention read/ACK:** Core reminder selection now accepts exact readDue, acknowledge and enqueue ports from Worker composition rather than importing @gafus/pets-server/prevention-reminder-rows. No adjustment to Moscow-time scheduling, ownership, reschedule CAS, or queued-only ACK semantics. Core targeted tests and Worker composition contracts PASS. Isolated real PostgreSQL with deliberately non-UTC server confirms foreign owner and stale schedule cannot ACK; queued=false does not mark delivery; queued=true commits the exact owned reminder. See /tmp/gafus-prevention-ports-real-pg.log.
- Historical original frozen risk inventory remains 142. On the source after these batches, **101** edges remain, **41** eliminated, **0** introduced; 69 projects, 0 cycles. The mutable ratchet previously frozen at 107 will be updated only after final regression gates finish.
- All changes are LOCAL ONLY; no production/staging changes, push, commit, or legacy gafus1 edits. The original six external/provider staging gates remain PARTIAL and are not treated as successful local tests.

### BA — Trainer AI runtime ports and role-locked transactional composition (11 November 2026)

- Removed both runtime imports of `@gafus/trainer-ai-server/persistence`
  from Core Trainer AI. The Core factory `createTrainerAIService` owns staff
  role, bounded history pagination, stable chronological history DTOs and
  atomic-exchange contract. `createTrainerAISettingsService` owns model and
  exact target identity validation; neither imports a SQL provider.
- The API composition `apps/api/src/modules/trainer-ai/composition/trainer-ai.ts`
  binds seven unchanged SQL adapter methods and the config write port. A
  Core export subpath `@gafus/core/services/trainerAI` and explicit API
  dependency on `@gafus/trainer-ai-server` were added. Existing server
  package exports remain exactly unchanged. No hidden global mutable
  repository or Web/Mobile SQL imports were introduced. These API composition
  exports currently have no separate live Trainer AI Hono route consumers;
  do NOT claim a live UI route migrated on the strength of source tests.
- Core Trainer AI tests **14/14 PASS**, API composition **4/4 PASS**,
  unchanged server adapter **10/10 PASS**. Real isolated PG18
  `scripts/qa/trainer-ai-owner-isolated-pg.sh` EXIT0 checks current-role
  revocation, atomic two-message exchange rollback after a deliberately
  rejected second INSERT, configuration owner/current-role checks and API-key
  redaction in settings summary. Its smoke was updated to import the actual
  API composition instead of the retired Core function signature.
- Forced dependency builds **57/57 PASS**; monorepo typecheck
  **123/123 PASS**, source architecture gate and workspace graph PASS, job
  `d2a6865f2a8ed0bf122d5051a16cb5e6a68937086fe18644` EXIT0.
- Frozen Core server-adapter ratchet updated **101 → 99** only after all
  those checks; historical 142 inventory is unchanged.

### BB — Owner-scoped PetVetVisit detail read port and shared error identity

- Removed the Core direct re-export from
  `@gafus/pets-server/vet-visit-detail`. The pure
  `g1VetVisitDetailRead.review.ts` now requires an explicit
  `VetVisitDetailReadPort` with authenticated ownerId+petId+visitId
  parameters. Invalid IDs fail with stable masked 404 before hitting SQL.
- Moved the shared `VetVisitDetailNotFoundError` class into the existing
  `@gafus/pets-shared/vet-visit-error`. The server adapter re-exports that
  exact class instance (not a second similar class), preserving its
  stable public server package API. Both mounted wildcard and source-only
  detail Hono routes now bind the existing SQL adapter via
  `modules/pets/composition/vet-visit-read.ts`. The shared Core HTTP
  transport retains private no-store headers, query/ID validation and a
  scrubbed 500 on unexpected DB/provider failure; an absent detail port
  fails closed, never returns an empty record or skips authorization.
- Core HTTP/owner cases **32/32 PASS**, selected API/real-JWT contracts
  **18/18 PASS**, pure Core port policy+SQL adapter tests **8/8 PASS**,
  compiled server error identity **1/1 PASS**. The enhanced guarded
  disposable PG18 vet visit script also passes its existing **9/9**
  integration cases plus `VET_DETAIL_PORT_REAL_PG_PASS`: exact owner
  fields, foreign/missing/malformed resource indistinguishable 404,
  sanitized exceptions, class identity, no live cloud or private data.
  No veterinary visit SQL query, permitted DTO field or media locator
  was changed by this refactor.
- Added mandatory physical runtime export `pets-shared/vet-visit-error`
  and negative JS/DTS graph fixtures. Current working-tree count is
  **98 remaining / 44 eliminated / 0 newly introduced**. Initial
  `d3a3472be35a10375a4f7db23203c41b4acf0ee89902cdb0`
  was recorded FAIL from two outdated Hono wildcard test arguments; initial
  continuation was recorded FAIL from the same outdated Mobile expectation,
  both corrected with exact fifth injected SQL port contract. The final
  continuation job `79fd184009c30963acabbe0c8607bc1f085771a35e56fddb`
  was checked **EXIT 0**: Mobile **2742 PASS/1 SKIP**, trainer-panel
  **726 PASS**, admin-panel **239 PASS**, monorepo typecheck **123/123 PASS**
  and workspace/whitespace gates PASS. Prior successful build **61/61**,
  all Core/API/Worker/package tests, Web **3144 PASS/6 SKIP** and the
  physical runtime JS/DTS audit `e7cf496efc1a475d4dee6db10e070ae86a0956de2a72c17e`
  **262/262 PASS, EXIT 0** were verified by their separate durable receipts.
  Only then was frozen Core server-adapter baseline ratcheted **99 → 98**,
  with **24/24** boundary checks and graph **69/0 PASS**.
- Changes remain local only; no staging/prod, no commit/push, no legacy gafus1.
  The six separate provider/edge/staging acceptance gates remain PARTIAL.

### BC — Article service ports: durable continuation and acceptance receipt

- Ratchet accepted **98 → 96** only after durable full job
  `3fe18a4c1cf62e018c42f79d34b4e1a3d2e14072ba71c57c`
  **EXIT 0** without timeout. Source AST now reports **96 remaining /
  46 eliminated from original 142 / zero new imports**; the baseline
  and regenerated risk inventory both carry that same 96. Source-only
  reduction was not treated as sufficient for baseline acceptance.
- Core article domain policy no longer imports
  `@gafus/article-server` or `@gafus/article-server/article-rows`.
  Core `ArticleReadPort` is a structural DTO/SQL boundary with explicit
  required first-argument injection for catalog, detail, edit, create, view,
  and author viewer operations. Core `ArticleOwnerWritesPort` requires
  an explicit SQL adapter for owner checks and conditional UPDATE/DELETE.
  API composition:
  `apps/api/src/modules/articles/composition/article-rows.ts` and
  `article-owner-writes.ts`, with an explicit API package dependency.
  Old SQL adapter exports were not renamed, deleted or repurposed.
- Core article policy/like tests **39 PASS**, API targeted routes
  **46 PASS**. Guarded PG18 article-rows **3/3 PASS** (owner scopes,
  authenticated/guest view deduplication) and guarded article-like
  concurrency+stale-owner/CAS suite PASS. Evidence: durable job
  `5e5d8945ab030cad7c9fa065d5a3f0c907c020cf6c68e3ef`
  **EXIT 0**. Built Core article JS contains no server import; API
  compiled JS imports the SQL projections and owner-fenced write adapter.
- Full physical runtime JS/DTS pnpm export regression **262/262 PASS**,
  job `4dee5050d9a08ab935ec72162def1fc2ffaa2069a2bb5bcc`
  **EXIT 0**.
- Long-running complete cross-platform regression has short valid run
  ID `art-ports-v9`; durable job
  `3fe18a4c1cf62e018c42f79d34b4e1a3d2e14072ba71c57c`.
  `~/Library/Logs/gafus-refactor-regression/art-ports-v9/results.tsv`.
  The build **61/61 uncached**, architecture and workspace, monitoring,
  runtime, Core/API/Worker and all configured domain packages PASS;
  Web finished **3144 PASS / 6 SKIP**, 303/303 source files accounted.
  Mobile **2742 PASS / 1 SKIP**, trainer panel **726 PASS**, admin panel
  **239 PASS**, entire TypeScript monorepo **123/123 PASS**, final
  `git diff --check` (pre-existing native compressor patch excluded) PASS.
  Final durable `results.tsv` contains PASS on every stage; the full
  job and normal ratchet validation were checked after actual exit 0.
  Normal Core boundary tests **24/24 PASS**; workspace **69/0 PASS**.
- A prior full job `43d7aedfd3259d148e6689328342f15bbd01de0520d0dad2`
  was correctly marked **FAIL** from a too-long run identifier accepted
  by the outer shell but rejected by the Web sub-runner. The replacement
  job above is a NEW full regression, not a relabeling of that failure.
  After green full-job acceptance the outer run-id validation
  was aligned with the Web helper (33 total characters); added
  `scripts/qa/architecture-final-regression.run-id.test.mjs` (**4/4
  PASS**) to reject invalid identifiers before any builds.

### BD — Consultation mail projection read port (2026-11-11, in progress)

- Original frozen ratchet **96**. Core's
  `services/consultation/consultationTransactionalMail.ts` no longer imports
  `@gafus/consultation-query-server`; a required `ConsultationMailReadPort`
  supplies exactly one booking-for-outbox-log projection. Core owns email
  destination/subject/template, redaction, idempotent delivery key and
  retry TTL; the unchanged SQL method remains exported by
  `@gafus/consultation-query-server` and is wired in the
  `consultation-server` composition. The SQL adapter was not moved to Core.
- Added shared `CONSULTATION_EMAIL_TYPES` union and server-side contract
  tests to compare every category with the Prisma enum, and a negative test
  that an absent booking cannot cause email dispatch. Contract **2/2 PASS**,
  Core mail smoke **3/3 PASS**, rebuilt consultation-server **51/51 PASS**,
  consultation-query **12 PASS / 3 expected SKIP**.
- Real isolated PG18 `scripts/qa/consultation-email-outbox-isolated-pg.sh`
  confirmed **EXIT 0**, receipt job
  `95b6346a790e1215c938ae2aac5b91996c8e75072df4732b`.
  Covers client/trainer recipient separation, lost enqueue ACK replay with
  stable log ID, attempted-send cannot blindly replay, six concurrent
  creates exactly one outbox log, missing recipient creates no log.
  Cloud/provider ACK is NOT simulated as an actual live provider.
- The first full `mail-ports-v10` job
  `11c34b094aae73fc51f1c5869e1a1185b50ad8739066bac5`
  **FAILED build** on Worker TS module resolution of a shared subpath.
  Fixed confirmed issue by using `@gafus/prisma` enum **inside the server
  composition only**, leaving Core on the pure shared domain union; rebuilt
  Worker PASS and ran new independent full regression `mail-ports-v10b`,
  durable job `74c33994ad878f6780d8566bc7459bf76c87345776b41714`.
  Initial 61/61 uncached builds, Core/API/Worker/domain package tests
  PASS. The Web/Mobile/panels/types stages must be read from that job's
  completed receipts BEFORE ratcheting. Working tree scanner currently
  shows **95 remaining / 47 resolved / 0 new**; frozen baseline remains
  **96** while acceptance is still running.
- All changes local only; no remote staging/production, no commit/push,
  no legacy gafus1. External/staging six gates remain PARTIAL.


### BE — Accepted mail, trainer video, ranked feed and diary follow-up (2026-11-11)

This addendum supersedes BD's interim wording: the actual post-run
receipts are available. Every acceptance below is **local**; none
authorizes a deployment.

- **BD mail accepted: 96 → 95.** New full
  `mail-ports-v10b` run passed **32/32** gates after the
  earlier failed build was corrected. Uncached build **61/61**,
  API **2669 PASS / 266 expected SKIP**; Web
  **3144 PASS / 6 SKIP** (all 303 source files accounted for),
  Mobile **2742 PASS / 1 SKIP**, trainer panel **726 PASS**,
  admin panel **239 PASS**, monorepo TypeScript **123/123**.
  The isolated PG18 consultation mail outbox contract was already
  validated in BD. Frozen scanner ratchet accepted at **95**, no new
  Core→server imports. Source: local
  `~/Library/Logs/gafus-refactor-regression/mail-ports-v10b/results.tsv`.
- **Trainer video persistence port accepted: 95 → 94.**
  Core trainer-video policy receives a required structural persistence
  port; real SQL remains behind the API composition. Guarded PG18
  exercises role and ownership fences, plus transactional behavior;
  no data-path bypass is permitted by the architecture tests.
  `trainer-video-v11` passed **32/32** local gates:
  uncached build **61/61**, API **2673 PASS / 266 SKIP**,
  Web **3144 PASS / 6 SKIP**, Mobile **2742 PASS / 1 SKIP**,
  both panels **726 / 239 PASS**, types **123/123**.
  Source: `~/Library/Logs/gafus-refactor-regression/trainer-video-v11/results.tsv`.
- **Ranked feed SQL read port accepted: 94 → 93.**
  Core's popular/discussed feed ranking delegates the read to an
  injected port; `@gafus/media-server/feed-ranked-rows` stays in
  server-side composition. Preserved rank ordering/read filters;
  guarded isolated PG18 ranked-feed proof and feed-server tests PASS.
  The independent `feed-ranked-v12` run passed **33/33** gates:
  build **61/61**, Core **2129 PASS / 143 SKIP**,
  API **2673 PASS / 266 SKIP**, Web **3144 PASS / 6 SKIP**,
  Mobile **2742 PASS / 1 SKIP**, panels **726 / 239 PASS**,
  types **123/123**. Frozen scanner accepted **93**,
  no new imports. Source:
  `~/Library/Logs/gafus-refactor-regression/feed-ranked-v12/results.tsv`.
- **Diary persistence accepted: 93 → 91.** Core diary save/read
  receives a required SQL-free persistence port, with API composition
  handling actual course-progress-server rows. In Core the caller policy
  still validates course access, owner and exact course occurrence;
  the guarded PG18 suite exercises the real API composition and private
  ACL, revoke, shared day, legacy selector, ordering, concurrency and
  non-UTC database invariants. Focused API architecture **76/76 PASS**;
  API suite **2676 PASS / 266 expected SKIP**. The first
  `diary-port-v13` run failed the source-wiring test; a corrected NEW
  `diary-port-v13b` full run completed with **EXIT 0**, durable job
  `6b16a7ce68f6bdbf98920171b14c815b4256c4ad2adc6829`,
  all configured architecture/build/runtime/server/Web/Mobile/
  trainer-panel/admin-panel/types/whitespace gates PASS.
  Web **3144 PASS / 6 SKIP**, Mobile **2742 PASS / 1 SKIP**;
  build **61/61**, typecheck **123/123**. Explicit post-run baseline
  write accepted **91 remaining / 51 resolved from original 142 / 0 new**;
  regenerated risk inventory and normal 24/24 Core boundary tests PASS.
  Sources: `~/Library/Logs/gafus-refactor-regression/diary-port-v13b/results.tsv`
  and its `-web-chunks/completion.json`.
- No production/staging access, no commit/push, no legacy `gafus1`.
  The external release gates are not represented by these local passes.


### BF — Survey SQL persistence port accepted (2026-11-11)

- **Survey Core→server dependency removed:** survey service injects a
  SQL-free `SurveyPersistencePort` for five read/write operations;
  server-owned `@gafus/course-progress-server/survey-rows` remains
  bound in `apps/api/src/modules/surveys/composition/survey-rows.ts`.
  Request-facing signatures unchanged. Core still validates owner/course,
  exact survey step, input, editable-until policy and persisted day state;
  SQL still guards tenant predicates, row locks, atomic status writes
  and concurrent retries. Explicit anti-bypass architecture mutation test.
- **Acceptance proof:** full independent `survey-port-v14` regression
  finished **EXIT 0**, durable job
  `7f098511c655f13f3f6905e403073a7f2057ab0b11ff3c9e`,
  **33/33 gates PASS**. Uncached build **61/61**,
  Core **2129 PASS / 143 SKIP**, API **2677 PASS / 266 SKIP**,
  Web **3144 PASS / 6 SKIP** (302 passed + 1 skipped of 303 files),
  Mobile **2742 PASS / 1 SKIP**, trainer panel **726 PASS**,
  admin panel **239 PASS**, monorepo TypeScript **123/123**,
  architecture and workspace gates PASS, whitespace PASS.
  Disposable PG18 `survey-rows-isolated-pg.sh`: **6/6 PASS**;
  109/109 targeted API architecture/private survey tests PASS,
  22/22 survey Core policy tests PASS. The four existing guarded
  mounted PG suites now import and exercise the actual API composition.
- **Concurrent working tree caveat:** scanner showed **91 → 90**
  immediately after the survey migration, as expected. During the full
  acceptance a separate local edit to the Gallery/Feed/media-purge
  workflow removed an additional tracked compatibility import.
  At final freeze scanner therefore showed **89 remaining / 53 removed
  from initial 142 / 0 new**. This second removal is **NOT attributed
  to the survey migration**, and the additional source changes predate
  the finished typecheck. Independent post-change regression verified
  Core **2130 PASS / 143 SKIP**, API **2677 PASS / 266 SKIP**,
  Feed and Media server tests PASS; normal Core boundary
  **24/24 PASS**, inventory regenerated and frozen baseline **89**.
  This does not replace separate end-to-end media-purge acceptance gates.
  No deployment, commit, push or legacy repository changes.
- Durable receipts:
  `~/Library/Logs/gafus-refactor-regression/survey-port-v14/results.tsv`,
  `~/Library/Logs/gafus-refactor-regression/survey-port-v14-web-chunks/completion.json`.
