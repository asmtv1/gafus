# Stages 0, 3–5 — historical source / current QA read baseline, 2026-11-28

## Scope and provenance

- Historical source: `b9bfc537f18610afe81016440ed9cd33dacc3229`. Candidate: `c0828fcdede0d45455c9053fc712017c17c755bb` (the shared QA branch advanced from 850874bf3 to c0828fcde via stage 11; no diff in apps/api, packages or pnpm-lock.yaml). Separate branch `qa/stage0-3-5-baseline-20261128`; stage 9 remains 11b0544a1. No production, push or shared-branch changes.
- Previous reports at 850874bf3 already proved current legacy/candidate parity and timing, including 60 avatars, 80 room candidates, 200 catalog courses, 2,000 walks, delta recovery and lost ACK. Reused those fixture definitions and did not rerun the original full parity/fault profiles. This run adds historical-source functions, pg_stat_statements rows and plans, plus full history/empty PUT comparisons.
- Historical checkout artifact probe (job e2e5a099076c8e925e0c5db457724a1735eb6861c5ce40e1) found no compiled entrypoints for @gafus/prisma, @gafus/core/services/course, @gafus/tracking-server/walks, @gafus/course-read-server/legacy-catalog-rows. A full historical build was not attempted on the shared Mac; do not characterize missing artifacts as a compile error. Historical schema lacks DogWalkChange and its forward migration; there are 24 added schema lines between the historical and candidate commits. Full historical release A/B remains BLOCKED pending independently generated/built dependencies and a reviewed historical-schema bootstrap.
- Source-slice runner extracts exact historical functions for avatar, discover, course-room access, legacy catalog query + projection + entitlement policy, walk full GET and empty sync. The historical course policy uses an adapted current feature-flag entrypoint and unchanged entitlements SQL package; both sides share current generated Prisma, dependencies, DB schema and synthetic signer. Old route wrappers reproduce successful response shape, not the entire historical Hono app or validation. Candidate walk uses its actual mounted route; Chat2/catalog use real services. This is an algorithm/read-path comparison, not a benchmark of two signed/built releases.
- Candidate worktree copied same-source compiled packages and linked installed external dependencies from QA. A new frozen install or clean build is not attested. No production credentials or endpoint used.

## Reproduction

After a standard workspace dependency install, Prisma generation and workspace package builds, run from the repo root (output must not exist):

```sh
bash scripts/qa/roadmap-baseline-slices-isolated-pg.sh "$PWD/.qa/roadmap-baseline-new.json"
```

Create the output parent directory first if needed. Runner clears inherited environment, starts only a disposable PG18 on loopback, uses schema push then replaces the empty DogWalkChange table with the exact forward migration (including journal triggers). It enables pg_stat_statements; no full historical migration replay claimed. Five alternating pairs of 10 requests per arm (700 logical observations across 7 comparisons; full catalog traversal sends three requests per observation), one external request in flight, pool limit 8, shared_buffers 32 MB; legacy functions may parallelize their own SQL. Same fixtures/PG server for both arms. ANALYZE before measurements, warm-up outside samples. Synthetic signer, Hono loopback, test actor, no JWT/TLS/edge. p95 is nearest-rank for 10 observations, median of five p95s. Raw/gzip bytes of serialized JSON, gzip calculated locally. Rows = actual SELECT/WITH rows returned according to pg_stat_statements per arm divided by 10, not rows visited; Prisma event statements include transaction control and occasional pool probes. EXPLAIN ANALYZE BUFFERS is outside latency samples with captured SQL and synthetic parameters; 88/88 successful. For full traversal candidate wall time includes page parsing/gzip while historical single request timer ends after body read, so that p95 comparison is diagnostic, not a strict equal timer boundary. No p95 SLO established.

## Actual run (do not combine with previous stands)

- PG 18.4, isolated port 60159, job `879fdf1c8a6908f3a78bcc92039046485ad7fce33b1f2559`, exit 0, elapsed 227.968 s, sentinel ROADMAP_BASELINE_SOURCE_SLICES_PASS. No stderr. Port released and generated slices cleaned.
- 200 courses, 180 visible, 80 course-room candidates, 57 allowed on both sides (same set, different ordering of equal createdAt: historical query lacks id tie-breaker); avatar DTO equal, catalog projection parity across all 180, full walk DTO equal, delta cursor stable and empty ACK shape. 2,000 journal rows confirmed.
- Raw data and 88 plans: `gafus-architecture-roadmap-20261128-stage0-3-5-baseline-metrics.json` (SHA256 63f195133de34f88516e5476964ab005651d65979ba7d9ac7ef37ecdbb7a9cda). The report records group summaries, not individual request samples.

| Scenario | p95 ms old → candidate | Prisma SQL statements | PG returned rows/request | JSON bytes | gzip bytes | PG SELECT execution ms/request (median of arms) |
|---|---:|---:|---:|---:|---:|---:|
| avatars60 | 28.16 → 9.15 | 62 → 3 | 120 → 120 | 9691 → 9691 | 616 → 616 | 1.30 → 0.39 |
| rooms80 | 456.99 → 14.53 | 34–39 → 5 | 164–164.5 → 90 | 3022 → 3022 | 360 → 348 | 1.94 → 0.37 |
| catalog200-first-page | 184.77 → 37.24 | 17–18 → 9 | 2386–2386.1 → 91 | 1216846 → 33606 | 26211 → 1301 | 3.17 → 1.38 |
| catalog200-full-traversal | 165.25 → 147.96 | 17 → 27–28 | 2386 → 275–275.1 | 1216846 → 100580 | 26211 → 3939 | 3.24 → 4.93 |
| walk2000-full-read | 106.40 → 245.05 | 3 → 2–3 | 2001 → 2001–2001.1 | 546025 → 546025 | 24522 → 24522 | 4.83 → 9.36 |
| walk2000-empty-delta | 430.00 → 119.16 | 3–4 → 6 | 2001–2001.1 → 2 | 546025 → 92 | 24522 → 95 | 7.07 → 0.07 |
| walk2000-empty-put | 1133.31 → 178.39 | 4–5 → 1 | 2002–2002.1 → 1 | 546025 → 39 | 24522 → 58 | 7.35 → 0.08 |

### All five p95 pairs (ms; old and candidate lists in corresponding order)

- avatars60: old [30.07, 21.77, 17.45, 28.16, 56.22]; candidate [11.41, 7.40, 8.26, 11.76, 9.15]
- rooms80: old [456.99, 134.81, 560.50, 587.03, 127.20]; candidate [11.87, 12.80, 493.73, 95.21, 14.53]
- catalog200-first-page: old [184.77, 495.90, 201.23, 141.51, 103.67]; candidate [69.18, 13.72, 219.08, 37.24, 29.84]
- catalog200-full-traversal: old [165.25, 142.53, 126.02, 1362.36, 363.53]; candidate [345.41, 36.80, 147.96, 171.13, 58.29]
- walk2000-full-read: old [84.72, 106.40, 93.18, 365.22, 555.69]; candidate [236.73, 63.13, 245.44, 245.05, 2258.32]
- walk2000-empty-delta: old [405.92, 430.00, 344.47, 1318.92, 1099.16]; candidate [36.79, 119.16, 51.21, 128.26, 140.72]
- walk2000-empty-put: old [1133.31, 821.93, 2279.19, 278.95, 2996.74]; candidate [297.74, 133.13, 296.25, 34.70, 178.39]

## Interpretation and remaining acceptance

- PASS SQL/rows/bytes budgets on this fixture: 60-avatar batch cuts 62 to 3 statements, 120 returned rows unchanged; 80-course rights bound to 5 candidate statements and 90 rows; catalog first page bounded to 9 statements and 91 rows. Full traversal trades 17 for 27–28 statements but reduces rows to 275–275.1 and bytes to 100,580. The full traversal returns the same logical 180 cards; first-page comparison is intentionally a different wire representation.
- PASS empty delta/empty PUT: candidate returns 2/1 rows and 92/39 bytes; delta has 6 Prisma statements but just 3 read queries (transaction overhead); both journal head/range plans use DogWalkChange_userId_version_key. The range query returns 0 rows. These are stable deterministic budgets, not a native/client p95 SLO.
- OPEN/FAIL to establish non-regressing full-walk p95: raw response and 2,001 returned rows unchanged; candidate 245.05 ms median p95 vs 106.40 ms historic slice, and median PG execution 9.364 vs 4.834 ms. Actual candidate SQL plan is Limit → Sort → Nested Loop Anti with 2,000 inner scans of the empty DogWalkTombstone table; old plan separately scans tombstones once and scans/sorts DogWalkRecord. Candidate full-history EXPLAIN 4.272 ms vs old history query 1.373 ms (+ separate tombstones 0.023 ms). This suggests an actionable SQL-plan investigation, not a proof of production regression. No runtime/index change in this QA branch; rerun with low contention and representative tombstone distributions before choosing query/index rewrite.
- OPEN latency stability: Mac had load average 19.95 / 28.77 / 32.65 on 8 logical CPUs immediately after run. Large p95 variance (one candidate full-history p95 2258.32 ms, one historical empty PUT 2996.74 ms). Pairing mitigates but does not eliminate concurrent machine contention. Do not compare these milliseconds against the earlier 850874bf3 stand. No additional heavy repeat was launched under this load.
- OPEN equal-boundary wall p95 of full catalog traversal, historical complete artifact/scheme A/B, concurrency >1 (prior separate walk c12 test retained but not combined), controlled idle-host repeat and real edge/native latency. Physical devices accepted by instruction. No new benchmark for earlier stages outside this scope.
- Status: stage 0 reproducible limited-concurrency source-slice baseline PASS, full historical release baseline BLOCKED; stages 3–4 SQL/rows/bytes budgets PASS, stable p95 acceptance OPEN; stage 5 delta/empty repeat budgets PASS, full history regression OPEN. Not a blanket acceptance of all four stages.
