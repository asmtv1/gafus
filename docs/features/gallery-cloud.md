# Private gallery cloud delivery

Implementation step 3 is complete locally. DEV infrastructure and CDN are deployed; DNS and HTTPS work. Runtime smoke has not yet been verified. The production deployment is pending. `GALLERY_ENABLED=true` and `GALLERY_PROCESSOR_READY=true` are staged in local Compose, and a reviewed DEV Terraform plan will enable four existing cloud functions. Neither activation nor real runtime smoke has been completed yet. Core owns registration, quotas, authorization, leases, durable jobs and cleanup. Workers use signed HTTP only and never connect to a database.

## Factories and imports

| Import | Export / purpose |
| --- | --- |
| `@gafus/gallery-storage` | `createGalleryStorageFromEnv(env?)`: `GalleryStoragePort` |
| `@gafus/gallery-storage/config` | `galleryStorageConfigFromEnv`, `validateGalleryObjectConfig` |
| `@gafus/gallery-storage/objects` | `createGalleryObjectStore`, `objectMd5`; injectable S3 client |
| `@gafus/gallery-storage/cdn` | `signGalleryCdnUrl`, `verifyGalleryCdnToken`, `constantTimeEqual` |
| `@gafus/gallery-storage/hmac` | `signGalleryRequest`, `createGalleryRequestVerifier`, `canonicalGalleryRequest`, `INTERNAL_GALLERY_PATHS`, `NonceStore` |
| `@gafus/gallery-storage/keys` | source/staging/final validation, `sourceUploadId`, `originKey` |
| `apps/gallery-cloud/src/worker.ts` | `createGalleryCloudWorker({core,objects,engine,queue,enabled?,now?})` |
| `apps/gallery-cloud/src/internal.ts` | `createGalleryInternalClient({baseUrl,secret,fetch?})` |
| `apps/gallery-cloud/src/origin-handler.ts` | `createGalleryOrigin({objects,secret,cdnSecret?,now?})` |

Only the pure processor subpath `@gafus/core/services/gallery/imageProcessing` is imported at runtime. Core service DTOs are type-only imports. Cloud entrypoints are `process`, `maintenance`, `dispatch` and `origin`; build artifacts expose `index.handler`. The build audits contributing modules for Prisma/logger/core barrel dependencies and checks that origin contains neither sharp nor SQS.

## Configuration

| Environment | Consumers / requirements |
| --- | --- |
| `GALLERY_ENABLED` | Exact `true`/`false`; absent means disabled. Web factory rejects other values. Keep maintenance scheduled while disabled. |
| `GALLERY_BUCKET` | Dedicated private bucket; old `gafus-media`/`gafus-public` rejected. |
| `GALLERY_S3_ACCESS_KEY_ID`, `GALLERY_S3_SECRET_ACCESS_KEY` | Distinct web, worker and origin static keys. Configured keys remain usable for HEAD/cleanup with the feature off. |
| `GALLERY_S3_ENDPOINT` | Web factory accepts only `https://storage.yandexcloud.net`; cloud uses this endpoint directly. |
| `GALLERY_CDN_BASE_URL`, `GALLERY_CDN_SECRET` | Web signer: HTTPS root; random 24–32 ASCII key. CDN algorithm supports at most 32 characters. |
| `GALLERY_INTERNAL_BASE_URL`, `GALLERY_INTERNAL_HMAC_SECRET` | Worker and web readiness: HTTPS core transport root; secret at least 32 bytes. |
| `GALLERY_PROCESSOR_READY` | Web factory requires exact `true` before enabling uploads/signing. Set only after cloud gates. |
| `GALLERY_BUCKET_PUBLIC` | Exact `true` rejects the web configuration. IaC independently closes the bucket. |
| `GALLERY_QUEUE_URL`, `GALLERY_QUEUE_ACCESS_KEY_ID`, `GALLERY_QUEUE_SECRET_ACCESS_KEY` | Worker/dispatcher: Yandex Message Queue URL and producer identity. |
| `GALLERY_ORIGIN_SECRET` | Origin-only secret, at least 32 bytes; Terraform restricts it to random ASCII. CDN injects `x-gallery-origin-secret`. |
| `GALLERY_ORIGIN_VERIFY_TOKEN` | Optional origin defense: exact `true` additionally needs `GALLERY_CDN_SECRET` in origin. Default false because edge authorization must work when query strings are stripped. |

Disabled factories reject POST/signing. Missing storage configuration makes HEAD throw `MISSING_GALLERY_STORAGE`; it never reports a nonexistent object. Only an actual storage 404 becomes `null`. Neither browser callers nor arbitrary custom endpoints/keys can select public destinations.

## Transport handoff

All endpoints accept POST and return the bare core DTO JSON, without a response envelope:

| Endpoint under `/internal/gallery` | Body / result |
| --- | --- |
| `/uploads/claim` | `{uploadId}` → registered source snapshot and attempt staging keys, or null |
| `/uploads/complete` | `{uploadId,attemptToken,sourceETag,width,height}` → `{accepted,status}`; core persists publish job |
| `/uploads/fail` | `{uploadId,attemptToken,errorCode,retryable}` |
| `/jobs/claim` | `{limit:1}` → claimed storage jobs with attempt token, source ETags, target keys and lease |
| `/jobs/complete` | `{jobId,attemptToken}` |
| `/jobs/fail` | `{jobId,attemptToken,errorCode,retryable}` |
| `/maintenance` | `{limit:10}` → `{expiredUploads,reconciledJobs,recoveredCleanupJobs,processUploadIds}` |

Use actual core DTO types for binding; transport handles authentication/status mapping, core handles business decisions. Request headers are `x-gallery-timestamp` (epoch seconds), `x-gallery-nonce` and `x-gallery-signature` (lowercase HMAC-SHA256 hex). Sign the exact raw body bytes:

```text
gallery-v1\nTIMESTAMP\nNONCE\nPOST\nEXACT_PATH\nSHA256_BODY_HEX
```

Verifier permits at most 60 seconds of clock skew, caps bodies at 16 KiB, and permits only the seven exact paths above. Normalize header names before verification. Verify the signature before calling `NonceStore.consume`; implement atomic shared Redis `SET NX` with expiry at the supplied epoch milliseconds, across every replica. Store errors fail closed; in-memory per-process replay protection is insufficient. A consumed nonce never authorizes a second request. HTTP retries get a fresh nonce and preserve the same attempt token; the worker retries network/429/5xx once, never treats a failed callback as a successful completion. Keep body parsing after raw-body capture. Transport must not log credentials, tokens, signatures or signed URLs.

## Processing, delivery and origin

POST policies last at most 600 seconds, bind exact registered source key and MIME type, and enforce 1–10 MiB. Source keys are `albums/{owner}/{album}/incoming/{uploadId}/source.{jpg|png|webp}` with server-generated safe IDs. Dispatcher applies the full grammar even though trigger suffix matching is broader. Output objects cannot trigger another processing loop.

Worker claims an upload before any object read, validates core's source/staging keys, and GETs the pinned ETag with `If-Match`. Sharp implements core's pure engine: JPG/PNG/WebP, at most 10 MiB/50 MP, auto orientation, stripped metadata including GPS, WebP q82, long edges 480/1920 without upscaling. Core adapts high entropy outputs downward at fixed q82 to its 1,750,000-byte output cap. Sharp strips metadata by default; see [sharp output documentation](https://sharp.pixelplumbing.com/api-output/).

Each attempt writes staging outputs immutably. `completeUpload` registers publication; it does not expose staging as the final key. Maintenance claims publish/move/delete jobs and uses conditional GET plus `PutObject(IfNoneMatch: '*')`, with MD5, byte count and MIME checks. Existing identical content is a no-op; a different final snapshot raises `IMMUTABLE_CONFLICT`. Conditional write races re-HEAD and accept only the expected content. Yandex documents [conditional object writes](https://yandex.cloud/en/docs/storage/concepts/object). Source/staging deletion remains a separate core-persisted cleanup job, so retries retain their inputs.

Workers bound writes by both invocation time and lease minus a five-second margin, using abort signals and checks before each write. Errors after an ambiguous completion remain replayable. Queue delivery is at least once, redrives after five receives, and has a DLQ. Object/timer delivery also has retry and DLQ configuration. Maintenance sends every `processUploadIds` item back to the processor queue; it never queries a database. Core can discover uploaded sources without client confirmation or an object event. With the flag off, maintenance still runs job cleanup, including core's one-hour failed DELETE recovery.

Origin accepts GET/HEAD only, checks the secret in constant time before storage access, and serves only final `thumb.webp`/`full.webp` keys. Encoded characters, traversal, backslashes and mismatched route paths fail closed. HEAD, GET metadata and streaming reads enforce the 1,750,000-byte cap; invalid MIME is not served. GET is a single storage read with a 3.5-second abort budget. Base64 JSON stays below API Gateway's 2.5 MB limit. Gateway uses the documented [v1.0 actual-path format and IAM function invocation](https://yandex.cloud/en/docs/api-gateway/concepts/extensions/cloud-functions).

Signed CDN URLs last at most 120 seconds. MD5 input is `expires + path + " " + secret`, base64url without padding, with no IP binding; see [Yandex secure tokens](https://yandex.cloud/en/docs/cdn/concepts/secure-tokens). CDN checks the token at the edge, including cache hits. Viewer responses use `private, no-store, max-age=0`, while configured edge caching is independent; see [Yandex cache configuration](https://yandex.cloud/en/docs/cdn/operations/resources/configure-caching). Cached-hit authorization and actual no-store/edge-HIT coexistence remain live gates. Web must use an ordinary image URL or Next Image `unoptimized` so signed private URLs bypass the Next image optimizer.

## Local verification and external gates

Local verification: 65 tests pass across targeted runs (29 storage, 36 cloud); both target typechecks and builds pass. Tests cover real sharp formats, EXIF orientation/GPS removal, corruption, input/pixel limits, adaptive high entropy output, HMAC known vector/skew/replay, CDN known vector/expiry, closed origin/path/byte caps, exact source ETags, duplicate/partial writes, immutable race handling, job retry input retention, missed-event enqueueing and disabled cleanup. Additional transport tests verify fresh valid nonces on ambiguous callback retry, HTTP 429/503 retry and nonretry of authorization failures; event tests cover source formats, output-loop rejection, duplicate IDs and bounded queue payloads. No running Next server or database is required.

The Linux artifacts pin sharp 0.34.3 and Linux x64 glibc prebuilt packages; ELF architecture was inspected. Native Linux execution is **not verified** on this macOS host. See [sharp platform installation](https://sharp.pixelplumbing.com/install/) and [Yandex Node runtimes](https://yandex.cloud/en/docs/functions/lang/nodejs/). Origin and dispatcher archives contain no native modules. ZIP order, timestamps and file permissions are deterministic.

Local benchmark: macOS ARM64, Node 20.20.2, 24 MP solid-color JPEG, 140,893 input bytes, 207 ms processing, 162.5 MiB process peak RSS; thumb/full 352/4,448 bytes. Peak RSS includes fixture construction and runtime overhead. This is neither a cloud latency nor a cloud memory measurement. High entropy behavior is separately covered by the real sharp test.

Before enabling, the operator must finish these gates in an isolated dev/staging environment:

1. DEV infrastructure/CDN and DNS/HTTPS are deployed. Verify actual web Lockbox identity, transport through the existing GAFUS API and shared Redis nonce store; runtime smoke remains pending.
2. Run the Linux native processor on Yandex `nodejs22`; exercise valid/invalid images and measure worker memory/timeout under load. Keep processor memory at 1 GiB, timeout 60 seconds and no prepared instances.
3. Run the opt-in smoke runner described in [the infra runbook](../../infra/gallery/README.md): conditional S3 GET/PUT, anonymous-read denial, source upload without confirmation, duplicate delivery, origin secret/path checks and cached CDN token denial.
4. Explicitly suppress incoming event delivery for a registered source fixture and run smoke with `GALLERY_SMOKE_REQUIRE_RECOVERY=true`; confirm maintenance returns and queues its ID. Separately verify scheduled maintenance without a manual call, partial output retry, HTTP outage/lease expiry, DLQ redrive and flag-off cleanup after the one-hour cooldown.
5. Measure fresh origin versions/cold invocations across zones through the CDN; each cold miss must fit CDN's five-second source timeout. The ordinary smoke request does not establish cold-start performance. Do not enable until this passes; origin has 256 MiB, four-second platform timeout and no sharp bundle.
6. Verify constrained browser POST CORS, negative public bucket ACL/IAM access, no public function invokers, actual scaling limits and viewer no-store headers alongside an edge HIT. A valid token must not bypass an invalid/expired/absent token test on the already-cached key.
7. Attach the exact **500 RUB/month notification budget**, without automatic shutdown, to the billing account. `infra/gallery/budget-policy.json` records the required policy; billing-account integration is an external/root gate and is not provisioned by this module.

Remaining work is external integration/credential/runtime validation, not missing local implementation. No production deployment is claimed. This local integration task made no cloud changes or commits.
