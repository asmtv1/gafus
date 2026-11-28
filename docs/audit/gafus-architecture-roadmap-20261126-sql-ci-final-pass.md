# Stage 14 / stage 1 — remaining SQL and CI duplicate work, 2026-11-27

## Media processing scrape

packages/statistics/src/infra/mediaProcessingMetrics.ts now reads all four
durable pipelines through one parameterized UNION ALL query with eight
scalar COUNT subqueries. Existing indexed predicates, enum casing, null
and strictly expired leases and metric names/ordering remain unchanged.
Each scrape has one MVCC snapshot and one database round trip (formerly
eight statements, four sequential batches of two counts). No new index,
schema change, user identifiers or fallback fabricated zero metrics.
Missing/duplicate pipelines and DB failure reject the scrape.

Exact source replay:
python3 scripts/qa/sql-media-metrics-profile.py --pg-bin /opt/homebrew/opt/postgresql@18/bin

Disposable PostgreSQL 18, 4 x 120,000 synthetic rows, current status-leading
index shapes (minimal fixture schema), sparse processing/failed rows,
null/exact/expired/future leases. Seven interleaved warm EXPLAIN ANALYZE
BUFFERS rounds; all four pipelines matched (530 stalled, 474 failed),
empty-table parity passed. Median cumulative SQL execution old/new
2.148/2.150 ms; planning 1.466/0.632 ms; shared blocks 2202/2202, temp 0/0.
No meaningful execution-time regression or extra buffer work observed.
Statements 8 -> 1, planning time reduced; not a measurement of remote
round-trip latency or HTTP p95. Prior mail monitor and BRIN optimizations
retained. Still require pg_stat_statements/top SQL, lock/wait attribution
and representative sanitized restore to establish remaining actual
bottlenecks. Do not add speculative indexes or claim production-wide SQL
optimization is complete.

## Prepare-deps duplicate work

The old Turbo negative filters did not exclude the eight manually compiled
packages from the transitive ^build graph. The actual Turbo 2.5.4 dry JSON
includes all eight plus Prisma generation. The current schema has no ERD
generator; the prior temporary schema rewrite was unnecessary.
Removed the manual package builds, shell background waits, negative filters
and separate generation. One Turbo graph owns package build/generate
ordering. The required shared types contract test remains synchronous after
the graph; built exports and cache-save gates remain. Four release apps are
still built by build-apps with mandatory private maps/SHA. Auxiliary app
builds remain. No change to independent runner source guards, release/OTA
checks, test coverage, image or deployment gates.

Dry comparison old/new actual executable Turbo task IDs, commands and
dependencies: identical 63 -> 63. Includes 59 package builds, 3 auxiliary
apps and Prisma generate. Explicit dependencies verified logger -> types ->
core-client -> Core -> Auth, logger -> Prisma -> mailer and generate before
Prisma build. Counting the preceding eight manual builds and one separate
generation, 72 -> 63 requested build/generate invocations in prepare-deps
(excluding the unchanged types test). Cache hits could avoid some compiler
work; this is not a measured 12.5% reduction in runner time. The shared
dependency rebuilds in independent forced release build lane are not
removed without a proven compatible artifact/fallback strategy.

## Verification

7/7 targeted Vitest (3 media processing, 4 mail monitor), 28/28 existing
workflow/release graph contracts with updated real graph/order requirements.
Workspace graph 67 projects zero cycles, domain Prisma boundary 325 sources
no new runtime import, UTC SQL clock 2561 modules passed. Real PG profile,
exact Turbo dry parity and git diff --check passed. No clean full build or
actual GitHub Actions run due to existing incomplete local dependencies
and instruction to leave broad QA to separate agent. No commit, push,
deployment, production SQL read or migrations.
