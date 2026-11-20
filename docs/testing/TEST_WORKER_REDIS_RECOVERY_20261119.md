# GAFUS: isolated Worker + Redis/BullMQ recovery pilot — 19.11.2026

**Outcome:** `MEASURED / INFORMATIONAL`, **not release-ready**. No production connections or existing-process restarts, no CI/release gates changed, no commit, push or deploy. All deliberate Unix signals target only PIDs directly created by this QA invocation. This is a local resilience experiment, not a claim of production exactly-once side effects.

## Run / plan / report

```bash
pnpm test:recovery
pnpm test:recovery --scenario worker.redis-recovery
node scripts/qa/test-system.mjs report --run-id qa-797b0989-b417-41ea-ae68-6e33c87afaa8
pnpm test:system:contract
```

- Catalog scenario: `worker.redis-recovery`; check: `worker.redis-recovery.pg-redis` (`kind: recovery`, profile `recovery` **only**).
- Final passed receipt: `.qa/testing/qa-797b0989-b417-41ea-ae68-6e33c87afaa8/summary.md` and `summary.json`; task evidence: `tasks/*/{tests.json,recovery.json,receipt.json,output.log}`. `REPORT 0`, exactly **3/3 required named cases**, **1/1 check**. No skipped/failed checks. `report --run-id` revalidates original evidence at read time.
- Dedicated setup: `scripts/qa/worker-redis-recovery-isolated.sh`; real-process QA controller and child: `packages/worker/qa/recovery-controller.mjs`, `recovery-worker-child.mjs`; strict verifier: `tests/support/worker-recovery-report.mjs`.
- Contract validation **44/44 PASS**, Worker TypeScript typecheck PASS. Synthetic mutation of the actual `recovery.json` (`providerSubmitCount = 1` instead of measured 2) caused `REPORT 2`, and restoring the original artifact restored `REPORT 0`.

## Real local components and exact sequence

Runs with a new PostgreSQL 18 data directory and database `archqa_worker_recovery_<random>` using random loopback port, Prisma `db push` (not migrations), `GAFUS_RECOVERY_EXPLICIT_QA=1`. A separate `redis-server` binds **only** `127.0.0.1:<random>` with `appendonly yes`, `appendfsync always`; persisted AOF stays within its one-run `/tmp/gafus-qa-worker-recovery.*` folder. The controller starts three **owned** child Worker instances, backed by **actual BullMQ** and a short QA lease. The child imports the locally compiled `packages/worker/dist/worker/src/media-cdn-purge-worker.js` and calls the real `processOneMediaCdnPurge` plus real SQL-fenced repository. The Beget provider is replaced with a **test-only** fsync-backed append ledger; no real CDN requests are sent.

1. **Redis disconnect and recovery while job active:** while a BullMQ job is active, fake provider submission is fsynced and SQL `purgeOperations` is committed. The controller stops **its own Redis child** with `SIGTERM`, verifies the socket becomes unavailable, restarts Redis **from the same AOF** on the same private loopback port, verifies reconnection, resumes its owned Worker and observes BullMQ job `completed` + SQL outbox `done`, exactly one external-like ledger submission.
2. **Actual child `SIGKILL` after SQL checkpoint:** the controller sees the durable `purgeOperations` value *before* killing **only its second owned Worker child** and verifies its death by `SIGKILL`. It advances the **test database's own 10-minute SQL lease** to the past (no production rows changed) and launches a new child. BullMQ's *real stalled-job reclaim* occurs after the dead worker loses its Redis lock; the new child reads the already persisted operation ID, does **not submit another one**, checks synthetic completion and ACKs the SQL outbox. Attempts = 2; a stale previous SQL token is rejected (`MEDIA_PURGE_LEASE_LOST`) **while the new SQL lease is still active, before the second child ACKs**.
3. **Idempotent duplicate enqueue:** adding the same `jobId` again to the local BullMQ queue returns its completed job and does not trigger another provider-like operation. Final SQL rows = two `done` outboxes; synthetic ledger = **two** distinct submissions for **two** completed jobs, no duplicates.

### Measured QA results

| Observation | Measured |
| --- | ---: |
| Locally spawned Redis instances | 2 (initial + restart) |
| Stopped owned Redis instances | 2 (outage + cleanup) |
| Owned Worker child processes | 3 |
| Deliberate owned Worker `SIGKILL` | 1 |
| Redis disconnect + reconnection | verified |
| BullMQ stalled-job reclaim | verified |
| PostgreSQL checkpoint read after restart | verified |
| Rejected stale SQL lease/token | verified |
| Completed BullMQ jobs / SQL outboxes | 2 / 2 |
| Distinct synthetic external-like submissions | 2 (one per job) |
| Duplicate queue enqueue suppressed | verified |
| Owned child processes and Redis cleaned | verified |

The **interruption-cleanup probe** deliberately sent `SIGTERM` to the **QA controller's own PID**, after its own Redis and a test child started; it returned **143** and wrote **no successful receipt**. The SIGTERM handler only stopped references returned by `spawn/fork`; the outer wrapper separately stopped its own PostgreSQL directory. No process-name matching, system-wide process termination, or Docker/production resources were used.

## Isolation / evidence boundary

- The SQL worker itself normally polls a PostgreSQL outbox; it is **not** shipped as a BullMQ CDN-purge consumer. The BullMQ queue/worker is a **QA bridge** combining the current SQL handler with real Redis/BullMQ semantics. Therefore, this evidence **does not establish that every production queue, Redis client, Cloud.ru trigger or outbox consumer follows this same recovery path**.
- A real Beget CDN call is never issued. The observed absence of duplicates is limited to a **durably checkpointed** synthetic operation. A crash *after an external side effect but before SQL checkpoint*, actual provider ambiguity, service credentials, distributed host restart, prolonged Redis outage, Redis failover, data corruption and cluster-wide failure are **not covered**.
- The 10-minute SQL lease is manually aged **only on disposable QA rows** to avoid waiting 10 minutes; the test verifies fencing and recovery, not 10-minute production scheduler timing. It also uses a short test BullMQ lock for reclaim.
- Redis AOF persistence was exercised in this local restart, not tested under host crash/fsync hardware failure. The PostgreSQL schema came from `prisma db push`; known `prisma migrate deploy` blocker `P3018` remains open. No GitHub Actions acceptance run of the uncommitted tree was performed.
- All inherited `DATABASE_URL`, Redis and external provider secrets are scrubbed before test resource startup. Each successful or failed full run stops only its own child processes, stops PostgreSQL via its **unique own PG data directory**, and removes its own `/tmp/gafus-qa-worker-recovery.*` directory. `.qa/testing` receipts are local Git-ignored files. `report` requires the exact three expected case names, actual ordered worker/Redis events, five unique owned PIDs, Redis stop/restart, one SIGKILL, checkpoint reuse, queue reclaim, two submissions/two completed jobs and cleanup. Missing or forged evidence produces `REPORT 2`.

**Next release-readiness blockers:** real production Worker/BullMQ integration path and external provider sandbox, process crash in the *side-effect→checkpoint* gap, realistic Redis failover and server process manager restart, clean migration chain and CI execution at one clean commit SHA. None are marked complete by this pilot.
