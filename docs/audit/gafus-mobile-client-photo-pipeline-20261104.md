# GAFUS photo pipeline: local Cloud.ru Photo Job retirement (2026-11-05)

## Deployment status and non-negotiable safety condition

**LOCAL REFACTOR ONLY. NOT PUSHED OR DEPLOYED.** No production resources, Cloud.ru Jobs, existing buckets, real PostgreSQL or store binaries were modified by this work. All user-photo processing in the *current refactor sources* is client-side WebP; server API validates the final variants and copies them in S3. **Cloud.ru Container Jobs remain ONLY for optional 360p VIDEO**, two Feed and two Chat2 Jobs. Do not enable an old image-processing fallback or provision a photo worker.

**Deleting PHOTO Jobs from current production before a compatible backend and clients have been deployed can break existing production app versions.** Existing installed iOS/Android binaries and old Web bundles may still call legacy photo reservation/complete endpoints. New server must fail closed with a clear `CLIENT_PHOTO_REQUIRED`/retry message rather than hanging; old clients may need a store update. Before deleting production Jobs, check actual deployed SHA, API/Web compatibility, allowed client versions, and outstanding work in production **with explicit authorization**. Nothing about this local audit verifies production currently has the new code.

The former flags `GAFUS_CLIENT_PHOTO_READY` and `EXPO_PUBLIC_CLIENT_PHOTO_PROCESSING` are no longer used in current upload sources. Photos use the client WebP path by design, not by temporary opt-in. Do not use the earlier rollout note as a release procedure.

## Current photo contracts

| Feature | Client WebP renditions | Server finalization | Cloud PHOTO Job |
|---|---|---|---|
| Moments/posts/comments | 360 / 720 / 1440 px | `/api/v1/feed/uploads/:id/client-complete`, S3 HEAD + validated COPY → READY | None |
| Chat2 photos | 360 / 1440 px | `/api/v1/chats/:id/media/v2/:mediaId/client-confirm` | None |
| Gallery | 480 / 1920 px | `/api/v1/gallery/uploads/:id/client-complete` | None |
| Questions | 360 / 1440 px | `/api/v1/questions/photos/:id/client-confirm` | None |
| Veterinary attachment thumbnails | 640 px | Synchronous upload to private S3, no async `vetPreview` enqueue | None |

Photos are encoded on the browser/device (WebP quality ~80), staged via owner-authorized, expiry-bounded S3 signed POST. Hono validates S3 metadata and bounded Sharp decode without generating public variants; writes use ETag-fenced S3 server-side COPY followed by HEAD. Core transitions to READY transactionally with ownership, status, and lease checks. No image bytes are forwarded via Cloud.ru Container Jobs. Photo stage and final objects have independent cleanup fences; private Gallery keeps owner-authorized delivery.

For video, device/browser creates primary MP4 H.264 720p and **one poster**. The remaining four Cloud.ru Jobs generate **360p only** (Feed×2, Chat2×2). No HLS, 1080p, photo processing, or second poster Job.

## Historical work and S3 cleanup after removing Jobs

| Historical state/task | Current local recovery |
|---|---|
| Gallery `publish` pending / lease-expired processing | Core maintenance terminates with `LEGACY_PHOTO_PROCESSOR_RETIRED`, closes stale upload and schedules S3 cleanup; Gallery S3 janitor never leases old Sharp `publish` |
| Gallery interrupted client `processing` | Reopens RESERVED for owner re-confirmation; never promotes a lost bucket event to dead Cloud photo work |
| Gallery `delete`, `move`, `vetPreview` | Existing GAFUS Worker executes bounded/ETag-fenced S3 work and commits receipts via Core; old `vetPreview` becomes terminal, new previews created synchronously |
| Feed `publish_photo` or `copy_album` pending / expired lease | Core `retireLegacyPhotoJobs` marks FAILED with user-visible error, preserves already READY media, creates deterministic `delete_keys` intent |
| Feed `delete_keys` / `cleanup_source` | `FEED_LOCAL_STORAGE_JANITOR_ENABLED=true` runs in existing GAFUS Worker: owner-bound exact claim, validated S3 keys, DELETE + independent HEAD absence, Core PG completion and CDN purge outbox; never starts Cloud VIDEO for cleanup |
| Questions `QUEUED` / expired `PROCESSING` | Hono sets FAILED / `PHOTO_JOB_RETIRED`, leases cleanup; existing GAFUS Worker performs exact owner-derived S3 DELETE and HMAC-acknowledges PostgreSQL |
| Chat2 legacy photo `QUEUED` / expired `PROCESSING` | Core sets FAILED / `PHOTO_JOB_RETIRED`, independent signed local-Worker-to-Hono cleanup, no video Job flag required |
| Chat2 / Questions `CLIENT_PROCESSING` lease expiry | Return to `AWAITING_UPLOAD` for client retry; don't place in Cloud queue |

The Cloud dispatcher, release job inventory, image manifest and registry publishing selector now allow ONLY: `gafus-feed-video`, `gafus-feed-video-2`, `gafus-chat-video`, `gafus-chat-video-2`. `gafus-gallery-process*`, `gafus-feed-photo*`, `gafus-chat-photo*`, and `gafus-questions-photo*` are forbidden. The HMAC Feed job claim endpoint requires `workerType: "video"`; local worker S3 deletion is not exposed through the Cloud endpoint.

The independent janitors run in the existing `gafus-worker` with narrowly scoped keys, bounded batches, durable leases, retries and no unsafe fallback to another bucket. In production compose they are enabled by `GALLERY_LOCAL_STORAGE_JANITOR_ENABLED=true` and `FEED_LOCAL_STORAGE_JANITOR_ENABLED=true` (both default true).

## What was actually verified locally

- [x] Feed/Core/Worker targeted tests on the retired-Jobs, janitor, protected HMAC API and video-only dispatch — PASS. Tests assert no Cloud photo invocation and no VIDEO invocation just for S3 cleanup.
- [x] **Real disposable local PostgreSQL 18**: Gallery client WebP READY without publish Job, interrupted lease recovery and historical publish terminalization — 3/3 PASS. Temporary PG was destroyed.
- [x] **Real disposable local PostgreSQL 18**: old Feed `publish_photo` → Core FAILED+cleanup intent → existing Worker claims/deletes/HEAD-confirms/commits PG; second tick idempotent — PASS. Temporary PG was destroyed.
- [x] **Real disposable loopback MinIO**: three signed WebP multipart POSTs; HEAD, GET, codec validation, ETag-checked S3 COPY, exact byte readback, invalid MIME and corrupted stream rejection, anonymous 403 — PASS. Test MinIO process and objects removed.
- [x] Build and typecheck of Worker / Core / Feed storage; photo queue API tests; blocking CI media inventory/source contract. `node ci-cd/scripts/media-pipeline-guard.mjs` and `node --test scripts/qa/cloud-photo-jobs-retired.test.mjs`.
- [x] **Real disposable PostgreSQL + Redis**: two independent Questions cleanup leases, SOURCE replay/sweep, expired-token CAS, missing-photo ALL cleanup, REDIS DOWN recovery of five queued delete receipts — PASS. PostgreSQL, Redis and scratch data destroyed.
- [x] **Real disposable MinIO S3 DELETE + HEAD**: `node scripts/qa/questions-worker-real-s3-delete.mjs` — published variants survive SOURCE cleanup; ALL deletes all keys; repeat DELETE remains idempotent; an unrelated S3 key is rejected; all verified absent objects return HEAD 404. Test MinIO destroyed.
- [x] Questions S3 cleanup physical DELETE moved from Hono into existing Worker. Hono only leases/acknowledges with strict HMAC claim/complete/fail and maintains READY; Worker validates exact owner/media-derived keys, executes S3 DELETE, confirms success or schedules retry. No raw key arguments allowed from client/HMAC command; replay-safe SOURCE cleanup is reissued after signed POST expiry.
- [x] Historical 12 Gallery V1 integration expectations that require the old photo publish worker were identified as obsolete; replacement real-PG acceptance tests exist. These old scenarios are **not** green and must not be counted as passed.
- [ ] End-to-end every user photo flow against a combined disposable DB+MinIO+live Hono (Gallery, Moments, Questions, Chat2, Web and Mobile). Separate real-PG and real-MinIO tests do not establish complete all-four app E2E.
- [ ] Real iOS / Android device tests: HEIC, HEIF, JPEG, PNG, WebP, rotated/large/corrupted images, offline/backgrond retry, logout races and app updates. No device E2E was run for this change.
- [ ] Actual Cloud.ru S3 provider-specific signer / private delivery verification after deployment, authorized production DB read-only inventory and pending-job drain. **No production access or Job deletion occurred.**
- [ ] Coordinate deployment of compatible API/Web and store binaries, ensure old clients cannot silently retry deleted photo workers, then separately authorize physical Cloud.ru photo Job deletion after a canary. Video 360p Jobs must remain available.

## Release gate

Never mark production READY or delete PHOTO Jobs based solely on this local pass. Confirm live SHA, release client compatibility, visible user error/retry behavior, S3 HEAD/GET/CDN readback, durable local janitor running, 4 VIDEO Jobs only, no growing photo `QUEUED`/`PROCESSING` backlogs, and zero unexpected media failures. Rollout and rollback must never require reactivating Cloud photo processing.
