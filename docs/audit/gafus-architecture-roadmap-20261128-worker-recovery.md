# Stage 7 / 14 — local Worker, queues and recovery acceptance (2026-11-28)

Scope: `qa/architecture-acceptance-20261127` at `850874bf306d6aa96629e704ca256033ef1d99f2`, checkpoint `bca1be54b`. Separate branch `qa/stage7-14-worker-recovery-20261128` and worktree `~/Desktop/gafus-qa-worker-20261128`. No merge, rollout, production writes or production connectivity; other agents' worktrees left intact. Physical devices accepted by owner; UI and other domains excluded. All test databases and identities synthetic; loopback ports only. Reused same-candidate prebuilt workspace dependencies and a shared pnpm virtual store; this is not a clean-install certification. Earlier shared-worktree run of account cleanup invalidated by concurrent source drift and repeated in isolated worktree.

## Reproducible checks and evidence

All log filenames below refer to `/tmp/gafus-qa-worker-20261128/` on the Mac. Full receipts are local artifacts, not production evidence.

| Check / command (from worktree root unless noted) | SHA at run | Outcome / evidence |
|---|---|---|
| `pnpm test:recovery` (original QA worktree) | `850874bf3` | PASS exit 0, 179684 ms; `recovery.log`; QA receipt `.qa/testing/qa-01afccf4-ffbd-47b7-b04c-9803ab327d5d/summary.md` in original QA tree. |
| `bash scripts/qa/chat2-outbox-multiprocess-acceptance.sh` | `58824eaa1` | PASS exit 0, 199205 ms, fake broker; two processes, one initial effect; crash after ACK, retry once, one consumer effect. `outbox-r2.log`. Original unfenced crash test failed (`outbox.log`). |
| `bash scripts/qa/chat2-outbox-multiprocess-acceptance.sh --real-broker` (before production code fix) | `d0a36a1b3` | FAIL exit 1: same eventId published with offsets 2 and 3 after crash. Initial two-process delivery passed. `outbox-real-baseline.log`. |
| same real-broker command after idempotency fix | `3d0b0ea77` | First run FAIL exit 1: first delivery failed, 0 observed proxy calls; cause not established (machine heavily loaded). `outbox-real-fixed.log`. |
| same real-broker command, repeat | `70d9cec99` | PASS exit 0. Two independent workers, one publish and one durable DB ACK; process SIGKILL after external ACK before DB commit, lease expiry/recovery with two publish attempts and one actual broker offset; lost HTTP ACK, retry and one publication. Real Centrifugo history exact counts `archqa-concurrent=1`, `archqa-crash=1`, `archqa-lost-ack=1`. `outbox-real-fixed-r2.log`. |
| `pnpm test:account-cleanup-worker` | `58824eaa1` | PASS exit 0, 164342 ms, 6/6 named cases, 6 SQL snapshots. Repeat idempotent, foreign owner preserved, owned resources removed; 6 fake-storage sweeps, 3 fake CDN submits and ACKs. Real PG SQL queue and Redis connectivity, synthetic external services, not live providers. `cleanup-r2.log`, `.qa/testing/qa-b17bf751-b96a-4923-9212-6da44d954e2f/summary.md`. |
| `bash scripts/qa/chat2-mixed-version-dlq-guard-isolated-pg.sh && bash scripts/qa/cloudru-bullmq-ack-isolated.sh` | `58824eaa1` | PASS exit 0; old selection/stale claim fenced, admin CAS replay, retry/ACK token cleanup; 2/2 real Redis BullMQ unknown-ACK cases. `rollback-bullmq.log`. This is mixed-version queue compatibility, not a full old-release API/Worker rollback. |
| `cd packages/worker && pnpm exec vitest run src/chat2-outbox-reliability.test.ts src/chat2-outbox-metrics.test.ts src/chat2-outbox-tracing.test.ts --no-file-parallelism && pnpm typecheck` | `3d0b0ea77` | PASS exit 0; 3 files, 13/13 tests; TypeScript noEmit pass. `worker-unit.log`. |
| `node --test scripts/qa/otel-local-collector.test.mjs scripts/qa/server-telemetry-resource.test.mjs` | `3d0b0ea77` | PASS exit 0, 8/8, `otel.log`. No external production telemetry. |
| `bash scripts/qa/prometheus-alertmanager-isolated.sh` | `3d0b0ea77` lineage | BLOCKED exit 28: release archive download timed out/reset, no successful alert delivery. `prometheus-alertmanager.log`. |
| `bash scripts/qa/observability-real-multi-instance-isolated.sh` | `58824eaa1`, `27a8be643`, `3d0b0ea77` | First three runs FAIL readiness: real broker auth succeeds, API can become ready, Worker stays 503. `real-multi.log`, `real-multi-r2.log`, `real-multi-r3.log`. Direct owned PG SELECT 1, outbox metrics and due-count worked. Root cause reproduced: tsx package-local alias maps runtime imports to `.d.ts` (empty exports); dedicated QA runtime config resolves actual JS, 8/11 exports confirmed. |

## Changes

- `58824eaa1`: terminate only the exact sleeping PostgreSQL ACK backend in the disposable DB after killing Worker; assert transaction did not commit. Deterministic fault injection, no production changes.
- `27a8be643`: launch QA processes via exec, own exact PIDs, broker auth preflight, private safe readiness diagnostic.
- `d0a36a1b3`: actual Centrifugo fault proxy and history assertions; deterministic lost HTTP ACK.
- `3d0b0ea77`: production Worker sends stable `idempotency_key: eventId`, keeps logical event ID; reliability test asserts contract. QA history TTL 600 s solely for evidence retention (production unchanged). Broker idempotency is bounded, not an indefinite exactly-once guarantee. Actual Centrifugo 6.9.7 archive checksum verified; probe with repeated identical key returned same offset and one publication.
- `70d9cec99`: surface redacted broker logs before fixture teardown.
- `600c3c087`: QA runtime tsconfig without declaration-only aliases. Production compilation unchanged; wider worker dev tsx alias audit remains separate.

## Recovery and rollback evidence limits

Existing `docs/audit/gafus-architecture-roadmap-20261128-local-followup.md` records historical DB-only logical restore 771 ms, observed acknowledged-write gap 256 ms, one deliberately post-backup write. Those are not full-service RTO/RPO. The full-service harness uses synthetic credentials, local archive and fixtures, not actual production backup or cloud object restore. Its fresh schema uses Prisma db push rather than full migration replay. No proof of arbitrary old-release rollback or indefinitely delayed replay; the mixed-version DLQ proof above is narrower.

## R4 / R5 continuation (before R6)

- R4 at `600c3c087`: four services ready and HTTP→SQL→Worker→Centrifugo→callback PASS; OTLP callback span missing, overall exit 1.
- R5 at `96174e54988d1011ec4138d3e6c684d9998cfcab`: after explicit flush in private QA callback, OTLP correlation PASS (6 spans), two-API baseline PASS, PG and Redis outage recovery PASS, user seed PASS and encrypted archive capture PASS. Job `d68de24742d5e4f1b87d372b826043f5568613b6c8a6d2ef` timed out at 600772 ms (SIGTERM); cleanup trap removed the owned directory, then the shell continued into restore. Subsequent ENOENT and A2_RESTORE_SCHEMA_OR_DATA_FAILED are not evidence of a corrupt snapshot. No full-service RTO/RPO yet. R5 log: /tmp/gafus-qa-worker-20261128/real-multi-r5.log.
- Resume inspection: HEAD still 96174e549; no R6 log, no active restore shell or listener on ports 56241–56248. Previously orphaned tsx processes on other checkout paths not touched. No Prometheus verified official archive established.
