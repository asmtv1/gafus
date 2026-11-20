# GAFUS — account deletion cleanup Worker: isolated SQL queue / fake-storage (2026-11-19)

## Verdict

**PASS, informational / advisory only**: `pnpm test:account-cleanup-worker` → `REPORT 0`.

Final verified run: `qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2`.

- 1/1 check `api.account-cleanup.fake-storage-worker` passed.
- 6/6 exact named Vitest cases, 6 saved SQL/queue snapshots.
- Real original `processAccountStorageCleanup` and original token-fenced PostgreSQL lease/checkpoint/complete queries; real synthetic owner deletion through `deleteAccountAndPersistCleanup` and the same production snapshot/gallery/feed ports.
- Dedicated PostgreSQL 18 and Redis bound only to loopback on dynamically allocated ports; **no normal database, existing Redis queue or customer account touched**.
- **No real object storage or CDN**: Vitest replaces `createAccountStorageCleaner`, `startAccountCdnPurge` and `accountCdnPurgeDone` with *in-memory deterministic fake adapters*; neither object SDK erasure nor CDN purge is claimed.

## SQL queue flow

Unlike general background BullMQ jobs, these three account deletion work items are stored in **PostgreSQL `AccountStorageCleanup`**, claimed by `FOR UPDATE SKIP LOCKED`, leased and fenced by `attemptToken`. Redis was independently online and empty; its `PONG`/key-count=0 receipt **does not** mean this account-cleanup work went through Redis/BullMQ.

| Checkpoint | `feed` | `gallery` | `public` | Fake provider operations |
| --- | --- | --- | --- | --- |
| After transactional owner deletion | `pending`, attempts 0 | `pending`, 0 | `pending`, 0 | No sweep or purge |
| First original Worker drain | `pending`, 1 | `pending`, 1 | `pending`, 1 | 3 fake sweeps; 3 fake CDN requests checkpointed, deferred purge time |
| Fake CDN acknowledged + original Worker poll | `done`, 2 | `done`, 2 | `done`, 2 | 3 idempotent empty re-sweeps; 3 fake CDN acknowledgements |
| Second Worker drain (replay) | `done`, 2 | `done`, 2 | `done`, 2 | 0 additional sweeps, submits, polls or SQL claims |

Production delay was accelerated **only for the three synthetic deleted owner's isolated SQL rows**. The original scheduler delay/retry configuration was not changed. Each `done` row has `attemptToken = NULL`, `leaseUntil = NULL`, no error and an empty keys snapshot. The existing worker persists `purgeAfter` even on `done`; the test never equates its presence with unfinished work.

## Other-user and audit isolation

Fake storage started with one **owner** object and one **foreign** control object per scope. All three owner objects were deleted by fake `sweep`; all three foreign objects remained. A second synthetic user's SQL user, pet, feed post and comment stayed intact. The original owner user was physically deleted in the disposable SQL database, with a single `SELF_SERVICE` audit row and one account-deletion-counter increment. Six SQL snapshots show audit hash stability. **No claim of database-enforced audit immutability**.

## Recorded receipts

- `.qa/testing/qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2/plan.json`
- `.qa/testing/qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2/summary.json` and `summary.md`
- `.qa/testing/qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2/tasks/cfef6cd798e808354b5f/tests.json`
- `.qa/testing/qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2/tasks/cfef6cd798e808354b5f/worker-fake-storage.json`
- `.qa/testing/qa-8197f9a9-3ffb-42eb-bf7d-b974eb51f7d2/tasks/cfef6cd798e808354b5f/resources.json`

The independent fail-closed `verifyAccountCleanupWorkerReport` checks exact original Worker source hashes, six cases, SQL transition counts, fake object ownership, 12 fake provider events, audit, Redis DB size, unique isolated ports and verified owned resources cleanup. Contract tests reject tampering: false `done`, extra attempts, missing CDN acknowledgments, fake foreign-user deletion, changed audit hash, fake external-provider success, unclean resources or mismatched sources.

## Scope / release controls

- The new profile `account-cleanup-worker` is exclusively opt-in; `ci`, `full`, `integration`, other profiles and release gates remain unchanged. `pnpm test:account-cleanup-worker` runs the isolated harness.
- No browser, production Hono, real S3 bucket, Beget, Cloud.ru, Yandex, external SMTP or network provider calls were used.
- Success covers the Worker SQL lifecycle **with fake providers only**. It does *not* establish successful deletion from a real versioned bucket, CDN cache invalidation, cloud provider credentials or deployed production worker availability.
- Synthetic resources are automatically removed after the test: independent disposable PostgreSQL and Redis stopped, the QA temp directory removed, resource receipt recorded. Previous QA runs, projects and existing local processes remain untouched.
- No commit, push or deploy.
