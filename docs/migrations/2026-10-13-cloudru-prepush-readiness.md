# GAFUS: Cloud.ru S3 + Yandex CDN — pre-push acceptance (2026-10-13)

**Scope: preparation and verification in isolation only. No working production GAFUS modification.**
**Do not push `main`, switch production CDN/origins, deploy production Web/API/Jobs, run production database migrations or enable fallback until separate approval.**

## Verified with AI Commander

- Private Cloud.ru S3 `gafus-gallery-private`, `gafus-feed-private`, `gafus-documents-private`: authenticated list/CORS/ACL/versioning read, all verified private with Public Access Block; synthetic immutable PUT, GET, presigned GET, anonymous deny, DELETE + HEAD 404 PASS 3/3. Previous `TenantSuspended` no longer observed.
- Presigned POST on Gallery and Feed; server PUT on Documents; authenticated signed GET byte equality and correct `Access-Control-Allow-Origin` on actual requests for both `https://gafus.ru` and `https://www.gafus.ru` PASS. Test objects all removed. **OPTIONS preflight remains blocked (403)** on Cloud.ru. Actual headless Chrome from `https://gafus.ru` PASS for signed browser-simple POST on Gallery/Feed and signed GET on all three buckets, HTTP 200 and correct bytes, test files removed. Custom-header cross-origin uploads requiring preflight remain unverified.
- Cloud.ru synthetic-only staging HTTPS Origins: gallery WebP, Feed WebP and MPEG-TS GET 200 (byte match), HEAD 200, Range 206, invalid Range 416, absent/incorrect origin header 403, non-staging path 404; all tests PASS. Staging min instance temporarily 1 then returned to **0**.
- Dedicated Feed Yandex CDN `feed.gafus.ru` was accepted earlier on temporary isolated Feed stage origin: after propagation (first 50 signed requests 504), WebP **100/100** and HLS .ts **100/100** HTTP 200 with byte matches; HEAD 200, Range 206, same-signed-URL true edge cache HIT after backing S3 object deletion (10/10 each), expired token 410, forged signature 403. Existing Feed key and CDN origin secret maintained. Guarded rollback completed to original Yandex Feed API Gateway origin group `8971053823582171020`; no current Cloud.ru production delivery claimed. See `2026-10-12-feed-fallback-rollout-status.md`.
- Current Feed CDN read-only gate PASS: authoritative REG.RU and public DNS CNAME, cert `fpqkuvbeq4u9trv49apr` READY and real TLS, expired 410 and forged 403. Yandex Gallery and Feed **legacy API Gateways currently fail direct HTTPS**, confirmed separately. Do not confuse API Gateway 504 with Cloud.ru S3 failure.
- Existing production-code OCI images (NOT staging-only simulations), tags `gafus-*-origin:stg-cdn-stable-20261012-05c5b67f`, were each started only on Mac **127.0.0.1** with ephemeral Docker containers and private Cloud.ru S3 UUID fixtures. Gallery WebP, Feed WebP, Feed .ts GET byte equality, HEAD, Range 206, 416, origin header deny 403 and cacheability of authenticated success PASS; temporary objects removed, Docker containers stopped. Reproducible guarded test: `infra/cloudru/local-oci-origin-acceptance.mjs`; local only, never connect a CDN to it.
- Live failure classifier probe against test Yandex Gallery CDN: 504 => fallback true, forged 403 and expired 410 => fallback false. Unit/integration cloud contract scripts PASS, `git diff --check` PASS.
- Earlier isolated staging Core+DB/Redis, workers, playlist and segment signing tests in `2026-10-12-cloudru-staging-execution.md`; **not a permanent staging deployment or real Web/Mobile device E2E**.

## Current operational state

- Production `gafus-api` and `gafus-web` Docker containers untouched. Live API media config still uses Yandex S3 and preexisting Feed base URL; Cloud.ru fallback **disabled**.
- `feed.gafus.ru` resource still points to old Yandex Origin (currently unreliable), not a Cloud.ru production Origin. Current synthetic-only staging Container Apps are idle at `minInstances=0` after test.
- Neither full production Cloud.ru Gallery/Feed Origin container nor production media Jobs activated. Published production-code OCI tags are **staging tags**, not a go-live.
- Temporary Feed CDN TS synthetic path purge previously unconfirmed; backing S3 object deleted and short URL expires. Do not claim purge acceptance from that run.
- Courses and avatars remain on Yandex. No legacy user media migration required per owner's explicit statement; not independently backed by full old S3 inventory.

## Release gates before any push or production cutover

1. Finish full monorepo TypeScript/lint/test check on combined **dirty** worktree and inspect failures; separately verify Web build and Android Expo export if affected.
2. Isolate only Cloud.ru related source and DB changes. **There are 400+ other dirty paths and parallel jobs:** never bulk `git add .`, never merge/push the whole current worktree. Audit lockfile, Prisma schema/migrations and cross-package API contracts before generating a focused changeset.
3. `.github/workflows/ci-cd.yml` triggers **automatic production deployment on push to `main`** (`deploy-production`, SSH), unlike `cloudru-media-images.yml` (manual workflow). Any push or merge to main may deploy other work. **Stop and ask owner before push**; ideally first submit an isolated reviewed PR/branch after CI gate.
4. Create an **isolated persistent staging Web/API/Core/DB** and authenticated GAFUS Web/Mobile end-to-end for user media, cancellation/deletion and fallback (S3 only when CDN 5xx/timeout, never 403/404). Real Chrome simple signed CORS PASS, but full GAFUS app UI and installed Mobile device remain untested.
5. Before actual production CDN cutover: deploy separate protected production-code Origins with min=1 warmed Cloud.ru instance each (billable), origin header secrets matched to each CDN resource, configured Cloud.ru S3 keys/buckets, worker jobs and API version/flags. Repeat signed-URL hot-cache expiry acceptance for exact resource/Origin, 100% cold/miss delivery **after edge propagation**, origin/purge safety and full rollback. Keep old infra until successful steady state.
6. Confirm user authorization before production deploy, feature flag activation, any database migration, DNS/CDN source switch or main push.

**This document records staging acceptance, not approval to release.**

## Final checks on 2026-10-13

- Real Chrome, origin `https://gafus.ru`, Gallery/Feed signed multipart POST 200 and GET 200, Documents signed GET 200; disposable S3 objects deleted (`infra/cloudru/real-browser-cors-smoke.mjs`, job `79198229768da20c`, PASS). www origin separately checked via signed Node requests, not real Chrome.
- Published **production-code** Origin OCI images on Mac localhost only: Gallery WebP, Feed WebP and MPEG-TS, GET/HEAD/Range/denied/errors/cache PASS; ephemeral Docker containers and private S3 UUID objects removed (`infra/cloudru/local-oci-origin-acceptance.mjs`, job `6359c21fb93faf6b`, PASS).
- Combined dirty-tree verification job `6a037175451593cc` exit 0: typecheck **57/57 (0 cached)**, lint **6/6 (0 cached)**, tests **50/50 (28 cached)**.
- **No commit, no push, no production deployment.** CI/CD `main` push would trigger production deploy. Ask owner before push.
## 2026-10-13 00:35+04 — pre-main JWT Web/Mobile staging and immutable OCI rollout plan

**No production changes, no git commit/push, no external production deployment.** All operations via AI Commander on aic-mac and isolated local database at 127.0.0.1:55448; isolated Redis at 127.0.0.1:56389; isolated API at 127.0.0.1:31341, shut down after testing.

### Fully observed transport and policy E2E

- Staging-only **real** Hono `feedRoutes`, production `authMiddleware` (JWT verification, account registration and revocation check), `feedPlaybackResponse`, and `@gafus/feed-server` dispatcher running loopback-only. No production auth, DB or API secrets imported. Staging-specific JWT secret stored outside repo in user-local protected directory.
- Two completely synthetic staging users with real JWT access tokens, photo/poster/playlist/segment keys and media rows in an isolated PostgreSQL database; five new S3 objects written only under owner-specific synthetic staging IDs to private Cloud.ru Feed S3. No real user IDs/data/files used.
- **Native-mobile-compatible bearer transport against staging API:** unauthenticated and invalid JWT => 401; unauthorized variant => 400; valid media fallback => 200 with authorized presigned Cloud.ru GET and exact byte match; HLS playback ticket => 200; CDN manifest => 200; Cloud.ru direct signed manifest => 200; all signed .ts segments fetched and verified; forged ticket => 404.
- **Real Chrome browser from isolated staging API origin:** unauthenticated fallback request => 401, JWT-authenticated fallback => 200, resulting Cloud.ru private S3 WebP renders successfully as a browser image. This exercises real authorization + S3 image loading in Chrome, **but is NOT a full NextAuth Web page/app flow.**
- Revocation: once the synthetic photo post was soft-deleted, new signed URL refused (404). Public published-media entitlement separately verified for another valid staging actor (200), and already-issued video playback ticket denied on manifest refresh after post deletion (404).
- E2E terminal marker `ISOLATED_AUTH_WEB_MOBILE_HTTP_ACCEPTANCE=PASS`, AI Commander job `72835ce385359d5c` exit 0; **all two synthetic users and five S3 files deleted and verified**. Test harness `infra/cloudru/isolated-auth-web-mobile-e2e.mts`; stage API and start helper `apps/api/src/staging-client-api.ts` and `infra/cloudru/start-isolated-client-api.mjs`.
- `pnpm --filter @gafus/api typecheck` PASS, `pnpm test:cloudru-media` PASS, format PASS, `git diff --check` PASS (AI Commander `bc127ac6ea5f7f3f`).
- Android Expo export, Hermes bundle PASS (job `e4eae985e0b948a6`, exit 0), output `/tmp/gafus-cloudru-prepush-android-export`. **Not a native installed-device acceptance.** No Android device or booted iOS simulator available on Mac at this time.

### Production Origin + worker pre-release images

- Four existing private registry images verified remotely as published Linux AMD64 OCI manifests, SHA-256 digests obtained for Gallery Origin, Feed Origin, Gallery Worker and Feed Worker.
- The existing `cloudruMediaManifests` pure builder now has a **read-only immutable-digest preview** helper `infra/cloudru/prepare-preproduction-origin-jobs.mjs`. Explicit gated command `GAFUS_MANIFEST_PREVIEW_CONFIRM=offline-no-release node infra/cloudru/prepare-preproduction-origin-jobs.mjs` PASS. Result at `/tmp/gafus-cloudru-media-preprod-preview.json` (Mac-local).
- Preview includes exactly **two protected always-warm Origin services** (min=max 1) and **three opt-in worker jobs** (not auto-executed); no literal secrets (only placeholders); Docker images pinned by actual registry `@sha256` digests. No Container Apps production services or jobs created.
- Important: published image digests are earlier reviewed **staging candidates**, not automatically guaranteed equivalent to the latest dirty local source; rebuild/publish revision-pinned images after isolating and approving Cloud.ru source changes, compare digests, test again before live cutover.
- No production Cloud.ru Origin running, no actual production CDN switch, no prod API/Web or server config changes. `main` push triggers automatic production deployment via `.github/workflows/ci-cd.yml`; do not push without owner's separate authorization.

### Remaining acceptance separate from push

1. Full production Web **NextAuth** login/page media playback in an isolated deployed Next staging site (not reproduced by the limited Chrome bearer harness).
2. Actual mounted Mobile native Expo screen/device playback and native WebP/HLS error-triggered fallback (no Android connected, iOS simulator not booted). Expo Hermes bundling passes and mobile transport/authorization passes; do not overstate.
3. One persistent isolated Core/API + worker execution run with a real deployed staging site, after which a staged production-equivalent Origin/CDN rollout with warming/propagation and provider cache purge should precede user-facing cutover. Earlier Core + Cloud.ru staging worker photo/video full E2E passed with temporary tunnel (see existing staging report).
4. Isolate the Cloud.ru patch from 400+ unrelated local files and decide CI deployment strategy; any main push automatically deploys.


## 2026-10-13 ~01:05 +04 — REAL Web component 504/403/404 automatic failover acceptance

Scope: **only isolated Mac PostgreSQL (127.0.0.1:55448), Redis (127.0.0.1:56389), JWT staging API (127.0.0.1:31341), disposable Cloud.ru S3 owner objects and headless Chrome test**. No production Web/API/CDN origin configuration, no Git push.

### Real Web component E2E PASS
- Test scripts: `infra/cloudru/staging-web-fallback-entry.tsx` imports the **actual current source** `apps/web/src/shared/components/media/CdnImage.tsx`, `apps/web/src/features/feed/FeedVideo.tsx`, `apps/web/src/features/feed/api.ts` and `cdnProbe.ts`. `infra/cloudru/build-web-fallback-stage.mjs` bundles those modules into a local 2.4 MB Chrome fixture; it fails if any of these actual source files are absent. `infra/cloudru/real-gafus-web-ui-cdn-failover.mts` creates a synthetic authorized user + media, compiles a real ffmpeg H.264 5s HLS video with 3 TS segments, then runs the components in Chrome.
- Chrome test uses a test page *pretending to be* `https://gafus.ru`: ALL requests to `gafus.ru` and `feed.gafus.ru` are intercepted inside Puppeteer, so **no production GAFUS traffic or CDN mutations**. Live isolated Core API is the only API upstream; real presigned requests to Cloud.ru S3 are allowed. Temporary staging cookie is a test substitute for NextAuth; it is **not a full production NextAuth UI/login test**. The actual production-code components and Web feed client were executed, not reimplementations.
- **CdnImage 504**: actual `<img>` fails loading at simulated Yandex CDN 504, triggers real HEAD status probe, authenticated GAFUS fallback API returns presigned S3 URL, browser fetches and renders the **real private Cloud.ru S3 WebP**, observed naturalWidth=320 and source switched. **CdnImage 403/404**: no fallback API request, no S3 request.
- **FeedVideo HLS 504**: actual `hls.js` player encounters simulated 504 for TS segments, real `probeHlsCdnOutage` checks an actual signed segment, fetches protected fallback manifest from local JWT API, receives real signed S3 URLs and plays the complete Cloud.ru HLS data (three TS segment requests, `<video>.currentTime=0.417695`, readyState>=2). **HLS 403 and HLS 404**: no fallback manifest requested and zero S3 segment requests; error shown.
- AI Commander job `44d1b02e20bdc9e2` produced terminal `ACTUAL_GAFUS_WEB_UI_CDN_FAILOVER_E2E=PASS`; cleanup `usersRemaining=0,s3Removed=7,s3Created=7,passed=true`. Earlier same-run `CdnImage` PASS with job `cfdc42ac96d5c506`. No account/customer data used.
- **Real Web regression discovered and fixed**: Chrome reports `canPlayType('application/vnd.apple.mpegurl')==='maybe'` but native playback fails and used to abort fallback. Updated `apps/web/src/features/feed/FeedVideo.tsx` to prefer `hls.js` when supported, with native HLS as fallback on iOS/Safari when MSE is unavailable. Added `apps/web/src/features/feed/FeedVideo.test.tsx` asserting Chrome's native 'maybe' still selects `hls.js`; test PASS.

### Mobile regression without device
- Mobile's actual `apps/mobile/src/shared/components/media/CdnImage.tsx` tested via React/jsdom with mocked `expo-image` image adapter: on 504 changes image URL to S3 exactly once; 403/404 never request S3; 3/3 PASS (`CdnImage.test.tsx`).
- Actual Mobile `apps/mobile/src/features/feed/FeedVideo.tsx` tested with mocked native `expo-video` player, React Native, and real component logic: after simulated error with confirmed outage, player source changes from original API HLS playlist URL to `?source=cloudru` and instantiates new video player; after unconfirmed outage no alternate source; 2/2 PASS (`FeedVideo.test.tsx`).
- Expo SDK's installed source `apps/mobile/node_modules/expo-video/src/VideoPlayer.tsx` verifies that `useVideoPlayer` creates an updated player when serialized VideoSource URI changes, as used by GAFUS.
- These are **component tests with native adapters mocked**, NOT installed Mobile device E2E. The user requested native UI confirmation; it remains unverified. Mac disk space was ~3.2 GiB free; 11 GiB Vox iOS DerivedData already present, no connected Android device, all iOS simulators shut down. Do not boot, install or build native app without sufficient disk headroom or owner permission to free space. Android Hermes Expo JS bundle previously PASS.

### Release gate
- Code is uncommitted. Since local `main` triggers SSH production deployment on push, **stop before any commit/push**.
- Staging API/core shutdown and cleanup verification required before final handoff.


### Validation update: 2026-10-13 ~01:10 +04

- Focused browser/UI regressions **PASS**: Web `apps/web/src/app/api/v1/media-cdn-probe/route.test.ts` (4), `apps/web/src/shared/components/media/CdnImage.test.tsx` (2), new `apps/web/src/features/feed/FeedVideo.test.tsx` (1) => **7/7**. Native UI logic mocked-adapter tests: new `apps/mobile/src/shared/components/media/CdnImage.test.tsx` (3) and `apps/mobile/src/features/feed/FeedVideo.test.tsx` (2) => **5/5**.
- The full Web and Mobile `tsc --noEmit` at this moment are **NOT green due to parallel Voximplant video-consultation changes**, not due to tested Cloud.ru media modules. AI Commander job `86bef7499a6098db`: Web errors about `VoxConsultationRoom` not exported, `@gafus/core/services/consultation` not resolved, `TelemostUnavailableError` absent and unknown errors in consultation route handling; Mobile errors `consultations/mine.tsx` references removed `ConsultationBookingDto.joinUrl`. These are separate simultaneous code edits. Do not push until merged current monorepo CI is green; do not rewrite the parallel Vox migration without its owner's coordination.
- Web HLS Chrome's incorrect native `maybe` path is fixed in `apps/web/src/features/feed/FeedVideo.tsx`. The new regression verifies `hls.js` is used whenever supported, retaining native on devices where MSE is unsupported. Actual Chrome browser full HLS from Cloud.ru S3 reached currentTime>0 with 504 injection; 403/404 no bypass.
- Android Expo Hermes export PASS in the prior pre-push acceptance. **No installed Mobile app E2E** yet, because the available iOS simulator app binary was removed during unrelated Mac temporary build cleanup, and the app's actual login/NextAuth equivalent must be staged safely rather than using production credentials. Android debug APK exists but requires separate authenticated test-only app fixture setup. Native simulator changes not made. Component coverage and real JWT API transport are tested, but shouldn't be represented as installed-device acceptance.
- After tests a disk cleanup external to this migration increased free storage to approximately 42 GiB; the old iOS debug binary at `/tmp/gafus-vox-ios-derived/Build/Products/Debug-iphonesimulator/Gafus.app` is absent. Do not infer prior iOS build still exists.


### Android emulator attempt after Web pass (2026-10-13 ~01:24 +04)

The Mac had ~43 GiB free after unrelated cleanup. Booted the existing `Medium_Phone_API_36.1` arm64 Android emulator using AI Commander (job `bce4e40e0456e66d`). Android 16 reached `sys.boot_completed=1` and `adb devices` showed `emulator-5554 device`. The preexisting GAFUS debug APK `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` was ~295MB.

Attempted installation twice with `adb install -r -t` and `adb install --no-streaming -r -t`. **Neither install returned status/progress after multiple minutes**; device package-manager queries also stalled. Cancelled both hung install jobs (`3109207c7f079888` and `657107658a68cc6b`) and explicitly cancelled the emulator job. No installed-device media-screen fallback E2E result can be claimed. The actual React Native component tests (3 image + 2 HLS) and real local JWT API transport remain green and are the highest verified Mobile layer for now.

A future native E2E requires a working Android APK installation/Expo dev-client session, an isolated mobile-only test route with staging JWT and synthetic media, and injected CDN failure traffic; do not point a debug app at real user data or production API. `main` not pushed and GAFUS production config unchanged.
