# Roadmap follow-up — local acceptance, 28 November 2026

Base runtime source: 9094af7d2. Subsequent da84486a3 changes only the earlier QA report. Work performed in the separate QA worktree; the active architecture/mobile-diagnostics worktree was not changed. No external provider, production, native release, OTA, push or merge.

## Stage 1 — build-cache acceptance

- Actual Turbo dry-run: 8 independent source mutations in a disposable detached checkout (Web HTML/Vite, Admin live HTML/Vite, Trainer live HTML/Vite, API tsup, Prisma schema). All changed the intended key; Prisma schema propagated through generate, Prisma build and API build. Restoring original bytes restored every build key. Exit 0.
- Three real Vite builds with a fresh local-only Turbo cache in another detached checkout, same-SHA prebuilt dependencies linked from QA, private maps disabled. Cold 5.01 s, 0/3 cached; warm 2.15 s, 3/3 cached; moved only the three disposable output trees aside and restored them in 2.00 s, 3/3 cached. All 350 file paths and SHA-256 contents identical (Web 316, Admin 27, Trainer 7). This does not replace a clean dependency install or private-map/release artifact check.
- Added real build-input and output contract assertions to the existing Turbo test; added mandatory TURBO_FORCE assertion for private-map CI because private sealed files live outside public Turbo outputs. 12/12 Node contract tests passed. No build configuration or runtime change was necessary.
- Logs: /tmp/gafus-archqa-20261127/roadmap-hash-mutation-r38.json, roadmap-vite-artifact-cache-r39/summary.json, roadmap-build-contract-r36.log.

## Stages 0 and 5 — real PostgreSQL walk delta

- Existing load harness only tested the old GET route; db push cannot install the DogWalkChange trigger. Plain migrate deploy on an empty database also failed on the historical pre-init migration (P3018, ExamResult absent). Switched the disposable QA harness to the existing review-locked fresh PostgreSQL bootstrap with exact local DB confirmation and forward migrations; no historical SQL edited.
- Actual mounted Hono walks routes (injected synthetic owner, not JWT), PostgreSQL 18, 2000 records via 20 bounded HTTP writes. Verified first snapshot, 0-change ACK and read, one new walk, simulated lost ACK with identical retry, 101 changes over 100+1 cursor pages, replay of the full changed batch, concurrent DELETE/stale PUT and another retry, other-owner isolation, 205 GPS points over two segments with duplicate upload and 200+5 read. Stable cursor on repeat and tombstone wins. Trigger presence and journal count verified. Exit 0 (130.3 s including reviewed fresh bootstrap).
- Legacy empty-repeat read response 546025 bytes vs delta 92 bytes; offline gzip 24522 vs 96 bytes. Empty write ACK 39 bytes, one changed walk response 364 bytes. Five alternating pairs on the same populated fixture, 10 HTTP requests per arm after warm-up: legacy p95 [11.35,13.98,11.46,11.13,11.00] ms; delta p95 [2.78,2.00,2.30,1.98,2.57] ms. Medians 11.35 vs 2.30 ms. Small-sample p95 is diagnostic; comparison is current legacy/delta wire paths, not historical-SHA or device A/B. Gzip calculated locally, not measured from the deployed edge. Actual SQL statement-count and EXPLAIN/representative concurrency budgets remain separate.
- Original 400-request loopback recovery check remains: PostgreSQL stopped -> HTTP 503 -> restarted -> HTTP 200 without restarting API. No private data exposure. On the final migration-backed run p95 13.72 ms, p99 16.51 ms; earlier db-push run p95 11.90 ms is a separate fixture/run.
- Logs: /tmp/gafus-archqa-20261127/roadmap-walk-delta-r38.log; /tmp/gafus-walks-local-latency.json.

## Stage 14 — database recovery

- Existing DB-only recovery profile passed with full Prisma schema synthetic snapshot and actual Prisma query/pool-wait metrics. Restored course revision 7 and pending deletion, logical restore 771 ms, observed acknowledged-write gap 256 ms (one intentionally post-backup write). This is not service RTO/RPO, production backup or provider proof.
- Log: /tmp/gafus-archqa-20261127/roadmap-restore-r36.log.

## Open original exit criteria

The implementation checkpoint and separate QA report remain the source of existing results. This pass strengthens stages 1, 5 and 14 only. It does not certify all 15 stages. Current local unit/integration/faults/recovery/coverage-risk/account-cleanup results are recorded in gafus-architecture-qa-20261127.md; they refer to the tested QA SHAs, not concurrent mobile diagnostics edits. Remaining: historical-SHA performance/SQL/bytes A/B for Chat2 and catalog, representative SQL/upgrade/cache/concurrency measurements, physical GPS/SQLite/startup and native signed builds/OTA/recovery, full browser scenarios including deletion, provider sandbox, real broker/CDN/object-store/monitoring and service recovery, release compatibility and each conditional legacy retirement. Keep old wire, offline/tombstone, Stream/CDN purge and migration-history obligations until the original removal gates are satisfied. No production or provider operation was performed.
