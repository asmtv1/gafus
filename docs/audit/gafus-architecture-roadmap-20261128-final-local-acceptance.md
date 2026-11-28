# Final local architectural acceptance — 2026-11-28

This is a consolidated local QA candidate, not a deployment or a 10/10 certificate.

## Frozen source and integration

Base: c0828fcdede0d45455c9053fc712017c17c755bb. Final test source:
`ae5259ad0c009710d9c589f5fd59e01422e4222c`.
Separate branch qa/final-architecture-20261128 and worktree ~/Desktop/gafus-qa-final-20261128. No push, deploy, production changes, shared service restarts or physical device replay. Physical iPhone and Android are owner-accepted, not independently tested in this report.
Merged only committed, reported work; all merges clean. The source SHA precedes the final documentation-only receipt commit. Shared ancestry is preserved by merge, not repeated cherry-picks.

```text
ae5259ad0c009710d9c589f5fd59e01422e4222c test(qa): register mounted Chat2 regression in unit manifest
1378ac9c0efddf60801c25ae3259574209ba86ae Merge completed local full-service recovery receipts
f81c5be69aa4b707a99af1610ccedee76a649344 Merge verified walk full-read correction and acceptance
7eaa98d7d68352e5a80f2d23b93cdc70c342896a Merge commit 'ee4305214' into qa/final-architecture-20261128
4398d6ba4a06d2f833becdc915c92a311c3b0db4 Merge commit '2203832ec' into qa/final-architecture-20261128
a4c201558f7d51b4961e652bb93b86174aa68a16 Merge commit '8ffffae5d' into qa/final-architecture-20261128
54df3438947cff5bb8e5a007e888c9d38949e98b Merge commit '327597a98' into qa/final-architecture-20261128
0657641de98eee8e05f5bd21b50338a5a8c43375 Merge commit 'fbeeb75ab' into qa/final-architecture-20261128
c9ee4482e714247c4bd2ea102fd0fe5be1e988bc test(qa): isolate offline real-PG test outside app runtime source
b276ba4e1eaf7637a54e10def25cb933d48cb879 Merge commit 'a73b0b625' into qa/final-architecture-20261128
8562caa8bbb7a0ff982d3f8dde8d67a1894e8293 Merge commit '3d0b0ea77' into qa/final-architecture-20261128
421d39ceb811ba4e3f8f596ad3d5c658ee04b0c8 Merge commit '41d5759e5' into qa/final-architecture-20261128
749c7d8fd1cd0da45a9a2be2566126661fda4589 Merge commit '1132215bd' into qa/final-architecture-20261128
52a76d690bfb38c30d5056f95b52f4064daa56a8 Merge commit '01c48fbe8' into qa/final-architecture-20261128
9410fa8182f1613c6527d4a410e4ddae38ff3785 Merge commit '11b0544a1' into qa/final-architecture-20261128
--- unique incoming non-merge commits ---
ae5259ad0c009710d9c589f5fd59e01422e4222c test(qa): register mounted Chat2 regression in unit manifest
337b00899801d5d068180efbe2f6869406b4eea6 docs(qa): track sanitized R6 transcript for receipt checksums
2f0d6cb27a5bcb8b956735c7aa4b7ac3e5fb340c docs(qa): record completed isolated full-service restore R6
715965b266fc1ceb731cf8e645bad521d7340026 test(qa): bound restore shutdown and exit on interrupt before cleanup
da82b1c7457211f2435f05cfe39d4c72da22bb89 fix(walks): read owner tombstones once in history query
ee43052142aa10cfbf69ba9f86ef63d0920fa847 docs(qa): preserve stage 7 and 14 receipts through timed-out R5
327597a9898243a212dec28a50d1ef5bbd4c06ce test(qa): verify archived signed native releases and pinned MinIO S3
c9ee4482e714247c4bd2ea102fd0fe5be1e988bc test(qa): isolate offline real-PG test outside app runtime source
8ffffae5dc16b9384199719621e5bf1dd62c23e2 test(qa): prove stage13 mounted domain ACL and list SQL reader sizes
fbeeb75abbbf00ac5f9e085d97c0f12d2a647300 docs(qa): record stage 1 release artifact and stage 11 blocker evidence
2203832ec64b97029f4ae36f7d10af696a835386 fix(api): isolate mounted DI and classify session storage outages
a3f4507eaaeb20f290b20655f7282e8b48a77e03 chore(build): retire unused nested Admin Vite config
a73b0b62532837da0b00bd44199b983aa496f661 test(qa): record historical read slices and PostgreSQL plan budgets
1132215bd0954faf4db7a368bbcd220ca35f5d0a docs(qa): confirm stage13 PG replay and exam unit regression
41d5759e5bc0222a6f78752584b92f613439e2fc docs(qa): record Compose readiness and blocked browser acceptance
5c679e3a04698c174108ede21d75be859cad1fbe docs(qa): record stage13 real PG results and remaining boundaries
d64aeefa336f7af30c949ed89ddfe7b04ce26ab2 fix(exam): validate submission step binding and cover stage13 PG boundaries
96174e54988d1011ec4138d3e6c684d9998cfcab test(qa): flush actual callback trace at private acceptance boundary
6c79719a0f0298afd141a8f19d531d45e1af021e test(web-e2e): bound local readiness wait and require expected HTTP statuses
600c3c0872542ebe8d46a341983289bf2a619087 test(qa): resolve executable package exports in recovery launchers
11b0544a1d58f23bf1ddebf8fd1eb765ade31b05 test(qa): prove offline v2 restart and lost ACK on isolated PostgreSQL
70d9cec9914e1a69d1fe39ce84057d872238d884 test(qa): surface broker failures before disposable teardown
01c48fbe8fe1eb922ce7bce865946e5d1f049a9e docs(qa): record stages 6 8 10 integration evidence and open gates
3d0b0ea77a3c56f085856e83868c45496570f331 fix(chat2): use stable broker idempotency key across outbox retries
be73f6ad3c2c17dc70d7224e9992bed6b76e4dd2 test(ota): synchronize archive rules and prove mandatory download recovery
d0a36a1b35a42715412301f30961027cec649f71 test(qa): add real Centrifugo outbox ACK-loss and history assertions
27a8be643af29b5b696e2ff456a9c7dbcf19e7f8 test(qa): own real restore service PIDs and diagnose readiness safely
58824eaa151beb84bc2a7b23475acadd104b628f test(qa): fence the killed outbox ACK backend in isolated recovery drill
```

Preparation: independent frozen offline pnpm 10.12.4 install (exit 0, 6m10s); fresh Prisma 6.10.1 generate (exit 0). No copied external worktree node_modules/dist. Node 22.23.5 for final gates, private local cache, synthetic isolated test resources only. Preliminary SHA 4398d6ba passed 44 guard tests; its force build was intentionally cancelled to include completed Worker report, not a PASS. A second forced build at 7eaa98d7 was cancelled when the finished stage5 correction da82b1c74 and R6 recovery evidence 337b00899 arrived; neither interrupted build is a PASS. First map test lacked dependencies; after install 19/19 on b276ba4e. Guard initially failed on new direct Prisma import in app src; c9ee4482e moves the isolated stage9 real-PG test to apps/api/tests, updates config/imports, preserves assertions and leaves guard unchanged.

## Inherited scope evidence (not final-SHA executions)

| Stage | Source/receipt | What is supported; remaining gates |
| --- | --- | --- |
| 0 | a73b0b625, stage0-3-5 baseline report | Historical source-slice A/B on identical isolated PG, not full historic release; high host load and p95 variance. |
| 1 | fbeeb75ab, stage1-11 release followup; actual build c0828fcde | Cold/warm/public tar restore and SHA-bound private maps verified locally; maps intentionally outside Turbo cache; force required after cache-only restore. Full CI/image/publication not run. |
| 2 | 2203832ec, stage2-12 QA | 151 real HTTP requests, two Hono instances, mounted reminders/registration/wallet, local PG/Redis transient outage and rollback. Earlier registration P2028 under load; full Redis restart not tested. |
| 3 | a73b0b625 / 850874bf3 | 60 avatars 62→3 SQL statements; 80 course rights 34–39→5; comparable fixture, p95 not stable. Chat2 writes/outbox separate stage 7. |
| 4 | a73b0b625 / 850874bf3 | catalog200 first page 17–18→9 SQL, 1,216,846→33,606 JSON bytes (different wire page boundary); full traversal 27–28 vs 17 SQL, 100,580 vs 1,216,846 bytes; stable full traversal p95 OPEN. |
| 5 | a73b0b625 / da82b1c74 | empty delta 2 rows/92 bytes and empty PUT 1 row/39 bytes; prior full-read regression investigated. Actual inner tombstone scans 2000→1, equal body/rows, mounted ACL/delete/ACK and delta regression PASS. 250-tombstone median query+serialization p95 11.268→13.191 ms; stable absolute p95/large tombstone SLO remains OPEN. |
| 6 | 01c48fbe8 / 327597a98 | local PG/provider contract/replay cases, actual provider sandbox callbacks and real external sends remain BLOCKED. |
| 7 | ee4305214, real broker run 70d9cec99 | two workers, lost ACK and crash retry with one Centrifugo history publication each; idempotency bounded by broker retention; account cleanup 6/6 on 58824eaa1; complete local restore R6 recorded at 715965b26. |
| 8 | 327597a98 | real pinned local MinIO signed URL/Range/expiry/restart/deletion verified; real CDN read-only canary checks; actual purge, warm HIT and cloud revoke/readback BLOCKED. |
| 9 | 11b0544a1 | local offline-v2 disk-backed synthetic client/PG restart/lost ACK, quarantine ownerless old format; no real historical device backup or OS kill; test moved on integration branch. |
| 10 | 327597a98 | local OTA contracts/PG and mounted gates; five unique native archives and seven OTA manifests verified, two registry trust checks; 17602 AAB and several exact manifest/registry associations missing; no store publish. |
| 11 | c0828fcde / fbeeb75ab | actual Vite/Metro export and mounted UI; secure-cookie diagnostic explains Python HTTP 401, not Chrome proof. Browser quarantine: Web entry/viewer/Admin paging and full UI account deletion remain BLOCKED. Physical devices owner-accepted. |
| 12 | 2203832ec | public ownership/source graph/built export checks on prior checkout, scoped DTO and local rollback. Full API typecheck timed out and exact Metro dependency artifact not proven; final gates separate. |
| 13 | 1132215bd / 8ffffae5d | PG domain checks, exam fix d64aeefa3, latest consultation/PG rerun PASS after unexplained double rejection; mounted HTTP ACL and article/Q&A list SQL sizes. Dashboard/analytics failure budgets, representative pet/Feed sizes, private CDN, some notification delivery remain OPEN. AI streaming transport not found in searched mounted source, no disconnect PASS. |
| 14 | 337b00899, R6 actual SHA 715965b266fc1ceb731cf8e645bad521d7340026 | R5 timeout superseded by local full-service R6 PASS: encrypted archive and fixture bytes, independent PG cluster, two APIs/workers, user action and actual broker ACK, 6 trace spans, RTO 29,106 ms, acknowledged write gap 7,898 ms (one deliberately lost post-snapshot write). Four tracked receipts pass SHA256SUMS. No approved budget, no production restore or provider backup/CDN evidence, no real prior binary rollback or Prometheus alert delivery. |

References: docs/audit/gafus-architecture-qa-20261127.md; gafus-architecture-roadmap-20261128-{stage0-3-5-baseline-acceptance,stage1-11-release-followup,stage2-12-qa,integrations-6-8-10,integrations-8-10-native-s3-followup,stage9-offline-acceptance,stage11-acceptance,worker-recovery}.md; gafus-architecture-qa-stage13-{20261128,http-sql-20261128}.md; gafus-web-e2e-compose-20261128.md. Read original receipts for actual run SHAs, logs and limitations. A merge does not transform an inherited receipt into an exact-final-SHA execution.

## Legacy register reconciliation

Owner below is the engineering role/domain, not an invented personal assignment. Exact last deployed consumer version is not assumed from static source. Historical native 1.7.5/1.7.6 evidence is bounded by the archive report; no production traffic, queue depth, pending-record or max supported offline/rollback window was inspected. No zero-traffic claim. Static searches: /tmp/gafus-final-20261128/legacy-inventory.log (8562caa8), legacy-recheck-r2.log (4398d6ba). Earlier recheck using unavailable rg was discarded; successful grep rerun retained.

| Roadmap row | Owner and concrete current evidence | Disposition and removal condition |
| --- | --- | --- |
| composition/install, register ports/test shims | API/Core composition; ratchet 0/34 on 4398; tracked install-* contract tests under apps/api/src/modules still cover behavior | Runtime retired in inspected source; keep test coverage, remove names only with equivalent contract; exact final guard + two-instance HTTP. |
| Six OTA API facades | mobile-ota-server/API; ownership report documents six gone, API public subpaths | Source retired; built exports and mounted manifest exact-SHA validation required. |
| Core pure reexports | core-client, Core, Web/Mobile; ownership report records Feed publication facade removed and three dangling entries removed | Partial source retirement; retain supported old contracts until final bundle and compatibility evidence, not delete by name. |
| Next/build traces | build/release; no tracked next.config.*, but turbo.json/eslint/tooling mention Next. Nested Admin Vite config deleted a3f4507ea; root package build/dev/start explicitly point to vite.config.mjs, CI negative contract | Confirmed nested orphan removed. Other cleanup requires actual cold/warm build, consumers and release/rollback proof. |
| Prisma backup/emitted Auth | Prisma/Auth; no tracked schema.prisma.backup or matching Auth src emitted .js/.d.ts/.map in inventory | Source cleanup observed; fresh generation and build needed, migrations retained. |
| Trainer preview/mock | Trainer; LiveTrainerApp and mountTrainerEntry import TrainerOptInRoute; historical mock absent in prior production graph | Live route retained. Remove prototype only with route/authoring parity and output graph evidence. |
| g1/review/OptIn/Legacy names | API/Trainer/Mobile domain owners; actual optIn route and named test fixtures | Naming is not a deletion proof; migrate mounted path and test with owner. |
| Old catalogue/walk projection | course-read-server/tracking-server/API/Mobile; mounted walks and offline routes; supported mixed clients | Keep historical wire data until exact supported client/rollback window, deletion/delta/replay verified. |
| Offline writers/PWA | Mobile offline/core-client, Web; retireLegacyPwaInBrowser invoked main.tsx:51; ownerless legacy pending data quarantined | Keep PWA cleanup until returning clients/maximum offline lifetime defined; no pending loss/owner reassignment. |
| Retired Feed photo queue | feed-server/Worker; cron-scheduler.ts dynamic import feed-retired-photo-queue; package export retiredPhotoQueue | Live drainer; keep until producers stopped, waiting/delayed/active/failed/lease and recovery tail empty over retry window. |
| Beget/CDN/dual purge | media-server/CDN-upload/infra; begetCdnPurge.ts, beget-provider-audit.yml, infra diagnostics | Still shipped compatibility; require actual scoped purge/revoke/readback and supported old URLs/receipts exhausted. |
| Stream Chat | Worker/media operations; accountCleanupWorker.ts invokes deleteAccountStreamFiles, old configurator linked in docs/reference/CI_SCRIPTS.md and archive | Preserve live deletion until snapshots drained; configurator not found in active tracked runtime, but documented operation and external tail unresolved; no deletion. |
| VK/historical delivery | Auth/Mobile release; verify-no-vk-auth.mjs is called by mobile test and verify:native-release | Guard remains intentional; exact supported archive/deep links/migrated account proof required. |
| Native 175/patches | Mobile release; package.json ota:175:prepare/finalize/check/build and iOS store verify, deployment runbook | Live documented 1.7.5 build path, not orphan; preserve until replacement compatible with supported signed runtime/patch verification. |
| Temporary flags/dual reads | feature-flags-server and each domain; product-flags.md and environment-flags.md assign controls, defaults and retirement gates | Product/security/consent switches stay; migration flags retire only after supported releases/rollback and telemetry window. |
| Old reports/profiles | QA/release; package.json, test-system.mjs, run-legacy-matrix.mjs, tests/catalog and support test reference legacy ledger | Active QA consumers; remove only after equivalent mandatory CI/report receipts and no catalog/runbook/checksum references. |

No unverified legacy deletion performed. Confirmed orphan is the nested Admin Vite config integrated via fbeeb75ab. Criterion 10 remains partial until version/traffic/rollback conditions are measured. Historical migrations, durable receipts, billing codes, old OTA trust and tombstones are compatibility obligations, not boilerplate.


## Intermediate integrated-SHA evidence and launch corrections

On 1378ac9c0efddf60801c25ae3259574209ba86ae (before the manifest-only change ae5259ad):

- Full forced build 67/67, 0 cache hits, 5m22.751s, exit 0, Terminal job 69811f1a148d27ebfa0ab14ed6d57a6fd09d8badaac88e00.
- Guards 44/44; built exports 67 packages, 389 exports, 2762 import references; CI/private maps contracts 23/23. Actual map dry runs: Web 133, Admin 23, Trainer 4. Public dist pack and independent restore all 3, no publish.
- Offline real PG 3/3 (moved test); consultation and exam PG PASS; DI 153 HTTP, two mounted Hono instances and previous-QA rollback. Walks bootstrap historical 163 + forward 29, migrate status PASS, second migrate deploy NOOP, full-read plan and delta/replay mounted ACL PASS, tracking unit 3/3.
- Chat2 real broker, recovery and 7 of 10 integration tasks failed before PG startup; a separate disposable probe retained actual server error: postmaster became multi-threaded at startup, hint to set LC_ALL. Scripts which independently exported LC_ALL=C ran successfully. Locale correction is launch environment only; no product or harness bypass. Initial integration report 3/10 pass, 7/10 failed. Stage13 HTTP report path rejected because it lacked 20 hex ID and attempt directory; corrected invocation. Initial typecheck/lint exited 1 due mutually exclusive --force and --cache CLI flags (no actual TS/lint checks). Corrected by TURBO_FORCE=true with explicit local-only cache.
- Unit profile failed closed WEB_VITE_GROUP_MANIFEST_DRIFT because c0828fcde added Chat2Messenger.stage11.mounted.test.tsx without registering it. Official generator 'node scripts/qa/web-vite-group-inventory.mjs write', then check, verified 42 groups and 303 files, exactly one added test entry, no removal. Commit ae5259ad changes only tests/catalog/web-vite-groups.json. No product changes from 1378ac9c. The global Turbo dependency is changed, so the complete final run must use ae5259ad, not relabel earlier results. This intermediate evidence is kept separately.
- Final rerun environment: env -i HOME PATH TMPDIR, LC_ALL=C LANG=C TZ=UTC CI=true, VITEST_MAX_WORKERS=1, TURBO_FORCE=true, no remote cache or provider credentials, synthetic unused PG URL only for build. Verified Centrifugo v6.9.7 copied byte-for-byte from prior isolated worker worktree (not a product artifact), SHA256 e0068f14dbafe5032448395159c83315f375793dcca545a13ffab39a51964e12. Stage13 report path in owned .qa/testing/qa-final-ae5259-stage13/tasks/13780000000000000000/attempt-1/tests.json. Prior exact rollback worktree verified clean for tracked files and pinned at 2f485a394.


## Final execution on ae5259ad0c009710d9c589f5fd59e01422e4222c

Terminal job: 47969ffce0a294072364af98183503a0044a4728e1043780. Each gate verified clean tracked worktree and frozen HEAD before launch. Commands executed sequentially; build, typecheck and lint use concurrency 1; Vitest max workers 1. The orchestration exit code is not the gate result. The final receipt commit changes documentation/evidence only; it is not a replacement test SHA.

The full unit profile was deliberately cancelled after the already-reproduced mandatory typecheck/lint failures and extended local runtime. Durable job state cancelled, SIGTERM, 2026-11-27T23:05:37.915Z; five planned tasks passed, API cancelled, 102 not started out of 108. This is an operator scope decision, not a unit test failure or a PASS. Targeted serial follow-up job c76629b71c4f9f56c9a6f9962f9956942c060f5063eaa198 ran on the unchanged SHA: exam 33/33, worker Chat2 outbox 5/5, mounted Chat2 1/1. No background follow-up is pending.

Actual start/end times (UTC):

```text
2026-11-27T22:42:22Z START build
2026-11-27T22:45:51Z END build rc=0
2026-11-27T22:45:51Z START guards
2026-11-27T22:46:16Z END guards rc=0
2026-11-27T22:46:16Z START built-exports
2026-11-27T22:46:22Z END built-exports rc=0
2026-11-27T22:46:22Z START sourcemap-contracts
2026-11-27T22:46:27Z END sourcemap-contracts rc=0
2026-11-27T22:46:27Z START private-gafus-web
2026-11-27T22:46:28Z END private-gafus-web rc=0
2026-11-27T22:46:28Z START private-gafus-admin-panel
2026-11-27T22:46:28Z END private-gafus-admin-panel rc=0
2026-11-27T22:46:28Z START private-gafus-trainer-panel
2026-11-27T22:46:28Z END private-gafus-trainer-panel rc=0
2026-11-27T22:46:28Z START app-links
2026-11-27T22:46:28Z END app-links rc=0
2026-11-27T22:46:29Z START pack-public
2026-11-27T22:46:29Z END pack-public rc=0
2026-11-27T22:46:29Z START restore-web
2026-11-27T22:46:31Z END restore-web rc=0
2026-11-27T22:46:31Z START restore-admin-panel
2026-11-27T22:46:31Z END restore-admin-panel rc=0
2026-11-27T22:46:31Z START restore-trainer-panel
2026-11-27T22:46:31Z END restore-trainer-panel rc=0
2026-11-27T22:46:31Z START offline
2026-11-27T22:46:39Z END offline rc=0
2026-11-27T22:46:39Z START consult-exam
2026-11-27T22:46:44Z END consult-exam rc=0
2026-11-27T22:46:45Z START chat2-real
2026-11-27T22:46:57Z END chat2-real rc=0
2026-11-27T22:46:57Z START di-http
2026-11-27T22:47:39Z END di-http rc=0
2026-11-27T22:47:39Z START stage13-http
2026-11-27T22:47:53Z END stage13-http rc=0
2026-11-27T22:47:53Z START walks
2026-11-27T22:49:59Z END walks rc=0
2026-11-27T22:49:59Z START recovery
2026-11-27T22:50:59Z END recovery rc=0
2026-11-27T22:50:59Z START typecheck
2026-11-27T22:53:55Z END typecheck rc=2
2026-11-27T22:53:55Z START lint
2026-11-27T22:54:42Z END lint rc=1
2026-11-27T22:54:43Z START integration
2026-11-27T23:03:12Z END integration rc=0
2026-11-27T23:03:12Z START unit
2026-11-27T23:05:58Z START unit-exam
2026-11-27T23:06:02Z END unit-exam rc=0
2026-11-27T23:06:02Z START unit-chat2-worker
2026-11-27T23:06:06Z END unit-chat2-worker rc=0
2026-11-27T23:06:06Z START unit-chat2-mounted
2026-11-27T23:06:25Z END unit-chat2-mounted rc=0
```

### Actual commands and gate results

| Gate | Status / exit | Command | Result / boundary | SHA-256 of raw log |
|---|---|---|---|---|
| app-links | PASS / 0 | `node scripts/qa/verify-gafus-app-links.mjs --dist apps/web-vite/dist` | Source/dist contract only; no deployed endpoint check. | `a85f0928175a1ede60f9162a1fc0117d1957509cde2824454b72680e5b04d1dc` |
| build | PASS / 0 | `env GAFUS_PRIVATE_MAPS_ENABLED=true GAFUS_PRIVATE_MAPS_DIR=/tmp/gafus-final-20261128/private-ae5259ad0c009710d9c589f5fd59e01422e4222c GAFUS_RELEASE_SHA=ae5259ad0c009710d9c589f5fd59e01422e4222c VITE_GAFUS_BUILD_ID=ae5259ad0c009710d9c589f5fd59e01422e4222c VITE_GAFUS_TELEMETRY_ENABLED=false pnpm exec turbo run build --concurrency=1 --cache=local:rw --cache-dir=/tmp/gafus-final-20261128/turbo-ae5259ad0c009710d9c589f5fd59e01422e4222c` | 67/67 tasks, 0 cached, 3m27.541s forced local build. | `8a0b0ee28f73231b473e55b2726f7898c7c96d3d21a2b0899db8eebac2a9fb77` |
| built-exports | PASS / 0 | `pnpm check:workspace-built-exports` | 67 packages, 389 exports, 2762 import references, 312 public subpaths, 96 explicit root QA paths. | `b6d5b0785141a1186884bb5cc65051ea4d8d9658f37cc0ebd7a9318044388c57` |
| chat2-real | PASS / 0 | `bash scripts/qa/chat2-outbox-multiprocess-acceptance.sh --real-broker` | Actual broker, two workers, all 3 event histories exactly one publication after retries; retention bounds apply. | `59a2e8202f92c107440eb7132f85da0b99a594cd4a839ab21a70d2abfe8e7a2f` |
| consult-exam | PASS / 0 | `bash scripts/qa/stage13-consult-exam-isolated-pg.sh` | Both named PG consultation/exam cases pass. | `7937df00ed009e277ad95cea36dc1b1108cdf2cbc11cc93e6c2d5afa54b8a562` |
| di-http | PASS / 0 | `env GAFUS_DI12_QA=1 DI12_ROLLBACK_ROOT=/Users/asmtv1/Desktop/gafus-qa-di12-rollback-20261128 bash scripts/qa/stage2-12-di-http-isolated.sh` | 153 HTTP requests, two API instances, actual PG/Redis and prior QA API rollback; not entire supported-client matrix. | `3b1a780a3d894ca36f8b5d6a7fe488d0834f088b433a51c322fe57acd17b2bc4` |
| guards | PASS / 0 | `pnpm check:core-boundaries` | 44/44 guard tests; no guard weakened. | `97df5a0643a55a5355f2636955322e66d22d08d233903b4fed993858efcdfc89` |
| integration | PASS / 0 | `pnpm test:integration --run-id qa-final-ae5259-integration` | PASSED=10 | `6da5d4eb4ff66c214bee585a75e0deb440905f3f8fc57815710175adeea12bc5` |
| lint | FAIL / 1 | `pnpm exec turbo run lint --concurrency=1 --cache=local:rw --cache-dir=/tmp/gafus-final-20261128/turbo-ae5259ad0c009710d9c589f5fd59e01422e4222c` | 3/6 successful, rc1; @gafus/web-vite Chat2Messenger.stage11.mounted.test.tsx: unused describe, 6 warnings (empty methods 90/92/93, max-len 208/225, console 229), --max-warnings 0. Mobile 1218 warnings, 0 errors. Not all lint tasks passed. | `b19dd65f6570363018579a6bad8b472701deeee16f1d6926cba05660c7d7ba5d` |
| offline | PASS / 0 | `bash scripts/qa/offline-v2-stage9-isolated-pg.sh` | 3/3 real PG restart and lost ACK, owner quarantine. | `9d6a52e67afd61dedb47824343e890d9ad3bd00c8835a3967877363c8bddea25` |
| pack-public | PASS / 0 | `node scripts/qa/vite-release-dist-artifacts.mjs pack --sha ae5259ad0c009710d9c589f5fd59e01422e4222c --workspace /Users/asmtv1/Desktop/gafus-qa-final-20261128 --dir /tmp/gafus-final-20261128/public-ae5259ad0c009710d9c589f5fd59e01422e4222c` | Public Vite artifacts sealed and packed; no upload. | `f2207173bd53a38ae57ca73c191e54e3fa99f8ad1d493bd2bebe5d50ae303ea3` |
| private-gafus-admin-panel | PASS / 0 | `node scripts/observability/upload-private-web-sourcemaps.mjs --directory /tmp/gafus-final-20261128/private-ae5259ad0c009710d9c589f5fd59e01422e4222c/gafus-admin-panel/ae5259ad0c009710d9c589f5fd59e01422e4222c/ae5259ad0c009710d9c589f5fd59e01422e4222c` | DRY RUN only: 23 maps, 1,910,801 bytes, exact releaseSha. | `a9521cc1eaa511919afc6cca6ecccfa7bf44dc66fc73a122da0662671a612e64` |
| private-gafus-trainer-panel | PASS / 0 | `node scripts/observability/upload-private-web-sourcemaps.mjs --directory /tmp/gafus-final-20261128/private-ae5259ad0c009710d9c589f5fd59e01422e4222c/gafus-trainer-panel/ae5259ad0c009710d9c589f5fd59e01422e4222c/ae5259ad0c009710d9c589f5fd59e01422e4222c` | DRY RUN only: 4 maps, 5,818,019 bytes, exact releaseSha. | `71c2d058a25f4585706285bec5742a75251b3f22f88b5774cfe25617bcfbd2bb` |
| private-gafus-web | PASS / 0 | `node scripts/observability/upload-private-web-sourcemaps.mjs --directory /tmp/gafus-final-20261128/private-ae5259ad0c009710d9c589f5fd59e01422e4222c/gafus-web/ae5259ad0c009710d9c589f5fd59e01422e4222c/ae5259ad0c009710d9c589f5fd59e01422e4222c` | DRY RUN only: 133 maps, 15,522,906 bytes, exact releaseSha. | `35e0d420e670bb5b8599336521da75756a2d8b096338efa3c74d920647df47e0` |
| recovery | PASS / 0 | `env A2_RESTORE_SKIP_ACCEPTED_OUTAGES=1 bash scripts/qa/observability-restore-rpo-rto.sh --service` | Local synthetic archive and full services restore; RTO 23626 ms, acknowledged gap 4663 ms (one deliberate post-snapshot write loss), outbox drain 1793 ms, 6 spans. No production guarantee. | `ab1227f24aacab5d7e8920957c19eb9dcc4f535d06be2cef45eb43fa9da77f09` |
| restore-admin-panel | PASS / 0 | `node scripts/qa/vite-release-dist-artifacts.mjs restore --sha ae5259ad0c009710d9c589f5fd59e01422e4222c --workspace /tmp/gafus-final-20261128/restore-ae5259ad0c009710d9c589f5fd59e01422e4222c --dir /tmp/gafus-final-20261128/public-ae5259ad0c009710d9c589f5fd59e01422e4222c --component admin-panel` | Restored and checked in separate local destination. | `a25487974cb2833e778376e9bebba737bc4523fd2e31c058c02501f55a655419` |
| restore-trainer-panel | PASS / 0 | `node scripts/qa/vite-release-dist-artifacts.mjs restore --sha ae5259ad0c009710d9c589f5fd59e01422e4222c --workspace /tmp/gafus-final-20261128/restore-ae5259ad0c009710d9c589f5fd59e01422e4222c --dir /tmp/gafus-final-20261128/public-ae5259ad0c009710d9c589f5fd59e01422e4222c --component trainer-panel` | Restored and checked in separate local destination. | `1e9cb7ccec15cc5e3c8de19ac5d2478dd9d28457fa09e81f7fd812e7ec18bc8f` |
| restore-web | PASS / 0 | `node scripts/qa/vite-release-dist-artifacts.mjs restore --sha ae5259ad0c009710d9c589f5fd59e01422e4222c --workspace /tmp/gafus-final-20261128/restore-ae5259ad0c009710d9c589f5fd59e01422e4222c --dir /tmp/gafus-final-20261128/public-ae5259ad0c009710d9c589f5fd59e01422e4222c --component web` | Restored and checked in separate local destination. | `87688eac99d40b58b18df40cf657a214071422ab72e11f650f0e4b1e27779946` |
| sourcemap-contracts | PASS / 0 | `node --test scripts/observability/seal-vite-sourcemaps.test.mjs scripts/observability/upload-private-web-sourcemaps.test.mjs scripts/qa/vite-release-dist-artifacts.test.mjs tests/support/turbo-test-cache-inputs.test.mjs ci-cd/scripts/release-graph.contract.test.mjs` | 23/23 contracts. | `73b25d8c6174b01f8a9f78a17e31d1ddd0c7f744be4386b29d1ad19112ba766e` |
| stage13-http | PASS / 0 | `env GAFUS_TEST_REPORT_PATH=/Users/asmtv1/Desktop/gafus-qa-final-20261128/.qa/testing/qa-final-ae5259-stage13/tasks/13780000000000000000/attempt-1/tests.json bash scripts/qa/stage13-http-sql-isolated.sh` | 5/5 mounted HTTP cases, article and Q&A reader sizes. | `f6bffc0c6728cf9df60b3583fbde42fdc12e826ab1113c5a0f6cd5431a42ae57` |
| typecheck | FAIL / 2 | `pnpm exec turbo run typecheck --only --concurrency=1 --cache=local:rw --cache-dir=/tmp/gafus-final-20261128/turbo-ae5259ad0c009710d9c589f5fd59e01422e4222c` | 44/62 successful, rc2; @gafus/api TS2339 in src/test/stage2-12-di-http.acceptance.mts lines 268, 287: closeAllConnections missing on ServerType. Remaining tasks not passed. | `47d70872fa37d86c7c9df5c9dec4a130a1781ac67ee8a27d91702af3be6617c6` |
| unit-chat2-mounted | PASS / 0 | `pnpm --filter @gafus/web-vite exec vitest run src/features/chats/Chat2Messenger.stage11.mounted.test.tsx --maxWorkers=1` | 1/1 long chat typing/reconnect mounted test; not physical browser. | `ef692ec68f8a5c87d9e90557f31868e203bde8ca3ad24303031460dbd70d0567` |
| unit-chat2-worker | PASS / 0 | `pnpm --filter @gafus/worker exec vitest run --config vitest.config.ts src/chat2-outbox-reliability.test.ts --maxWorkers=1` | 5/5 targeted stable idempotency regression. | `fbe8bffa3333536ff4f19bfd3f213070623cdd0cd172bb7d8adabf1023808235` |
| unit-exam | PASS / 0 | `pnpm --filter @gafus/core exec vitest run --config vitest.config.ts src/services/exam/examService.test.ts --maxWorkers=1` | 33/33 targeted exam regression; no full profile claim. | `e14f3aeafc2cc8daabe8d977efc51c6e29f0077500c732c46cfc28c3c1de2d21` |
| unit | INCOMPLETE / not recorded | `pnpm test:unit --run-id qa-final-ae5259-unit` | BLOCKED=1, PASSED=5; cancelled explicitly; 108 planned, 5 PASS, 1 cancelled, 102 not started; no final exit receipt. | `87662f11eda5adf5dc41de574cf24a86d83750e189e7468741ad71658dfc1666` |
| walks | PASS / 0 | `bash scripts/qa/walk-full-read-risk-isolated-pg.sh /tmp/gafus-final-20261128/walk-ae5259ad0c009710d9c589f5fd59e01422e4222c verify` | 163 historical + 29 forward migrations, second migration NOOP, historical/candidate plan comparison, mounted HTTP ACL/replay/tombstones, delta checks. | `e87c7bbe4f247f6e1664bf05a998f27f7e8d39871018c150d4737c31061dcbde` |

Raw logs, commands and exit receipts: /tmp/gafus-final-20261128/gates-ae5259ad0c009710d9c589f5fd59e01422e4222c. Commands can be replayed with independent disposable resources; no production credentials.

### Structured exact-run measurements

- Walk empty: 2000 rows, 546025 bytes, median pair p95 8.462 -> 7.967 ms; inner scans {'baseline': [{'type': 'Seq Scan', 'loops': 2000, 'rows': 0, 'hits': 0, 'read': 0}], 'proposed': [{'type': 'Seq Scan', 'loops': 1, 'rows': 0, 'hits': 0, 'read': 0}]}. Historical arm a73b0b62532837da0b00bd44199b983aa496f661, candidate arm final HEAD; loaded host, not agreed SLO.
- Walk realistic: 2000 rows, 546025 bytes, median pair p95 7.840 -> 7.946 ms; inner scans {'baseline': [{'type': 'Seq Scan', 'loops': 1, 'rows': 250, 'hits': 3, 'read': 0}], 'proposed': [{'type': 'Seq Scan', 'loops': 1, 'rows': 250, 'hits': 3, 'read': 0}]}. Historical arm a73b0b62532837da0b00bd44199b983aa496f661, candidate arm final HEAD; loaded host, not agreed SLO.
- Walk delta: history 2000, empty response 92 bytes, empty ACK 39, one change 364, initial 546090; owner isolation, cursor replay, tombstone wins all verified.
- Mounted list SQL: `{"name": "articles", "seedCount": 200, "returnedItems": 50, "responseJsonBytes": 22769, "httpMs": 8.236917000000176, "selectCalls": 11, "sqlReturnedRows": 56}`.
- Mounted list SQL: `{"name": "questions", "seedCount": 200, "returnedItems": 20, "responseJsonBytes": 28137, "httpMs": 7.468540999999277, "selectCalls": 11, "sqlReturnedRows": 29}`.
- Recovery receipt: `{"runPrefix":"a2-obs-","recordedAt":"2026-11-27T22:50:50.072724+00:00","scope":"disposable PG crash -> encrypted external archive (storageMode in receipt) -> independent PG cluster and restored objects -> fresh 2 API + 2 Chat2 Worker -> authenticated user operation and ACK; synthetic media and X.509 signed preview OTA","externalArchive":{"status":"ISOLATED_OBJECT_RESTORE_BYTES_VERIFIED","id":"9709ede69495a3686e7c3fd445718764","objects":3,"ota":{"releases":2,"previous":1,"active":1,"expiredHistorical":0},"unmapped":{"petDocuments":0,"questionPhotos":0,"chat2V2ReadyMissingManifest":0,"questionV2ReadyMissingManifest":0},"dbSha256":"82f6ceac2f3377f29ef550cba04ea4f2874962c3ad4895985b7fa793c586f1c9","objectRestoreElapsedMs":1577,"serviceRto":"UNVERIFIED","cdnAccessPolicy":"UNVERIFIED","storageMode":"file-backed-fixture"},"fullServiceRtoMs":23626,"serviceReadinessMs":19627,"userScenario":{"auth":true,"privateCourse":true,"walk":true,"mediaBytes":true,"previousSignedOta":true,"chatHistory":true},"postRestoreRealUserOutboxAck":true,"freshServiceProcesses":true,"realUserTraceChain":true,"observedAcknowledgedRpoGapMs":4663,"observedAcknowledgedWriteLossCount":1,"restoredPreviouslyAcknowledgedWrite":true,"postBackupAcknowledgedWriteAbsent":true,"restoredPendingOutbox":true,"restoredDeadLetter":true,"restoredPendingWorkerDrainMs":1793,"allServiceReadiness":true,"checks":"PASS","stagingRpoRto":"PENDING","productBudgetStatus":"UNSPECIFIED","productBudgetMs":{"fullServiceRtoMs":null,"observedAcknowledgedRpoGapMs":null}}`. Restore-only run deliberately skipped repeated prior load/outage drills; staging/production RPO/RTO and product budget remain unverified.

### Profile task receipts

**integration** — .qa/testing/qa-final-ae5259-integration

```text
PASSED    account.delete.pg [node]  (6751 ms)
PASSED    chat.delivery.pg [node]  (4967 ms)
PASSED    feed.order.pg [node]  (4869 ms)
PASSED    infrastructure.contracts.python [node]  (110 ms)
PASSED    mobile.ota.pg [node]  (9391 ms)
PASSED    payment.lifecycle.pg [node]  (8833 ms)
PASSED    schema.fresh.pg15 [node]  (228493 ms)
PASSED    schema.fresh.pg18 [node]  (232745 ms)
PASSED    security.authorization.http [node]  (2550 ms)
PASSED    training.complete.pg [node]  (8535 ms)
```

Profile summary SHA-256: `2e0171c93957aa52b923e1290371c3eff4ed65c7460659ba729aa1cfadfd772e`. Original summary retained locally.

**unit** — .qa/testing/qa-final-ae5259-unit

```text
PASSED    workspace.unit.@gafus/achievements-server [node]  (2217 ms)
PASSED    workspace.unit.@gafus/admin-panel [node]  (68945 ms)
PASSED    workspace.unit.@gafus/admin-reengagement-server [node]  (3411 ms)
PASSED    workspace.unit.@gafus/admin-rewarded-ads-server [node]  (2448 ms)
PASSED    workspace.unit.@gafus/analytics [node]  (2013 ms)
BLOCKED   workspace.unit.@gafus/api [node] test cancelled (65311 ms)
```

No completed profile summary; incomplete, not PASS.


## Stage disposition against the frozen source

PASS below is scoped, not a declaration of full roadmap acceptance. Inherited evidence is identified in the earlier table and must not be relabeled as execution on this SHA. Final integration profile: PASS; final unit profile: INCOMPLETE; mandatory typecheck and lint FAIL.

| Stage | Exact final-SHA evidence | Disposition / missing proof |
|---|---|---|
| 0 | Frozen independent install, exact source build and isolated run environment | PARTIAL; historical comparable baseline inherited; no repeat of all original baseline slices. |
| 1 | Forced build, 23 contracts, private-map dry run, pack and independent restore of all three public archives | Local PASS; full CI/cache warm chain and image/publish not executed on final SHA; no production gate. |
| 2 | DI HTTP PASS 153 requests, two API instances, prior QA rollback | PARTIAL / typecheck FAIL in DI harness; full Redis restart and supported client matrix not proven. |
| 3 | Chat2 real-broker and relevant profile tasks; guard and built exports | PARTIAL; inherited avatar/rights SQL measurements, not final-SHA rerun; stable p95 budget open. |
| 4 | Built exports and relevant profile tasks | PARTIAL; inherited catalog measurements, full-traversal stable budget open. |
| 5 | Walk real PG, historical and candidate plans, delta bytes and ACL/ACK replay PASS | Local PASS; absolute p95/large-tombstone SLO still open. |
| 6 | Integration profile PASS; see named payment lifecycle task | PARTIAL; real external callback, provider sandbox, external sends not verified. |
| 7 | Real Centrifugo, two Workers, ACK loss/crash/replay PASS; integration task receipts | Local PASS scoped to exercised delivery and retention; external transport/staging monitoring not proven. |
| 8 | Final restore verifies synthetic object bytes; inherited real MinIO evidence | PARTIAL; real CDN purge/cache HIT/revocation/readback blocked. |
| 9 | Real PG offline 3/3 and owner quarantine PASS | Local PASS; historic device backup/OS termination not independently replayed. Physical devices owner-accepted. |
| 10 | OTA integration task, source app-links, signed preview restore | PARTIAL; exact signed archive/registry associations and AAB gaps from prior receipt; no publication. |
| 11 | Vite build/restore, unit profile INCOMPLETE, lint FAIL in mounted Chat2 harness | BLOCKED for browser UI; no real authenticated browser acceptance; devices owner-accepted. |
| 12 | 44 guards, built exports, DI HTTP PASS | PARTIAL / mandatory typecheck FAIL; exact Metro native dependency artifact still missing. |
| 13 | Consultation/exam PG and mounted HTTP 5/5 PASS, list SQL measured | PARTIAL; dashboard/analytics failure budgets, representative other lists, AI stream disconnect, external notification and private CDN open. |
| 14 | Full local synthetic restore PASS, real broker ACK, trace correlation; RTO/gap/drain above | Local PASS; no approved SLO, real backup/provider/production data, Prometheus alert delivery, real binary rollback not proven. |

## Roadmap ten criteria

| Criterion | Disposition | Evidence and remaining blocker |
|---|---|---|
| 1. Understandability | PARTIAL | Ownership/source graph, public exports, DI and named domain tests; independent second engineer change not demonstrated; DI QA typecheck failure. |
| 2. Boundaries | LOCAL PASS / PARTIAL overall | 44 guards and 389 built exports pass; native Metro artifact scope and mandatory TS failure remain. |
| 3. Read cost | PARTIAL | Historical chat/catalog SQL/bytes; exact final walk comparison; high load, no agreed adjacent-scenario p95 budgets. |
| 4. Write consistency | PARTIAL | Exact PG/Chat2/consult/exam/offline cases and integration PASS; actual provider callbacks and full restart coverage of every listed operation not proven. |
| 5. Rights and data | PARTIAL | Mounted ACL and ownership, offline quarantine, account deletion profile and recovery; real CDN revoke/readback and complete browser logout/delete absent. |
| 6. Client experience | BLOCKED in full | Physical devices accepted by owner; offline local pass, browser blocked, full comparable LCP/INP/TTI/memory evidence not established. |
| 7. Compatibility | PARTIAL | Local prior-QA API rollback and offline contracts; missing signed archive associations/AAB and full supported binary matrix. |
| 8. Operations | PARTIAL | Real local queue, PG/Redis transient failure and restoration, spans and measured RTO; external provider/alert/staging proof and budget open. |
| 9. Reproducibility | FAIL mandatory / PARTIAL | Exact forced build and symbols/public archives, clean migrations, restore; typecheck and lint FAIL; unit INCOMPLETE, integration PASS; no full CI/image digest/published release chain. |
| 10. Completed migration | PARTIAL | Registry reconciled, live consumers/owners/removal conditions recorded; confirmed orphan removed, no actual supported traffic/rollback-window proof. |

## Final decision

Local consolidated candidate assembled; not release-ready and not 10/10 accepted. Typecheck and lint blockers reproduced on exact source; unit INCOMPLETE; integration PASS. No further source edits were made after freezing ae5259ad, so the reported gates are all attributable to the same source. The two harness failures remain actionable: narrow HTTP ServerType safely before calling closeAllConnections and clean the mounted Chat2 test lint violations without weakening rules or deleting assertions. Re-run mandatory gates on any successor SHA. External sandbox, authenticated browser, missing native artifacts, real backup/data recovery, actual CDN purge and production telemetry remain unverified, not PASS. Original branches and production untouched; no push/deploy. This report is a separate documentation-only commit.


## Continuation — final local gates (supersedes the preceding historical decision)

Checked source: **f77e07d0d608d51281b2d38653db79d663e9f4ac**. Earlier execution source: ae5259ad0c009710d9c589f5fd59e01422e4222c. Branch qa/final-architecture-20261128; report-only receipt commit follows the checked source. No product runtime changes between those sources: exact non-documentation diff contains only the API DI QA harness, the Web mounted Chat2 test, and the isolated Prometheus QA downloader. No test assertions removed, no lint rules weakened. Merge 6aecc682c unchanged; merge 54c47fcc3 with alert evidence and pinned upstream checksums; f77e07d0 addresses six residual warnings (intentional no-op mock comments, wrapped lines, allowed console.warn).

### Repeated on the checked source

| Gate | Result | Command |
|---|---|---|
| typecheck | PASS, exit 0; 62/62; no cache hits; 5m21.429s | `pnpm exec turbo run typecheck --only --concurrency=1 --continue --cache=local:rw --cache-dir=/tmp/gafus-final-20261128/gates-f77e07d0d608d51281b2d38653db79d663e9f4ac/turbo` |
| lint | PASS, exit 0; 6/6; no cache hits; 1m11.42s; existing permitted warnings remain outside strict Web | `pnpm exec turbo run lint --concurrency=1 --continue --cache=local:rw --cache-dir=/tmp/gafus-final-20261128/gates-f77e07d0d608d51281b2d38653db79d663e9f4ac/turbo` |
| di-http | PASS, exit 0; 153 HTTP requests; two Hono instances; real PG/Redis; QA rollback; owned resources removed | `env GAFUS_DI12_QA=1 DI12_ROLLBACK_ROOT=/Users/asmtv1/Desktop/gafus-qa-di12-rollback-20261128 bash scripts/qa/stage2-12-di-http-isolated.sh` |
| web-chat | PASS, exit 0; 1/1 mounted test; 180-row typing/reconnect profile | `pnpm --filter @gafus/web-vite exec vitest run src/features/chats/Chat2Messenger.stage11.mounted.test.tsx --maxWorkers=1` |
| guards | PASS, exit 0; 44/44 | `pnpm check:core-boundaries` |
| built-exports | PASS, exit 0; 67 packages, 389 exports, 2762 import references; existing artifacts produced at ae5259ad, not rebuilt or re-labeled | `pnpm check:workspace-built-exports` |
| unit | PASS, exit 0; 108/108 planned tasks; 42 Web groups; repository-standard skips preserved; source fingerprint verified | `pnpm test:unit --run-id qa-final-f77e07d0-unit` |

Unit task receipts verified against the complete frozen plan (108 distinct tasks, all passed, no missing or extra task); API aggregate 2910 pass / 248 skip, Mobile 2939 pass / 1 skip. Unit job 290b88246f6472ac140a5f512bac6c0a1d0ee7ff5c3ee49c; other gates job c2a3972bae1e5cb49c1c53aec3e32f0e31730dc972e2c19a. Each process limited to one worker/serial tasks; the two independent jobs overlapped. Full unit limit 4h, not cancelled or timed out; actual durable job duration 1416440 ms (23m36.440s), exit 0. Plan fingerprint 8976d001e12ebb44bf6fd3182774c9dc2fc868c323310bb01b8edeb11bf7428e. Raw logs and named receipts in /tmp/gafus-final-20261128/gates-f77e07d0d608d51281b2d38653db79d663e9f4ac and /Users/asmtv1/Desktop/gafus-qa-final-20261128/.qa/testing/qa-final-f77e07d0-unit. Tracked sanitized summary, per-task exit/duration/log SHA256, commands and exact non-product diff: docs/audit/evidence/final-local-acceptance-20261128/.

### Inherited evidence, unchanged product

Integration 10/10 at ae5259ad (verified prior source fingerprint); full forced build 67/67, CI/private sourcemap 23/23, actual map manifests and restored public archives, real PG offline/consult/exam/walks, real Centrifugo ACK/retry, stage13 HTTP 5/5, full synthetic local restore and measured RTO/RPO. Their exact original SHA and boundaries remain in the previous sections: no new binary/map SHA, no additional external claim. Product logic and all build/lockfile/runtime inputs other than the named QA tests/scripts are unchanged; exact source-diff receipt records this. Build artifact binding stays ae5259ad. Alert delivery additionally inherited from actual run 09e4c9b3f, evidence at 54c47fcc3 verified 4/4 SHA256; real isolated Prometheus/Alertmanager firing/resolved for two rules, 40 rules validated and 25 named fixture scenarios; not actual external alert channel or production.

### Updated decision and scope

Local mandatory gates are green by the repeated checks above and explicitly inherited unchanged-product evidence. This closes earlier typecheck/lint/unit blockers in stages 2/11/12 and criterion 9, and isolated alert transport in stage 14/criterion 8. All other stage 0–14 and ten-criterion dispositions remain as in the preceding matrix except these closed local sub-gates. Browser confirmation, externally authorized sandbox callbacks, CDN purge/cache/revocation, missing exact signed archives, historical real-data restore, staging/production RPO/RTO and actual published CI/image/OTA linkage remain OPEN/BLOCKED, not PASS. Physical iPhone and Android owner-accepted. No push, deploy, production work, or changes to source branches. This is a green local candidate, not a claim of 10/10 roadmap or production acceptance.
