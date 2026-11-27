# Stage 5 — full history read plan risk, 2026-11-28

## Scope and result

- Base: `a73b0b62532837da0b00bd44199b983aa496f661`; separate branch `qa/stage5-walk-full-read-20261128`, same own worktree. The base branch, stage 9 and shared QA branch were not modified. No production, release, push or physical device work.
- PASS: reproduced the exact 2,000 inner scans of an empty DogWalkTombstone relation, then reduced to one using an owner-scoped, uncorrelated NOT IN subquery. Both clientId columns are NOT NULL; the same SQL statement filters tombstones before ordering and LIMIT, keeps the same projection and owner, and retains one MVCC snapshot. No change to write, delete, ACK or cursor logic, no migration/index change.
- The actual product helper readWalkHistory is used by the legacy GET/PUT and initial/reset delta snapshot. It is the only runtime code changed. Targeted unit assertions check both SQL parameters are the same trusted owner, owner scope and ordering before LIMIT.
- Not a universal speedup claim: under this fixture, EXPLAIN execution time decreased for both populations; query+serialization p95 did not consistently decrease. In particular the 250-tombstone median rose from 11.268 to 13.191 ms. The structural repeated-scan risk is closed; a stable latency SLO and behavior for very large tombstone sets remain outside this bounded test.

## Execution and reproducibility

After installing dependencies, generating Prisma and building the required shared packages, run from this commit's checkout:

```sh
bash scripts/qa/walk-full-read-risk-isolated-pg.sh "$PWD/.qa-stage5-full-read-repeat" verify
```

- Actual command used on the base with the new QA harness: same command with output `.qa-stage5-full-read-evidence` and mode `apply` (guarded to this base/branch and only applies the patch after repeated-scan reproduction and a one-pass plan on both fixtures). Verify mode on the committed fix does not edit product source. Uses one fresh loopback PostgreSQL cluster, full review-locked migration bootstrap, 32 MB shared buffers, Prisma pool limit 4, single in-flight request, synthetic actors/data. Existing package dependencies from previous same-source QA were reused; just one target build of @gafus/tracking-server and 3 tests. No monorepo rebuild.
- First attempted runner (job bc803e2ec8ca7813a3efada24bf5ecee5a7a0f3b0e28a953, exit 1) was rejected before schema/fixture measurements by bootstrap's ONLY_DEFAULT_PUBLIC_SCHEMA_ALLOWED guard because the pool parameter was present. Corrected runner to append connection_limit after bootstrap; no safety guard bypass, no product change or data from that attempt used.
- Successful job `d5953568a0a0ed02d937ecaf0fccc7eb11bbb7449f364890` exit 0, elapsed 220.659 s including bootstrap, port 63988, PG 18.4, bootstrap 163 historical + 29 forward migrations. Schema checks reported 186 tables, 65 checks, 12 triggers and 9 functions. All measured arms and regression checks on this single PG instance. Port released afterward. API import resolves to this worktree's tracking-server/dist/walks.js.
- Host load at start of timed measurements 17.10 / 16.23 / 23.52 (8 logical cores), lower one-minute and longer averages than prior 19.95 / 28.77 / 32.65 observation, still far from idle; no other agents stopped. Timing compares identical raw Prisma queries + DTO and JSON serialization, not HTTP old/new. Five alternating pairs, 10 observations per arm; nearest-rank p95 within each arm; median of the five p95 values. All 200 individual observations retained in JSON. EXPLAIN ANALYZE BUFFERS executed separately from timing. Both arms return identical body and rows within each fixture.

## Measured plans and timing

| Fixture | Actual inner tombstone scans | EXPLAIN execution ms | Median raw-query p95 ms | Median query+serialization p95 ms | Rows / bytes |
|---|---|---|---|---|---|
| 2,000 rows, no tombstones | 2000 → 1 | 2.037 → 1.742 | 7.699 → 7.373 | 11.820 → 12.253 | 2,000 / 546,025 unchanged |
| 2,100 rows, 250 owner tombstones | 1 → 1 | 1.404 → 1.341 | 7.145 → 8.491 | 11.268 → 13.191 | 2,000 / 546,025 unchanged |

- Empty baseline Nested Loop Anti → Seq Scan of owner tombstones with Actual Loops=2000; proposal Seq Scan on walks with hashed SubPlan, tombstone Seq Scan Actual Loops=1. Realistic baseline Hash Join Anti and proposal hashed SubPlan both read 250 owner tombstones exactly once. Realistic fixture has 100 overlapping/stale records excluded before LIMIT, plus 150 deleted-only tombstones; the newest 100 rows are excluded and 2,000 valid rows are still returned. Two accounts share client IDs; foreign tombstones do not affect the owner. Equal start timestamps verify clientId descending tie-breaker.
- Both scenarios return identical JSON (546,025 bytes, 20,278 offline gzip bytes in these deliberately tied-date fixtures). The previous stand used different timestamps; do not mix its p95 or gzip results with this run.

### Five p95 observations per arm (query+serialization, ms)

- empty: before [12.962, 26.133, 11.820, 11.758, 11.443]; after [15.997, 13.028, 12.253, 10.700, 9.806]
- realistic: before [19.468, 10.558, 15.464, 10.878, 11.268]; after [90.542, 13.191, 13.501, 12.440, 12.619]

## Regression gates (actual mounted Hono, synthetic actor; not JWT/edge)

- PASS targeted build and tracking-server walksService unit tests 3/3.
- PASS full legacy GET exact DTO parity with old SQL, owner isolation and spoofed query owner rejection, sorted tie-breaker and tombstone exclusion before LIMIT on the 2,100-row fixture. Initial delta same visible walks + 250 deleted markers; empty delta stable. Concurrent read/delete accepts either valid snapshot cardinality; subsequent full GET excludes the deleted victim, matches old SQL, stale PUT ACK does not resurrect, delta emits only victim tombstone, empty repeat/ACK stable. No claim of ordering within a simultaneously executing HTTP request beyond snapshot semantics.
- PASS existing walks-local-load.smoke.ts owner/ACL checks and complete verifyDeltaProtocol, via optional delta-only mode that skips unrelated c12 load/outage (already proved earlier). 2,000 initial walks; lost ACK/retry unchanged cursor, 101 changes over 100+1, concurrent DELETE/stale PUT, other-owner isolation, 205 GPS points and duplicate upload/owner track ACL; empty GET 92 bytes, ACK 39 bytes, one change 364 bytes. Actual legacy vs delta HTTP p95 medians 24.66 vs 3.65 ms on this separate fixture within same cluster, not pre/post HTTP comparison.
- Runner cleaned the cluster; no untracked evidence artifacts left. Original default profile remains unchanged except allowing isolated report path and optional delta-only branch.

## Raw evidence

- `gafus-architecture-roadmap-20261128-stage5-full-read-plan.json` SHA256 `81f7699c96f313768a5da82ee14d35c3dad1f28dfaf5b90cf2a9e08f26144488` (four full EXPLAIN plans plus all observation arrays).
- `gafus-architecture-roadmap-20261128-stage5-full-read-delta.json` SHA256 `2a72ad1e047d54c5a583e24c9d40f116fe0b17064c1cd86aac753b9b353746ba` (existing profile).

## Remaining

- Specific stage 5 repeated empty-tombstone scan risk: PASS / fixed. Bounded SQL plans and correctness PASS; absolute p95 non-regression on an idle host not proven (no further expensive run while other QA agents active). Very large tombstone sets exceeding hash memory not tested; monitor actual planner/row distribution before generalizing. No production changes or release. Full independent historical build A/B from previous report remains separate and was not reopened.
