# Gallery Media V2 — implementation status (2026-10-28)

> Scope: isolated GAFUS Refactor (Git root `/Users/asmtv1/Desktop/gafus-refactor`, branch `vite`). No Main reads, production changes, Cloud Job deployments, CDN changes, or Git push. Existing working tree has thousands of unrelated modifications; do not reset or overwrite them.

## Status: local source implementation + focused tests; NOT production accepted

The new upload/processing path is implemented in existing modules, without introducing
another DB queue, processing service, Cloud Job type, or variant size. Cloud.ru provider conformance, existing V1 photo migration, actual two-Job
cloud execution and external CDN delivery remain OPEN; local PostgreSQL
and S3-compatible worker/Core E2E now PASS. Do not call these release-ready.

### Current and new media pipeline

V1 (legacy assets and in-progress legacy attempts, transition only):
```
presigned upload -> private S3 incoming -> Gallery claim -> Sharp 480/1920 WebP
 -> attempt-scoped temporary thumb/full -> Core HEADs -> durable publish job
 -> GET both WebPs -> PUT final album-bound keys -> Core verification/READY
 -> source + temporary cleanup
```

V2 (new claims):
```
presigned upload -> private S3 incoming -> Gallery claim under owner lock
 -> one GET original -> Sharp two sequential WebP encodes (480/1920, quality 82)
 -> conditional immutable PUT to stable photo-ID thumb/full
 -> Core independently HEADs both and matches worker manifest (ETag, bytes, MIME)
 -> recheck lease/token/reservation
 -> atomic Photo+Upload READY and durable source cleanup
 -> delayed source cleanup after presigned POST expiry
```

Worker never returns READY itself. Redis/BullMQ only wakes Gallery Cloud, while PostgreSQL
records upload, attempts, leases and deletion jobs. On callback outage, lease/recovery
retries; on partial PUT, the next attempt can recognize the same immutable bytes.

### Stable object keys

```
albums/{ownerId}/{albumId}/incoming/{uploadId}/source.{jpg|png|webp}
gallery/{ownerId}/media/{photoId}/v2/thumb.webp
gallery/{ownerId}/media/{photoId}/v2/full.webp
```

Original remains under existing presigned POST key to avoid breaking clients.
Final key is independent of albumId and attemptToken. An album move changes albumId
under the owner row lock and records a completed durable move receipt for client
idempotency; it does NOT copy V2 objects. Existing V1 album-bound objects still use
the safe legacy move/publish paths until an audited migration is completed.
The CDN origin and signed-key validators recognize V2 finals while rejecting incoming
objects and traversal. **Do not enable an anonymous bucket or public origin.**

### Transaction and cleanup invariants

- Core checks owner, album membership, photo liveness, attempt token and lease.
- Both final keys must HEAD as valid image/webp with bytes in (0, 1,750,000];
  each must match the typed worker manifest (ETag, content type, byte length).
  Declared full dimensions must match the manifest, while thumb is <=480 max-edge.
- READY for Photo and Upload, source deletion intents, and cancellation of pending
  attempt-sweep for V2 finals are written in one PostgreSQL transaction.
- A duplicate callback with the same attempt token/size is idempotently acknowledged.
  Different or stale tokens cannot publish.
- Active attempts protect the two V2 final keys from asynchronous delete jobs. READY
  photos protect their final keys. On cancellation/permanent failure, deferred sweeps
  remove partial variants after valid leases; superseded callbacks cannot revive them.
- Existing immediate and post-POST-expiry original deletion intents remain durable.
- Veterinary preview job and original-document retention were not modified; do not
  apply gallery original deletion to veterinary attachments.
- Moving clears the old album cover relationship. The owner and destination album
  are both checked; signed URLs remain time-bounded by existing expiry rules.

### S3 request behavior

`createGalleryObjectStore.create` now uses ONE conditional `PutObject` request for
an unambiguous successful write, with `If-None-Match: *`, `Content-MD5`, and
response ETag validation. On 409/412 or no ETag, it performs a confirming HEAD.
Conflicts fail closed unless ETag, content type and size equal the expected bytes.
The previous path issued HEAD+PUT+HEAD on the successful write (3 requests).
This is an isolated, test-verified **per-create call count**, not a measured provider
network/latency improvement. Provider-specific ETag behavior and conditional PUT
must still be checked against an authorized isolated Cloud.ru S3 environment.
Never claim multipart/encrypted ETag is universally MD5.

| Metric | Baseline | New (locally tested behavior) | Provider measurement |
| --- | --- | --- | --- |
| S3 operations per unconditional successful WebP create | HEAD+PUT+HEAD (3) | PUT (1) | not measured |
| S3 operations on identical conditional retry | HEAD (1) | PUT 412 + HEAD (2) | not measured |
| Extra WebP GET for Gallery publish | 2 | 0 for V2 | not measured |
| Extra WebP PUT for Gallery publish | 2 | 0 for V2 | not measured |
| Source GET per normal photo processing | 1 | 1 | not measured |
| Core final object HEADs | existing publish checks | 2 before direct READY | not measured |
| WebP variants | 480/1920 max edge, q82 | unchanged | not measured |
| Time to READY, bytes, p50/p95, RAM/CPU, real Cloud.ru GET/HEAD/PUT/DELETE | not measured in this iteration | not measured | OPEN |

Real measurements require an isolated S3 bucket, identical samples and CPU limits,
a per-request instrumented adapter, and full upload-to-READY tracing. Do not infer
percent savings or user-perceived latency from static request counts.

### Read-only external endpoint check — 2026-10-28

Executed unauthenticated HTTPS HEAD on the **host root** from the permitted
Refactor working directory; no signed album URL or object bytes accessed:

| Endpoint root | HTTP | TLS verification |
| --- | --- | --- |
| `mepsuduyokabib.begetcdn.cloud/` | **410** | passed (0) |
| `s3.cloud.ru/` | 400 | passed (0) |
| `api.beget.com/` | 301 | passed (0) |

A root request is not a valid authenticated Gallery image request. These
numbers confirm endpoint reachability and repeat the CDN 410 concern, but
**do not** prove whether a signed photo-specific CDN URL works or whether
the configured origin, secret and cache policy are correct. Changing the
existing Beget configuration or Gallery signature scheme without a validated
isolated test would endanger existing users; remains an explicit release gate.

### Two Cloud Jobs

Existing dispatcher `createCloudruGalleryPoolDispatcher` uses
`gafus-gallery-process` and conditionally `gafus-gallery-process-2` only with
`GALLERY_PROCESSOR_SECOND_READY=true`, alongside the broader processor readiness
checks. Core's owner-locked upload claim prevents both jobs from accepting the same
active attempt. Actual job identities, project ownership, 1vCPU/2GiB allocation,
container image digests, running status and two-job live test **not verified**.
Do not launch/change jobs merely because code references their names.

### Web / Mobile contracts

No new API DTO required for upload: clients continue reserving, direct S3 sending,
showing progress, polling `processing` then `ready`.
V2 move now completes directly (`ready` and destination albumId) rather than
legacy `moving` and original albumId. Web owner move ACK/readback was updated to
handle both states with destination-scoped GET verification. Mobile mutation already
invalidates the owner album query after server success.

Web source has upload queue with five transfers and status reconciliation.
Mobile source uses galleryApi shared typed client and query invalidation.
These are source/focused-test findings, **not** physical mobile device or authenticated
Web E2E acceptance.

### Confirmed local checks

- Git root exactly `/Users/asmtv1/Desktop/gafus-refactor`, branch `vite`;
  initial `git status --short`: 2,558 entries, including Gallery files.
- TypeScript: gallery-storage, gallery-cloud, core, web-vite PASS.
- gallery-storage Vitest: 64/64 PASS, including new V2 key and PUT tests.
- gallery-cloud Vitest: 51/51 PASS, including direct-final, partial retry, foreign
  claim rejection, and existing veterinary preview tests.
- Core focused gallery unit tests: 23/23 PASS (18 existing + 5 new V2 cases,
  including manifest mismatch and no-S3 move).
- Web gallery move/upload mounted tests: 23/23 PASS, including V2 immediate move.
- Mobile gallery focused tests: 50/50 PASS. Mobile whole-project typecheck:
  completed PASS on a separate durable run (exit 0, 37.4s).
- New isolated PostgreSQL database gafus_gallery_v2_test_20261028 with current
  Prisma schema: 27/27 real DB integration tests PASS, including concurrent
  claim, five uploads, partial V2 retry and guarded cleanup.
- Real local S3-compatible signed-upload GET/PUT/HEAD/DELETE test: 1/1 PASS;
  instrumented worker counted GET=1, PUT=2, HEAD=0 in normal success.
- Full real local PostgreSQL+S3+Sharp+Core worker tests: 2/2 PASS; source and
  final object deletion verified by separate S3 HEAD returning 404.
- Two provider conformance tests correctly FAIL on S3rver emulator:
  anonymous GET returns 200 instead of 403, and If-None-Match:* is ignored.
  These remain release gates; do not infer Cloud.ru behavior from S3rver.
- Test fixture DB after tests: User=0, GalleryPhoto=0, GalleryStorageJob=0.
  Existing older database preserved unchanged. No production changes.

### Open release blockers and next checks

1. Real local PostgreSQL and S3 transport E2E now PASS. Still verify late
   signed POST expiry, failure-injected orphan cleanup, private access and
   conditional PUT on an isolated compliant provider.
2. Fresh current-schema local DB 27/27 integration PASS, old V1 in-flight
   compatibility fixture retained. Older test DB was never migrated or reset.
3. Local Linux AMD64 OCI image built and executed in Docker with 1 vCPU/2 GiB.
   Local tag gafus-gallery-media-v2:local-amd64-20261028; image ID
   sha256:e14425c511c1b72a42726875476ff1ba7d93ddaded2369d85e101076411c1567.
   Image size 96,966,015 bytes. Sharp 0.34.3 loaded with libvips 8.17.1.
   Synthetic uniform 24MP JPEG took 439ms for two WebP encodes;
   RSS after processing was 108MiB (NOT measured peak).
   No registry push, Cloud Job deployment or live 2-Job acceptance.
4. Read-only audit actual two Cloud Jobs and S3/CDN ownership. Do not touch
   production or assume name equivalence establishes safe ownership.
5. Signed-CDN load/expiry/401/403/410, cache eviction and token revocation tests
   on permitted resources; earlier Beget 410 is not solved by Media V2 alone.
6. Real Web Playwright desktop/mobile viewports, native Mobile device and Moments
   picker flow; ensure no stale album photo URLs and no ACL bypass after visibility
   changes or account deletion.
7. Real load test 2 parallel jobs, 5 concurrent uploads, Redis loss, lease expiry,
   backend crash, idempotency, owner deletion and move-versus-delete.
8. Inventory V1 ready photos and any references from Moments before migration:
   compare source/final bytes and ACL for each, copy to V2 keys only after
   explicit staging test, switch keys atomically, then enqueue guarded deletion
   of obsolete objects after callback leases/CDN expiry; preserve fallback only
   until all V1 records and dependent links are accounted for.
9. Capture real per-photo S3 operation counters, bytes, p50/p95 READY, CPU/RAM
   and Web/Mobile perceived latency on representative JPEG/PNG/WebP inputs.
10. Only after full parity and migration are verified, remove V1 publish and
    album-bound copy handlers. Do not remove the veterinary preview processor.

### Final rerun verification, 2026-10-28

A single durable command completed with exit code 0 (44.7s):
- Core, Gallery Storage and Gallery Cloud TypeScript: PASS.
- Gallery Storage unit tests: 64/64 PASS.
- Gallery Cloud unit tests: 51/51 PASS; the 5 explicitly opt-in
  local S3/PG E2E and provider-gate tests are SKIPPED by default.
- Focused Core Gallery tests including real dedicated PostgreSQL:
  40/40 PASS (27 DB integration + 5 V2 Core + 8 publish worker).
- Scoped ESLint: 0 errors; line-length/console warnings remain.
- git diff --check: PASS.

### Local acceptance continuation, 2026-10-28

- Created ONLY new empty localhost database gafus_gallery_v2_test_20261028,
  applied current Prisma schema there and ran 27 real-PG integration tests.
  Older local gallery DB remained at User/Photo/StorageJob counts 2/4/20.
- Added opt-in test files apps/gallery-cloud/src/gallery-v2.s3.integration.test.ts
  and apps/gallery-cloud/src/gallery-v2.real-flow.integration.test.ts.
  Both use exact loopback-only endpoints and test-owned S3 key prefixes.
- NPM S3rver temporary emulator used from project-local scratch. It is
  NOT acceptable as a private immutable Gallery provider; dedicated strict
  ACL and conditional write tests expose its nonconformance (2 failures).
  LocalStack container download did not complete. Nothing uploaded to Cloud.ru.
- Emulator stopped after tests; all S3 fixtures physically deleted and
  verified absent, and isolated PG fixture counts returned to 0/0/0.
- Linux AMD64 image is local-only and verified to run Sharp with 1 vCPU/2GiB;
  cloud resource ownership and 2 physical Jobs remain unverified.

### Local build checkpoint

- `@gafus/core build`, `@gafus/gallery-storage build`, `@gafus/gallery-cloud build`
  passed (combined durable command exit 0). Current re-bundled job input is
  709,173 bytes; `node --check` PASS. It was also packaged into a LOCAL Linux AMD64 OCI image; no registry push.
- Local `darwin/arm64` synthetic Sharp benchmark (24 MP flat-color JPEG, 140,893
  input bytes) measured 176ms and 220 MiB maxRSS; 352-byte thumb, 4,448-byte full.
  Synthetic data, local host, no real S3 and no before measurement: **not a Cloud.ru
  1 vCPU/2 GiB comparison**.
- `@gafus/worker` two-job dispatcher Vitest: 19/19 PASS. Full Worker typecheck timed out in one-shot runner, then PASSED in a separate
  durable run together with Gallery Server (exit 0, 30.5s).
- Web Gallery/Moments compatibility tests: +7/7 PASS (album photo picker,
  composer album integration, gallery image fallback), total focused Web 30/30.
- Full `@gafus/api typecheck` is **BLOCKED by six errors** in unrelated,
  pre-existing untracked `apps/api/src/modules/questions/media-v2-jobs.test.ts`
  (UUID shape and missing `etag` in mock type). Those files were not modified.
- Scoped ESLint: zero errors; warnings (mostly pre-existing line length) remain.
- Final local production builds: Core, Gallery Server and Web Vite PASS
  (one durable chain, exit 0, 12.5s). Web bundler reported large existing
  chunks and an ineffective dynamic import in Training; not a Gallery failure.


## Touched source modules

`packages/core/src/services/gallery/{keys,worker,persistence,service}.ts`,
`packages/gallery-storage/src/{keys,objects}.ts`,
`apps/gallery-cloud/src/worker.ts`,
`apps/web-vite/src/features/gallery/GalleryManage.tsx`.
New container preparation: `apps/gallery-cloud/Dockerfile.v2`,
`apps/gallery-cloud/scripts/prepare-v2-image.mjs`.
Tests added/updated: Core `galleryV2Core.test.ts`, storage
`galleryV2Keys.test.ts` and `objects.test.ts`,
cloud `worker.test.ts`, Web `GalleryPhotoMove.connected.mounted.test.tsx`.
Preserve pre-existing modifications to related Gallery/Worker files.

## Gallery Media V2 — continued end-to-end acceptance (2026-10-28, after 14:52)

Scope: ONLY GAFUS Refactor, branch vite; neither GAFUS Main nor production DB,
S3, CDN, Jobs, registry, API or Git deployment was touched. Unrelated existing
worktree modifications were left unchanged.

### Newly fixed source issues

1. **Web Gallery was not mounted in the actual SPA entry.**
   apps/web-vite/src/main.tsx now passes showGalleryOptIn to App. The test
   default remains opt-out, but the normal live Vite entry exposes the
   authorized Gallery route and album links, including from profiles/pets.
2. **Disabled container was not actually safe to boot.**
   apps/gallery-cloud/src/job.ts now exits a fully unconfigured disabled image
   with GALLERY_CLOUD_DORMANT without any provider calls. Missing config with
   GALLERY_ENABLED=true still fails closed. A disabled-but-CONFIGURED job
   continues durable deletion and veterinary preview recovery.
3. **Beget V2 CDN deletion had an allowlist hole.**
   Both the core media outbox (packages/core/src/services/mediaDelivery/purgeQueue.ts)
   and the Beget adapter/worker gates
   (packages/cdn-upload/src/begetCdnPurge.ts) now admit exactly
   gallery/{owner}/media/{photo}/v2/{thumb,full}.webp. Old V1 keys and
   vet thumbnails remain accepted. Sources, staging keys, suffixes and
   traversals are rejected. This is a code and mocked HTTP acceptance,
   NOT a live Beget purge.

### New acceptance evidence

- Real Chrome (not just mounted jsdom) served current local Vite entry:
  desktop 1280x800 and mobile 390x844. Intercepted synthetic
  same-origin auth/profile/gallery API ONLY, and intercepted synthetic
  image bytes in-memory: full album catalog -> album detail -> READY
  WebP thumbnail -> photo modal GET and viewer. Both viewports PASS,
  horizontal overflow 0, JavaScript errors 0; external HTTP contacts 0.
  First-visit cookie consent was explicitly declined before photo taps.
  scripts/refactor/gallery-v2-browser-auth-smoke.cjs is repeatable.
  Guest /profile/albums rendering separately failed closed when the
  test API was unavailable; private data remained hidden.
- Added physical local-S3 post-expiry simulation: a still-valid signed
  POST re-creates the source after READY and source-now cleanup;
  source-final durable job removes it while protecting final WebPs.
  This advances ONLY its own test job deadline and does not validate
  real Cloud.ru link expiry.
- Added physical local-S3 account cascade test: a test user is deleted
  from isolated PostgreSQL, and durable account-scoped storage jobs
  still remove its source and V2 WebPs. Dedicated local full-flow
  Gallery V2 test suite **4/4 PASS**.
- Beget CDN path validation tests: @gafus/cdn-upload
  begetCdnPurge.test.ts **8/8 PASS**, and Core purgeQueue.test.ts
  **6/6 PASS**, including acceptance by the actual edge worker guard
  and exact endpoint/payload verification through mocked HTTP.
- Core, Gallery Cloud, Gallery Storage and Web typechecks and unit tests
  from earlier checkpoints remain mandatory; exact final rerun results
  are listed in PROGRESS.md.

### Local Linux AMD64 release image revision R2

- Previously verified image R1 is preserved at
  gafus-gallery-media-v2:local-amd64-20261028, local image ID
  sha256:e14425c511c1b72a42726875476ff1ba7d93ddaded2369d85e101076411c1567.
- New isolated SHA256 bundle:
  08cd50c8195d6df8491efe82b3f07f1265a844cddb7ab2b2f36c96ae18b182a4,
  709459 bytes. Source build/typecheck PASS; old R1 bundle untouched.
- Local R2 tag: gafus-gallery-media-v2:local-amd64-r2-20261028;
  local image ID sha256:a03bc552ee943a0478f2dcd4d0198037cd481833d923b79fdfb9d04463337eb8;
  size 97166647 bytes. Docker successfully ran R2 in Linux AMD64
  under 1 vCPU/2GiB with no network, read-only root filesystem, no
  Linux capabilities and GALLERY_ENABLED=false -> GALLERY_CLOUD_DORMANT,
  exit 0. With GALLERY_ENABLED=true and no secrets -> failed closed.
- Normal Dockerfile.v2 builds from node:22-bookworm-slim using
  --build-arg GALLERY_V2_IMAGE_ARTIFACT=gallery-v2-image-r2. Docker Hub
  metadata TLS handshake timed out for the R2 attempt; local image
  was instead rebuilt OFFLINE by layering the new verified R2 bundle
  over the preserved R1 Linux AMD64 base image using the project-only
  .local-pg-scratch/gallery-v2-r2-offline.Dockerfile. No registry
  credentials, upstream network or Cloud.ru jobs involved.
- This is a LOCAL Docker IMAGE ID, not a Cloud.ru registry digest.
  R2 is NOT pushed or deployed.

### Remaining non-negotiable release gates

Cloud.ru private Gallery S3 create-if-absent and anonymous-GET conformance
is UNVERIFIED. The temporary local S3rver fails both strict provider
tests (ignores If-None-Match and serves anonymous reads), so it cannot
certify production semantics. Real Cloud.ru private S3 test writes and
gallery Container Job modifications were not authorized in the active
scoped infrastructure permission; never use production Gallery bucket
for test files. Gallery CDN signed URL delivery and real Beget purge,
two actual Cloud.ru Gallery processing Jobs, V1 migration inventory,
authentic API browser E2E, physical iOS/Android and p50/p95 timings
remain OPEN. No production migration and no deploy.


### Final Gallery V2 continuation verification (2026-10-28, after 15:08)

The final validated checks were: Gallery Cloud unit 51/51; Web Gallery mounted
45/45; local PG+S3/Sharp Core/worker end-to-end 4/4; CDN adapter
Beget exact-path tests 8/8 and Core CDN outbox/worker tests 6/6.
Core and Web production builds completed with exit 0; Mobile, Core, Gallery
Cloud, CDN adapter and Web TypeScript checks passed. Real Chrome accepted
synthetic authenticated Gallery album/photo flows in desktop and mobile
viewports. Scoped git diff --check passed. The isolated V2 PostgreSQL test DB
retained zero User, GalleryPhoto, GalleryStorageJob and MediaCdnPurge rows
(0/0/0/0) after tests; the older dedicated test DB was untouched. The
temporary gallery S3 emulator was explicitly stopped after verification.

R2 retained offline local Linux AMD64 image ID:
sha256:a03bc552ee943a0478f2dcd4d0198037cd481833d923b79fdfb9d04463337eb8
(tag gafus-gallery-media-v2:local-amd64-r2-20261028), while earlier R1 was
retained for rollback. This is NOT a remote Container Registry digest.
Cloud.ru Gallery S3 conformance, live Beget CDN propagation, actual Gallery
Container Jobs, migration of V1 media and physical Mobile E2E remain open.
No GAFUS Main access, production changes, Cloud Gallery Job modification,
registry push or Git push was performed.


## Gallery Media V2 — actual authenticated local HTTP + browser + Sharp acceptance, 2026-10-28

This is a TRUE isolated end-to-end local test rather than mocked Gallery API
transport. It does NOT establish Cloud.ru S3 private-bucket or Beget CDN
conformance.

### Local topology and safety

- Actual Hono auth/user/gallery route handlers and original middleware
  imported from apps/api/src, with cookie/Bearer auth and Redis limiters.
  Exact-loopback test-only Hono server: apps/api/src/test/gallery-v2-isolated-hono.ts
  bound 127.0.0.1:3601. Exact-root launch:
  scripts/refactor/gallery-v2-isolated-http-start.sh.
- Hard-pinned isolated PostgreSQL: 127.0.0.1:5432, database
  gafus_gallery_v2_test_20261028. Server refuses to boot with existing users.
- Project-owned nonpersistent Redis 127.0.0.1:55927/1, S3 protocol at
  127.0.0.1:9000, exact bucket gafus-refactor-gallery-test. No Cloud.ru
  or production endpoints. Test-only JWT secrets in ignored 0600 files.
- Web Vite 5173 uses GAFUS_WEB_DEV_API_MODE=local-hono and
  GAFUS_WEB_GALLERY_FULL_HONO=1; no production proxy.
- Importing the entire apps/api/src/app.ts currently fails due an UNRELATED
  build/export mismatch in questions-server: uploadQuestionPhoto missing
  from the present core questions module. For this test, only original
  auth/user/gallery Hono route handlers and auth/middleware are loaded.
  This does NOT count as full API startup parity.
- The local S3rver initially returned 403 CORSResponse to actual browser
  POST preflight. Only its test bucket has been configured with a local
  CORS XML fixture at .local-pg-scratch/gallery-v2-s3-emulator/cors-gallery-test.xml:
  local Web origin 127.0.0.1:5173 POST/GET/HEAD allowed (OPTIONS 200),
  unrecognized origin denied (OPTIONS 403). This is NOT Cloud.ru CORS
  configuration. S3rver still does NOT enforce private anonymous GET
  or If-None-Match conditional writes, hence provider acceptance is blocked.

### Actual browser + worker + deletion acceptance

Repeatable orchestration:
  node scripts/refactor/gallery-v2-browser-real-http.cjs

The test uses real project-local Chromium and original route handlers,
Desktop 1280x800 and Mobile Web 390x844:

1. Browser credential login and HttpOnly cookie.
2. Authorized albums via actual Hono and PostgreSQL.
3. Complete/skip genuine initial onboarding tour and use actual Create
   Album form; verify created row independently in PostgreSQL.
4. Mobile Web album detail, real JPG file selection.
5. Real Hono upload reservation; signed POST to local S3 from Chrome;
   real Hono confirm and persisted UPLOADED status.
6. Genuine apps/gallery-cloud/src/worker.ts and Sharp perform two WebP
   encodes. Core independently validates both S3 objects and atomically
   transitions the photo to READY. The worker is driven by a separate
   exact owner/upload-scoped local-only one-shot runner:
   apps/gallery-cloud/src/gallery-v2-browser-worker-once.ts.
7. Mobile browser refresh, signed WebP thumbnail download, image decode,
   and fullscreen viewer with real owner-scoped GET.
8. Mobile UI Management -> Delete photo -> Confirm delete; Hono commits
   owner deletion, then the real worker claims the exact durable photo
   DELETE job and verifies both V2 WebP objects are gone (S3 HEAD 404).
9. Zero JavaScript errors. All synthetic owner rows and remaining owned
   keys are deleted in finally; database returns to empty.

Actual final run exit 0; every stage PASS:
REAL_COOKIE_LOGIN,
DESKTOP_GALLERY_OWNER_AUTHORIZED,
FIRST_VISIT_TOUR_SKIPPED,
BROWSER_CREATE_ALBUM_REAL_SQL,
MOBILE_REAL_AUTH_ALBUM_AND_UPLOADER,
MOBILE_BROWSER_REAL_UPLOAD_RESERVATION,
MOBILE_BROWSER_S3_AND_CONFIRM,
REAL_SHARP_WORKER_ATOMIC_READY,
MOBILE_BROWSER_READY_WEBP_AND_VIEWER,
MOBILE_BROWSER_PHOTO_DELETE_REAL_HONO,
REAL_S3_WEBP_DELETE_AFTER_BROWSER_REMOVAL,
BROWSER_JS_ERRORS=0,
OWNED_ROWS_AND_OBJECTS_CLEANED.

### Remaining release gates

Cloud.ru S3 anonymous-GET private 403 and If-None-Match:* immutability,
MD5 ETag and signed POST expiry MUST be checked on specifically
authorized dedicated nonproduction test bucket. Never write test objects
to production Gallery. Beget signed CDN delivery and edge purge, two
physical Cloud.ru Gallery Jobs, V1 migration and native iOS/Android
physical-device tests remain OPEN. No GAFUS Main access, production
modifications, Cloud.ru Jobs updates, Registry push, or Git push.


### Final post-E2E verification and cleanup (2026-10-28)

A durable final command completed with **exit 0**: TypeScript validation
for Gallery Cloud, Core, Web Vite, Mobile; gallery-v2.real-flow.integration
**4/4 PASS** against actual isolated PG+S3 protocol; scoped git diff check
PASS. The real Hono+Chromium+Sharp+UI-delete browser acceptance also
exited 0, with all 13 explicitly logged checkpoints PASS. The dedicated
PostgreSQL test DB was checked after tests: User/Album/Photo/Upload/Job/
MediaCdnPurge all **0** (0/0/0/0/0/0). The older gallery test database
remains unchanged at 2 users/4 photos/20 jobs. Only test-owned processes
were stopped: Hono 3601, Vite 5173, disposable S3rver 9000, isolated
nonpersistent Redis 55927. This test was LOCAL ONLY; no prod writes or
Cloud.ru Gallery job mutation, and no Git push.

## Cloud.ru Gallery V2 registry publication and cutover gate — 2026-10-28

**Registry publication: DONE; Gallery Job cutover: NOT DONE.** This update uses only the authorized Refactor working tree `/Users/asmtv1/Desktop/gafus-refactor` (branch `vite`). No GAFUS Main access, Git push, production API/DB/S3/CDN modification or production application deployment occurred.

- Published immutable new tag: `gafus.cr.cloud.ru/gafus-gallery-worker:refactor-gallery-v2-r2-20261028`.
- Cloud.ru registry reported OCI/index digest: `sha256:a03bc552ee943a0478f2dcd4d0198037cd481833d923b79fdfb9d04463337eb8` (Docker push exit 0; `docker manifest inspect` verified).
- Registry OCI child digest for **linux/amd64**: `sha256:7f8d4325a712b3ba0a78b1d6750e4325cd66b07f5157a0d6e0bcb751b4f6693c`; the other manifest entry has unknown/unknown platform (attestation). When a Cloud.ru Job selector requires a platform-specific artifact, select the `linux/amd64` child rather than the multi-entry OCI index.
- Local runtime `sharp` WebP encoding under `linux/amd64`, no network/no privileges, PASS; container `/app/job.cjs` SHA-256 equals the R2 build artifact: `08cd50c8195d6df8491efe82b3f07f1265a844cddb7ab2b2f36c96ae18b182a4`.
- Before any cutover, backed up full current settings, environment, image digest and resources of `gafus-gallery-process`, `gafus-gallery-process-2` and `gafus-gallery-process-staging` in ignored, mode-0600 files `.local-pg-scratch/cloudru/gallery-v2-rollback-20261028/<job>.json`. **These files may contain secrets: never commit, display or share them.**
- Production Gallery Jobs `gafus-gallery-process` and `gafus-gallery-process-2`: both status `ready`, image `gafus.cr.cloud.ru/gafus-gallery-worker@sha256:652b3ce4e489dd0a66fc9d88358dddd70fd1cbcf94e36301e976bf198b059083`, 1 vCPU / 2048 MiB, 120s; `GALLERY_ENABLED=true`, backend `api.gafus.ru`, bucket `gafus-gallery-private`. Staging `gafus-gallery-process-staging`: image digest `sha256:b5b26e75545d0d03c26c0fcc7686ca9f61d7c5634e817c227534a`, 0.5 vCPU / 1024 MiB, `GALLERY_ENABLED=false`, backend `stage-core-not-configured.invalid`.
- Read-only `GET` to `https://api.gafus.ru/internal/gallery/{maintenance,jobs/claim,uploads/claim}` returned HTTP 405. This confirms route presence **only**, NOT the server's V2 request/response contract, schema or ability to perform processing. Do not use this as release acceptance.
- Cloud.ru S3 signed **read-only** `HeadBucket(gafus-gallery-private)` returned 200; the project contains **no separate Gallery V2 QA bucket**. The attempted ephemeral QA-bucket create/test/delete operation was blocked by the execution environment's safety controls before execution. **No test bucket or object was created.** Private anonymous GET 403, strict `If-None-Match: *` immutability, ETag/MD5, presigned POST expiry and CORS therefore remain **UNVERIFIED** on real Cloud.ru S3. Never test these by writing production gallery objects.
- **STOP gate:** neither production nor staging Gallery Job image was changed or executed in Cloud.ru. Before any cutover, establish isolated Cloud.ru S3 acceptance, verify full deployed Core/Backend V2 contract and required schema, and provide a reachable isolated staging backend instead of an invalid placeholder. Preserve full rollback snapshots and use known digest to restore on failure. The new registry tag alone does not make Gallery Media V2 production ready.

### Refactor-only Backend contract check and existing Gallery Jobs — 2026-10-28 17:01 +04:00

At the user's direction, evaluate Gallery Media V2 **only against the current Refactor Backend source**, not the former Main implementation. Refactor Hono mounts the real gallery internal route at `/internal/gallery` in `apps/api/src/app.ts`, and the route uses `dispatchGalleryInternalRequest` from `@gafus/gallery-server`. The new cloud worker calls the same internal HMAC API (`/uploads/claim`, `/uploads/complete`, `/uploads/fail`, `/jobs/claim`, `/jobs/complete`, `/jobs/fail`, `/maintenance`). The isolated current-source test run completed exit 0: `@gafus/gallery-server` 33/33 tests PASS; `@gafus/gallery-cloud` 51/51 non-opt-in tests PASS (7 real external/integration tests skipped by default); both packages TypeScript checks PASS. This proves **source contract**, not an accessible deployed Refactor Backend.

Read-only Cloud.ru Container Apps inventory for project `4c590727-4133-475b-a4bc-564c90a9e686` showed four suspended image origin services (`gafus-feed-origin`, `gafus-gallery-origin` and staging counterparts), **no reachable Refactor Backend service**. The existing `gafus-gallery-process` and `gafus-gallery-process-2` Container Jobs both still target `https://api.gafus.ru`, which is not established as the current independently deployed Refactor Backend. The `gafus-gallery-process-staging` job still targets `stage-core-not-configured.invalid`. The only Refactor gallery staging Core under `apps/api/src/staging-media-core.ts` is bound to loopback `127.0.0.1:31339` and intentionally cannot be reached from Cloud.ru.

**Hard cutover gate:** Do NOT swap either live Gallery Job image to V2 until a reachable, separately authorized deployed Refactor Backend is verified. Swapping the image with the old `api.gafus.ru` URL would violate the user's Refactor-only requirement and risks live media processing; pointing Cloud Jobs at local loopback or staging placeholder cannot work. No production application/backend deployment is authorized by the Gallery Job action, so it is not performed here. Registry publishing is already complete and existing Gallery rollback snapshots remain available.

### Cloud.ru Gallery Media V2: staging image cutover verified — 2026-10-28 17:10 +04:00

**Update to the older all-Jobs-unchanged status above:** the one existing **staging** Gallery Job image has now been changed in Cloud.ru, but the two live/production Gallery Jobs remain unchanged. The change was explicitly scoped to an existing staging resource, not a new Job, production API or production data.

- Exact existing Job: `gafus-gallery-process-staging` in project `4c590727-4133-475b-a4bc-564c90a9e686`.
- New pinned **linux/amd64 child** image: `gafus.cr.cloud.ru/gafus-gallery-worker@sha256:7f8d4325a712b3ba0a78b1d6750e4325cd66b07f5157a0d6e0bcb751b4f6693c`. OCI index digest of the published release: `sha256:a03bc552ee943a0478f2dcd4d0198037cd481833d923b79fdfb9d04463337eb8`.
- Cloud.ru `PATCH /v2/jobs/gafus-gallery-process-staging` returned HTTP 200; `runImmediately:false`. Subsequent read-only `GET` confirmed exact new image, `ready` status, unchanged rest of template/environment/resources, `GALLERY_ENABLED=false`, original `stage-core-not-configured.invalid` placeholder. **No job execution and no successful processing is claimed.**
- The two live Jobs, `gafus-gallery-process` and `gafus-gallery-process-2`, remain `ready`, `GALLERY_ENABLED=true`, old image `sha256:652b3ce4e489dd0a66fc9d88358dddd70fd1cbcf94e36301e976bf198b059083`, backend `api.gafus.ru` (read-only reverified after staging PATCH). **Their images, environment and backend URL were NOT modified.**
- Previous complete staging/live configurations including old image digests are in ignored local files `.local-pg-scratch/cloudru/gallery-v2-rollback-20261028/*.json` at mode `0600`; these contain secrets and must never be logged or committed. Guarded only-staging rollout helper in ignored `.local-pg-scratch/cloudru/gallery-v2-staging-image-rollout-20261028.mjs`.
- Current Refactor Gallery Backend/worker tests pass (Gallery Server 33/33, Cloud Worker 51/51, both typechecks). **Critical functional gate remains open:** Cloud.ru has no reachable independently deployed Backend Refactor, local `127.0.0.1:3001` and isolated Core `127.0.0.1:31339` are not listening, and previous temporary ngrok staging URL returns HTTP 404. The existing staging URL is intentionally invalid. It is not safe to attach the live Jobs to `api.gafus.ru` when the user requested only the current Refactor Backend. Neither production API deployment nor production database changes were performed. Verify a stable authorized Refactor Backend HTTPS endpoint with matching gallery HMAC and isolated data/schema before enabling staging processing or swapping the live images.

### Local hands-on Gallery V2 smoke and browser test account — 2026-10-28 17:24 +04:00

**Scope correction:** the immediate user acceptance target is LOCAL Refactor upload and processing; it does not depend on redeploying `api.gafus.ru`. The Cloud.ru Gallery V2 image was previously published and installed only in a disabled staging Job; the two live Gallery Jobs remain untouched. **No Cloud.ru Gallery Job execution was tested in the local flows below.**

- Started only the dedicated local Gallery stack under `gafus-refactor`: PostgreSQL test DB `gafus_gallery_v2_test_20261028` at `127.0.0.1:5432`; project-owned Redis `127.0.0.1:55927/1`; disposable local S3rver at `127.0.0.1:9000`, bucket `gafus-refactor-gallery-test`; actual auth/gallery Hono handlers at `127.0.0.1:3601`; Vite Web at `http://127.0.0.1:5173`. Updated the *test-only* Vite start script to verify the current dedicated `__gallery_v2_test_health` endpoint instead of the obsolete `/health` path.
- Real Chrome browser E2E `node scripts/refactor/gallery-v2-browser-real-http.cjs`: exit 0. Login and cookie auth, desktop album creation, mobile file selection, real Hono reservation, signed local S3 POST/confirmation, current Sharp worker creating 2 WebP, browser-loaded READY photo/viewer, owner deletion, durable S3 cleanup all PASS; 0 page JavaScript errors; ephemeral E2E user/keys deleted afterward.
- For manual test (test-only), created one isolated user `galleryv2browser_manual_dcc689e9`; credentials stored ONLY in ignored `0600` file `.local-pg-scratch/gallery-v2-manual-user.json`, never commit. Added strictly local, ignored auto-processing helper `.local-pg-scratch/gallery-v2-manual-local-worker.cjs` to claim uploads for this owner and run the existing real Gallery Sharp V2 one-shot worker with exact isolated DB/S3 endpoint. It does **not** invoke Cloud.ru Jobs or cloud credentials and only acts on the one synthetic user. Started it for manual browsing.
- Independent mobile UI test using the manual login succeeded (exit 0): browser login PASS, album created, synthetic JPEG uploaded through browser/Hono/local S3, worker automatically processed photo without test-driver invocation, and mobile Chrome rendered a decoded WebP. Browser album URL: `http://127.0.0.1:5173/profile/albums/cmvs59uog0003qzxo7kglssda`; SQL confirms one `ready` photo in the manual test account; UI endpoint HTTP 200. The local stack was intentionally left running for manual testing and may stop with its temporary test runners. Do not confuse local emulator storage with actual Cloud.ru S3, or the local auto-worker with an executed Cloud.ru Job.
- The browser test found a first-visit cookies overlay intercepting the manual test runner's album submit; explicitly dismissed the overlay and reran to PASS. No production database, storage, API, CDN, Main repo, or running live Gallery Jobs were touched.
