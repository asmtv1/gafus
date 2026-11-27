# Stage 9 — local offline-v2 acceptance (2026-11-28)

## Candidate and scope

- Candidate: `850874bf306d6aa96629e704ca256033ef1d99f2` (`qa/architecture-acceptance-20261127`, checked again after the first PG pass).
- Separate branch/worktree: `qa/stage9-offline-20261128`, `~/Desktop/gafus-qa-stage9-20261128`. No production, push, shared branch changes, real accounts or external providers. Stage 13 was not modified.
- Prior `docs/audit/gafus-architecture-qa-20261127.md` records training atomic isolated PG PASS, but the remaining restart/ACK/owner/two-client evidence was open.
- Physical iPhone/Android acceptance is excluded at the owner's instruction. The new scenario uses actual queue/replay code with filesystem adapters and new queue objects as test-runtime restart, not native OS kill or a physical install.

## Reproduction

After the standard frozen workspace install, generated Prisma client and built workspace packages, from repository root:

```sh
bash scripts/qa/offline-v2-stage9-isolated-pg.sh
cd apps/mobile
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=test pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 src/shared/lib/offline src/shared/hooks/useOfflineJournalReplay.mounted.test.tsx src/shared/hooks/useTrainingDay.g1-offline src/shared/hooks/useVideoProgress.g1 src/shared/hooks/useDailyCourse.g1-newOnlyV2.test.ts src/shared/stores/offlineStore.test.ts src/shared/stores/authStore.g1-sessionRace.test.ts src/features/offline/components/OfflineDownloadedScreen.g1-mounted.test.tsx src/features/training/offlineVideoWiring.test.ts
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=test pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 src/shared/lib/offline/offlineStorage.g1.test.ts src/shared/stores/authStore.test.ts
cd ../../packages/core
env -i HOME="$HOME" PATH="$PATH" NODE_ENV=test pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 src/services/gafus/g1-offline-training-reward-boundary.test.ts src/services/offline/offlineMutationJournal.unit.test.ts src/services/offline/offlineVideoSqlPort.test.ts src/services/offline/videoPositionOccurrenceV3.accessParity.test.ts
```

The runner creates a temporary PG18 cluster, random loopback ports, fresh Redis and schema via Prisma db push (not migration replay). It clears inherited environment, uses synthetic actors and the real mounted offline route, production composition, journal SQL and Prisma. It checks the database identity and initially empty user table. The test's synthetic actor middleware bypasses JWT only; it does not replace the offline route's domain access checks. Transport uses Hono Request/Response in-process, not an actual TCP link; client disk files are actual local files and the native storage APIs are adapted. Cleanup stops owned resources and deletes the temporary directory.

## Results

| Evidence | Result | Durable terminal job |
|---|---|---|
| Mobile offline + mounted hooks/session/media | PASS 39 files, 258 tests, exit 0 | `8f543fa1f7595d476a888afd80c55410af17a464b616fa9e` |
| Initial real PG scenario | PASS 2/2, exit 0 | `28ffff104e6a0467a54e1390d4008c7db4fa2f3ee7c9f741` |
| Media logout assertion + auth store regression | PASS 2 files, 25 tests | `4ad086e628b30ad19d7c14d87903ac6a02ef450952873106` |
| Core journal/video/reward boundary regression | PASS 4 files, 29 tests; combined job exit 0 | same job |
| Expanded real PG scenario | PASS 3/3, exit 0, explicit STAGE9_OFFLINE_REAL_PG_PASS | `d40779cce085dcd9e85e34554cdf490f89f1ce4919e427f3` |

Distinct tests: 304 (258 + 14 new auth-store tests + 29 Core + 3 PG), without counting the 11 repeated media tests or earlier 2-case PG run. Final PG database `stage9_offline_4e9be0bc36a0`, PostgreSQL 18.4, ports 53511/53512; stdout SHA256 `6203399fe7d39d73a6bab1a392a45fbf5eb168a1885a68232dfbe77a792664c0`. Vitest 61.71s, test execution 13.83s, overall runner 161.956s. No stderr. PG connection refused after runner cleanup.

### Scenario-level acceptance

| Scenario | Evidence | Status |
|---|---|---|
| Historical ownerless v1 progress/prevention/media keys | byte-identical after current login, replay, logout and switch; never assigned to a new principal | PASS in test runtime; quarantine, not replay |
| Owned historical V2 envelope | raw persisted snapshot, login as unrelated owner cannot access it; returning owner receives immutable event in new epoch, old copy removed, one PG receipt | PASS |
| Durable enqueue → restart → lost response after commit → repeat | six events: training start, pause, practice complete, theory complete, daily complete, video position; same event IDs from files, one receipt/event, GET readback, replayed ACK, removal only on ACK, SQL progress verified | PASS |
| Two logical clients, owner switch during response | independent persisted clients submit two distinct event IDs on same step concurrently; one step transition, one UserStep, two receipts, zero writes to other owner; original owner recovers pending event and replays it | PASS |
| Receipt isolation | owner GET 200, other owner GET 404 for each of six events | PASS |
| Trainer edits course after offline write | old occurrence binding returns HTTP 409, zero receipt and step mutations, event remains pending after restart | PASS |
| No duplicate rewards | PG GafusRewardEvent count unchanged for retry and dual-client step completion; Core reward boundary 8/8; current policy has no training-completion earning kind | PASS for current policy |
| Media after logout | owner-scoped course metadata/video URI/list hidden when principal cleared; old scope rejected; legacy bytes retained; other owner cannot access; auth store logout regression | PASS at mocked-native adapter level |
| Prevention queue | existing client contract/writer/replay and dual-queue state machine in mobile regression | PASS at client level; no new real-PG prevention batch run |

## Blockers / limitations

- No native install or old real device backup used. Old-format snapshots are synthetic and explicit; no actual user data or native filesystem/Keychain/OS kill. Physical devices excluded; test runtime is the alternative allowed for this task.
- Ownerless legacy entries intentionally remain quarantined; assigning them to the next user would be unsafe. No claim of replay of unsupported ownerless legacy index-only commands.
- The isolated profile uses schema push, not the full historical migration chain; this is not a migration acceptance.
- Actual media byte deletion or OS/player handle invalidation is not proven; owner-bound storage remains retained by policy, while app access after logout is denied. CDN/S3 and revoked signed URLs belong to separate acceptance. Prevention real-PG batch and complete JWT/TCP network path not newly exercised.
- First independent frozen offline install stalled at 1799/1800 packages and was cancelled (job `deca1ceb0a8538f01d76cb8328252f76f36b9ff9643a93c8`). For tests, cloned package dist from same QA candidate into own worktree, linked local workspace packages to own tree, reused installed external dependencies and generated Prisma engine read-only from the QA checkout. Thus this is not a new clean-install/build attestation. No change to shared branch. Partial install directory was moved outside the worktree.
- Two initial PG startup failures (jobs `15622ce352d33f0cba8afa4c44b8f8f031570ec3d04b774b`, `e6c8465b8dd2a4bac8c5650cbd993f83b9eb56c7eeca5946`) were infrastructure, not application failures: macOS postmaster became multithreaded on startup without explicit locale. Runner now uses LC_ALL=C, isolated sockets, lower memory, startup diagnostics; two succeeding passes verified. No production code bug reproduced; changes are tests/runner/report only.
- Existing React act warnings in two mounted video tests and expected mocked Keychain error log; all selected suites passed. Full repository regression was not rerun.

Decision: PASS for requested local offline-v2 flow on test runtime and real isolated PostgreSQL; no claim of full native, migration or external media acceptance.
