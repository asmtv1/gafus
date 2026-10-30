# Chat 2.0 — единый пайплайн медиа с «Моментами» (27.10.2026)

## Утверждённый формат

- Фото: исходники JPEG/PNG/WebP/HEIC/HEIF до 10 МиБ; процессор Moments
  `processFeedV2Image`: WebP 360/720 px (Chat-only), quality 82, без EXIF.
- Видео: исходники MP4/MOV/WebM до 200 МиБ и 120 секунд; процессор
  `processFeedV2Video`: H.264/AAC faststart MP4 360p/720p (Chat-only) и WebP poster.
- PDF остаётся документом, конвертация не нужна. HLS не используется.
- Контракт ключей и манифест: `packages/feed-cloud/src/chat2-v2.ts`.
  Обработчик: `apps/feed-cloud/src/chat2-v2-processor.ts`. Это НЕ запущенный Job.

## Следующий этап (Job пока отсутствует)

1. После проверки прав Chat API резервирует ключ оригинала и выдаёт форму
   прямого S3 POST для Web/Mobile. Отображаются реальные проценты загрузки.
2. S3 HEAD/ETag подтверждает исходник, медиа переходит в PROCESSING.
3. Отдельный Cloud Job с lease/retry вызывает общий кодировщик Moments,
   сохраняет варианты и валидирует их, затем транзакционно ставит READY.
4. До READY не публиковать исходный файл как готовое медиа, не создавать
   битые сообщения. В интерфейсе: загрузка, обработка, готово, ошибка.
5. Удалять через независимый журнал все ключи — source, poster, WebP, MP4;
   проводить очистку CDN. Права Chat API и переписок остаются прежними;
   дополнительную защиту CDN/S3 не добавлять.
6. После готовности Job заменить старый Chat-upload единым новым маршрутом,
   не оставляя параллельных обработчиков для фото/видео.

## Фактическое состояние

Пайплайн конвертации переиспользован в новом worker-side адаптере и покрыт
тестами, но пока не вызывается из Chat API. Действующая отправка фото и MP4
пока по-старому проходит через Hono и не конвертируется. Не переключать
клиентов на PROCESSING до создания Job. Отдельные CDN/production операции
не выполнялись. Для приёмки нужны реальные MinIO/S3 и Web/iOS/Android
тесты, проверка Range и безопасного удаления исходников и всех вариантов.


## Cloud.ru chat S3 provisioning 2026-10-27

- Owner confirmed public chat bucket. Created `gafus-chat-public` in existing project `4c590727-4133-475b-a4bc-564c90a9e686`; bucket ID `23794452-94d0-4cc5-91fa-38fb4e8c66ec`; Standard; 20 GB cap. Other buckets were not modified.
- Deleted our accidentally created empty (0 objects) bucket `gafus-chat-private`. No extra Cloud.ru project retained; a dedicated project-scoped service account `gafus-refactor-api` was subsequently created in the original project.
- Applied bucket policy from Cloud.ru console: public s3:GetObject on `arn:aws:s3:::gafus-chat-public/*`, without public ListBucket/PutObject/DeleteObject. Console showed policy saved. After a page reload, the toggle appeared off: persistence is NOT independently verified.
- Browser UI synthetic 39-byte upload failed at 0/1 in Cloud.ru, and the attempt was cancelled; anonymous GET could not be tested. Before production use, confirm GetBucketPolicy, anonymous GET on owned test object, deny ListBucket/anonymous writes, and CORS.
- Chat API, Web/Mobile, CDN and background job are NOT yet linked to this new bucket. Public S3 GET means holders of direct object URLs can read bytes without chat membership checks.


## Cloud.ru chat S3 API verified / outstanding (2026-10-27)

- Original project and existing media resources unchanged. `gafus-chat-public` only; bucket ID `23794452-94d0-4cc5-91fa-38fb4e8c66ec`, base name (not yet a public alias).
- Cloud.ru S3 signed API is reachable from the user's Mac using the `en0` source interface without altering OS routing. `HeadBucket=200`; `GetBucketPolicy=200` with anonymous `s3:GetObject` only; `PutBucketCors` and `GetBucketCors` verified for localhost + gafus.ru, GET/HEAD/POST.
- Public access block is not configured. Anonymous URLs at `gafus-chat-public.s3.cloud.ru` and `global.s3.cloud.ru/gafus-chat-public` return `NoSuchBucket`. Cloud.ru requires assigning a global name or a virtual-host domain to permit unauthenticated reads. Internal console controller API returned 403 to the IAM service token.
- Not complete: global/domain alias; signed test upload, public GET of a real file, Range, anonymous PUT/LIST denial, cleanup verification and Chat API/Web/Mobile hookup. Object-upload test via local tool was blocked by safety controls; do not claim it ran.
- Strict one-bucket-only repeatable API check: `node infra/cloudru/chat-public-s3.mjs --check`; fails with exit 4 until alias exists. Do not delete/recreate existing bucket as a shortcut without a separate safe migration decision. Jobs will be configured after S3 is accepted.


## Публичный S3 чата — принят, 27.10.2026

- Для существующего `gafus-chat-public` назначено доменное имя `gafus-chat-public`; HTTPS-адрес: `https://gafus-chat-public.s3.cloud.ru`. Глобальное имя не требуется и не создавалось.
- API проверка `node infra/cloudru/chat-public-s3.mjs --check`: **PASS**. Политика GetObject публичная, CORS сохранён, домен правильно маршрутизирует запросы.
- Интеграционный тест `GAFUS_CHAT_S3_SMOKE_CONFIRM=own-test-object-only node infra/cloudru/chat-public-acceptance.mjs`: **PASS**. Синтетический `video/mp4` объект, signed PUT/GET, анонимные GET/HEAD (200), Range (206), CORS preflight (200), запрет анонимных LIST/PUT (403), удаление и HEAD 404. Файл удалён после теста.
- Исторические ошибки `NoSuchBucket` и неудачная загрузка через консоль из предыдущих разделов **устранены или заменены подтверждённым API-сценарием**; текущая конфигурация публичного S3 принята.
- **Всё ещё не сделано:** подключение Chat API/Web/Mobile к бакету, Cloud Job для конвертации, реальное MP4-воспроизведение на устройствах, CDN. Не путать инфраструктурную приёмку с готовностью всего чата. Действующие бакеты и Jobs не изменялись.


## Chat2 Job V2 implementation checkpoint - 2026-10-27

- Approved media profile: WebP 360/720 and H.264/AAC faststart MP4 360p/720p, WebP poster; no Chat2 HLS, 1080p or 1440px. Shared Moments V2 encoders retain their own higher tiers by default.
- Shared `@gafus/chat-media-quality` module is consumed by Web/Vite and Expo Mobile: auto quality based on display size/DPR/network with manual 360p/720p override. Player controls appear only if backend provides both actual rendition URLs; current single-URL Chat API still works as fallback.
- REAL Cloud.ru S3 transcode acceptance PASS: `apps/feed-cloud/src/chat2-s3-acceptance.ts` uses Sharp/FFmpeg and signed immutable S3 upload to the chat-only bucket, verifies anonymous download for image 360/720, poster, and MP4 360p/720p. AWS SDK `InvalidDigest` for streaming MP4 was corrected with requestChecksumCalculation WHEN_REQUIRED and re-tested. The test prefix was independently checked: 0 objects left.
- REAL direct browser-style signed S3 POST PASS: `infra/cloudru/chat2-presigned-post-smoke.mjs` returned HTTP 200, signed S3 HEAD confirmed exact MIME and byte length, then test object was deleted. Cloud.ru uses 200 instead of requested 204 for this POST; the application must confirm with HEAD regardless of HTTP 2xx.
- Worker-side one-shot Job is implemented as `apps/feed-cloud/src/chat2-job-entry.ts`, `chat2-job-runner.ts`, `chat2-job-core.ts`, `chat2-s3-objects.ts`, `chat2-v2-processor.ts`, `Dockerfile.chat2-job`. Leases/renewal/failure/CAS manifest validation and immutable S3 writes have unit tests. Dedicated bundle: `pnpm --filter @gafus/feed-cloud-runtime build:chat2-job` PASS.
- Additive Prisma schema and migration PREPARED BUT NOT APPLIED: `Chat2V2MediaTask`, durable job queue with leases/retries. HMAC/nonce internal Core API `/internal/chat2/media/jobs/{claim,renew,complete,fail}` is OFF unless CHAT2_V2_CORE_ENABLED=true; unit tests for replay/forgery and durable queue pass.
- The authenticated direct-upload REST API `/api/v1/chats/:id/media/v2/reserve`, POST `/api/v1/chats/:id/media/v2/:mediaId/confirm`, GET status is OFF unless CHAT2_V2_MEDIA_ENABLED=true and CORE is enabled. It calls existing Chat2 writeGate/readGate to preserve paid cynologist, block and room rules.
- Cloud.ru read-only job list: 10 existing Container Jobs, NO `gafus-chat-media`. The Cloud Job has NOT been created or executed. Docker daemon is not running on the Mac, thus the dedicated OCI image has NOT been built or pushed to Artifact Registry. A reachable isolated nonproduction Hono Core is not deployed; callbacks cannot run from Cloud.ru yet.
- Remaining before cutover: deploy a verified OCI image to Artifact Registry, provision the actual isolated Cloud Job, isolated Core endpoint/secret delivery, apply the additive migration ONLY to confirmed Refactor dev DB, hook READY manifest to Chat2Media and the message flow, durable cleanup ledger for source/poster/all renditions and orphan uploads, and Web/real-device E2E tests. Do not enable feature flags or remove the working existing upload until ALL acceptance checks pass.
- No push, Cloud Job execution, production deploy, GAFUS Main access, or modifications to other buckets or existing jobs.


## Cloud.ru Job provisioning gate - 2026-10-27

- `infra/cloudru/chat2-job-provision.mjs --check`: read-only API verification PASS; project ID matches existing Cloud.ru project; 10 previous Jobs intact; `gafus-chat-media` absent; no image was prepared.
- The script supports a separate `--create` but refuses unless an actual digest-pinned `CHAT2_JOB_IMAGE`, a verified HTTPS nonproduction Core URL, and the exact opt-in `GAFUS_CHAT2_JOB_CREATE_CONFIRM=nonprod-dormant-verified-image` are provided. It always creates `runImmediately:false`, `CHAT2_JOB_ENABLED=false`, and never overwrites an existing Job or embeds S3/HMAC secrets.
- Runtime Docker Engine is unavailable on authorized Mac. Per official Container Apps docs a valid image must first be uploaded to Artifact Registry. Build command from permitted project root once a safe project-bound image builder is available: `docker build --platform linux/amd64 -f apps/feed-cloud/Dockerfile.chat2-job -t REGISTRY.cr.cloud.ru/gafus-chat-media:VERSION .`, followed by an authorized registry push and digest verification. Do not run these commands automatically against unknown registries, and do not start Docker Desktop outside the project under current isolation rules.
- Cloud activation requires a chat-bucket-scoped S3 key, secure HMAC secret delivery, an isolated Core reachable via HTTPS, and deployed/migrated Refactor DB; current service-account bootstrap key has broader project permission and must not be injected into the Job as a secret.


## Chat2 media Job performance audit - 2026-10-27

This review examined actual source code and locally benchmarked FFmpeg, then revalidated both transcode paths against the real `gafus-chat-public` bucket using **only disposable synthetic keys**. The Cloud.ru Container Job is not yet deployed: these timings do not represent a 2/4 vCPU cloud instance.

### Path and request budget per successful new asset

1. Authenticated direct browser S3 POST of the source, followed by API confirmation HEAD.
2. Job makes ONE signed S3 GET of the source, streaming it to the isolated local attempt directory. GET response size + MIME are verified; no redundant preceding HEAD. No second S3 download of the source.
3. Image: one local source `readFile`, two WebP encodes and two immutable S3 PUTs. Video: metadata `ffprobe`, strict full-frame timestamp scan (protects 120s limit), WebP poster via a separate FFmpeg call, and two final MP4 encodes. FFmpeg shared-decode mode reads/decodes video once for the 360p and 720p output pair.
4. Each successful S3 PUT is protected by Content-MD5, If-None-Match:* and confirmed using its returned MD5 ETag, avoiding an extra worker HEAD. Missing/non-MD5 ETag or an immutable PUT collision triggers a mandatory worker HEAD and byte/MIME/MD5 verification. Source and output bytes are never copied between buckets.
5. Authenticated backend completion separately HEAD-verifies **every final object** by public URL, concurrently, before CAS status READY. This is an important trust boundary; do not omit.

**S3 operations within worker+completion (normal success; excluding initial user POST+API confirmation):** image **8 => 5**, video **11 => 7** requests. Image 1 GET + 2 PUT + 2 core HEAD; video 1 GET + 3 PUT + 3 core HEAD. This removes 3 or 4 metadata requests without weakening immutable collision verification. Local MP4 is read a second time for MD5 before streamed PUT: this is intentional for integrity and is NOT another S3 download.

### FFmpeg concurrency and measured tradeoffs

Local Apple Mac synthetic 1280x720 / 24fps / 45 seconds, eight logical/physical CPU cores (representative timing only, not a Cloud benchmark):

| Video encoder strategy | Time | Local decoded input passes |
| --- | ---: | ---: |
| Sequential, 2 threads per encode | 3.50 s | 2 |
| Two separate FFmpeg encoders, 1 thread each | 6.44 s | 2 |
| Two separate FFmpeg encoders, 2 threads each | 3.11 s | 2 |
| Single FFmpeg shared decode, 1 thread each | 6.47 s | 1 |
| **Single FFmpeg shared decode, 2 threads each** | **2.70 s** | **1** |

Conclusion: blind parallelism on insufficient CPU is counterproductive. The approved runtime selects the safe **sequential** 360p -> 720p two-thread mode on the planned **2 vCPU** Cloud Job. With an explicitly provisioned **4+ vCPU** instance, set both `CHAT2_JOB_VCPU=4` and `CHAT2_VIDEO_TRANSCODE_MODE=shared-decode` for one FFmpeg input decode with two independent H264/AAC output streams. `CHAT2_VIDEO_TRANSCODE_MODE=parallel` (separate encoders) is supported for comparison but inferior to shared decode on these Mac samples. On an actual Cloud.ru 4-vCPU Job, compare p50/p95 processing time, CPU quota/throttle and memory before enabling. The default Moments encoder is unaffected.

**Tests:** real Cloud.ru synthetic 360/720 WebP and 360p/720p MP4+poster E2E PASS in regular and shared-decode modes; public GET PASS, attempted cleanup succeeded. A separate local synthetic video with audio validated faststart moov and H264/AAC in **both** shared-decode renditions. Fake S3 unit tests confirm GET-only source fetch, immutable PUT-without-extra-HEAD, and collision HEAD verification.

### Remaining correctness and security blockers

- **Public originals:** current `gafus-chat-public/*` bucket GetObject policy also exposes `chat2/.../incoming/source.*` to anyone possessing its URL. Before user-facing cutover, narrow anonymous GetObject to final `/v1/` prefixes only; the job service role can still read incoming originals privately. Test public 200 for final renditions and public 403 for incoming. Never assume UUID obscurity provides authorization.
- **Orphans:** partial failure uploads can leave poster/MP4 objects even though READY was not written. Source clean-up, abandoned upload expiry and durable deletion intent for all final variants are not yet implemented. Repeated PUTs are immutable and fail-safe, but this is not automatic garbage collection.
- **Image quality semantics:** existing Sharp edge sizes are MAXIMUM EDGE dimensions, not strictly width. A portrait photo nominally 720 is at most 720px tall; the client `srcset` uses width descriptors. This mismatch should be resolved before enabling responsive image delivery.
- **Actual infrastructure:** Cloud Job OCI image, build/push, isolated API endpoint/Refactor DB migration and browser/real-device full E2E are not complete. Nothing was activated or pushed in this audit.
- **Strict video safety:** FFprobe's frame-timestamp pass costs extra local read/CPU but guards against forged duration underreporting. Avoid removing it without a proven alternative. MP4 MD5 pre-hashing adds a local disk pass (not an S3 GET) and supports idempotent checks.


## Chat2 source privacy, lifecycle cleanup and Cloud.ru Moments Job audit — 2026-10-27

### Cloud.ru real Job configuration (verified using GET API, no mutation)

Existing `gafus-feed-video`, `gafus-feed-video-2`: **2 vCPU, 8192 MiB RAM, timeout 650s, maxRetries=3, status ready**. Existing `gafus-feed-photo`, `gafus-feed-photo-2`: **1 vCPU, 2048 MiB RAM, timeout 240s, maxRetries=3, status ready**. Staging: `gafus-feed-video-staging` 1 vCPU/4096 MiB, `gafus-feed-photo-staging` 0.5 vCPU/1024 MiB. No Jobs modified. This confirms 2 vCPU/8 GiB as the initial target for Chat 2, with sequential encoding by default; optional shared-decoder FFmpeg only after verifying an actual 4-vCPU Job and measuring Cloud.ru throughput.

### Anonymous S3 source privacy — APPLIED in existing chat-only bucket

- Replaced the overly broad `arn:aws:s3:::gafus-chat-public/*` anonymous `s3:GetObject` with **`arn:aws:s3:::gafus-chat-public/chat2/*/v1/*`**. This was safe because prior signed S3 LIST showed 0 existing objects. One policy change affects **only `gafus-chat-public`**; other buckets and jobs were not changed. CORS retained, no public PUT/LIST/DELETE.
- Updated `infra/cloudru/chat-public-s3.mjs --check` to require the narrowed policy. Signed GetBucketPolicy verifies exact resource; real synthetic original `/incoming/` responds anonymous **403**; real final WebP+MP4 `/v1/` responds anonymous **200**. The signed API remains able to GET the original. S3 LIST again verified bucket empty after tests.

### Actual width 360/720 WebP — IMPLEMENTED

- Chat-only Sharp sizing is now **maximum WIDTH 360 or 720 px**, without upscaling; Moments' maximum-edge resize remains unchanged. Supports portrait images without inadvertently yielding 225px-wide '360' variants. Image manifest contains each encoded rendition's true `{width,height}`.
- The Web client uses those actual pixel widths in responsive `srcset`, deduplicating equal widths for small originals; Mobile selects a URL using actual pixel width and screen DPR. Synthetic portrait image **800x1280** yielded WebP **360x576** and **720x1152** in real Cloud.ru S3 acceptance, both publicly retrievable.

### Source deletion and failure recovery — IMPLEMENTED in disabled new Refactor API

- **After** all generated variants have been verified, `complete` atomically sets `READY` and durable `cleanupKind=SOURCE`, then immediately deletes the original by signed `DeleteObject` on its exact incoming key. It never deletes originals during decoding, before successful READY, or while a retry might still need them. S3 delete success marks `cleanupCompletedAt`. The original does not remain in normal successful processing.
- If deletion fails transiently, the attachment stays READY while the separate cleanup intent survives in the `Chat2V2MediaTask` record. A leased, bounded reconciler with exponential backoff retries deletion later via signed `/internal/chat2/media/jobs/cleanup`, and opportunistically on `claim`. No source URL is made public at any time.
- On final processing failure (maximum attempts), or an unconfirmed reservation older than one hour (presigned form expires after 10min), the durable task becomes FAILED/EXPIRED with `cleanupKind=ALL`. Reconciler deletes exact source plus both potential images, poster and both MP4s, including partial outputs that never reached READY. Intermediate retries retain the necessary original and immutable variant objects only while recovery is still possible. Terminal crashed fourth attempts are recovered into FAILED. Cleanup is idempotent, CAS-leased and limited to the one user's derived chat prefix in `gafus-chat-public`.
- Prisma schema/migration is additive **and has NOT been applied to any DB**. Hono Job endpoints remain gated/off by default. A recurring invocation of the signed janitor endpoint must be configured when deploying the isolated Cloud Job, so failed cleanup is retried even in the absence of new uploads. No claim of complete production integration before scheduler + DB activation.
- Real Cloud.ru tests PASS: original anonymous GET 403; outputs GET 200; production-style S3 delete primitive removes source and signed HEAD confirms 404 while outputs remain 200; terminal cleanup test removes all potential variants, confirmed HEAD 404. Final signed LIST reports **0** residual objects. Backend unit tests cover READY-triggered delete, terminal ALL deletion, retry-intent preservation on S3 failure and no removal from active PROCESSING tasks.

**Rollout still pending:** Chat2 Job OCI image/Artifact Registry, Cloud Job creation, nonprod Hono Core connectivity, Refactor-only database migration, client upload cutover and automated cleanup schedule. Old chat attachment upload remains live; no production changes, no push.


## Chat2 four Cloud Job pool parity with Feed — 2026-10-27

**Current architecture is four isolated Container Jobs, not the earlier single `gafus-chat-media` draft.** The earlier historical single-Job provisioner has been replaced. Confirmed by read-only Cloud.ru API 2026-10-27: 10 existing Jobs, 0 of the new four Chat2 names. Nothing was deployed.

| Chat2 Job | Resource parity from Feed | Timeout | Max retries | Runtime image |
| --- | --- | ---: | ---: | --- |
| `gafus-chat-photo` | 1 vCPU / 2048 MiB | 240 s | 3 | photo target (Sharp, no FFmpeg) |
| `gafus-chat-photo-2` | 1 vCPU / 2048 MiB | 240 s | 3 | same immutable photo image |
| `gafus-chat-video` | 2 vCPU / 8192 MiB | 650 s | 3 | video target (FFmpeg+Sharp) |
| `gafus-chat-video-2` | 2 vCPU / 8192 MiB | 650 s | 3 | same immutable video image |

- One upload wakes **one** provider execution: `enqueueChat2MediaProcessing` stores only the UUID and `photo`/`video` kind in a separate Redis/BullMQ queue, independently of Feed. `startChat2MediaProcessingTriggerWorker` reuses Feed's allowlisted Cloud.ru trigger and round-robin semantics: 1st upload to primary Job, next to `-2`, and so on. If launch returns provider error, BullMQ retries and the pool selects the alternate replica. Launch request rate is bounded like Feed (one / 500ms). The media bytes never travel via Redis.
- A separate, opt-in minute-based `createChat2MediaRecoveryTick` uses Prisma's **durable queue**, groups all due sources by MIME, and starts up to two Jobs per kind for sufficient backlog. If nothing is due, **zero Cloud Jobs are executed**; it does not start four empty workers every minute. This supports lost Redis wakes and crashed worker claims. Chat flags must all be explicitly enabled.
- Each one-shot Job declares `CHAT2_JOB_KIND=image` or `video` and its own resource budget. The HMAC-signed claim includes kind; Core's `FOR UPDATE SKIP LOCKED` query restricts SQL to matching `sourceMime`, then verifies it again before issuing the lease. A video Job can never steal a photo claim even if a bad/misrouted response occurs. The other kind's busy worker cannot block the image pool.
- **Two Container Jobs ≠ two FFmpeg encode threads.** Two separate user videos can be processed concurrently by two 2-vCPU Jobs. Inside each video Job, 360p and 720p are still sequential by default because unconstrained FFmpeg parallelism had worse timings under tight CPU. The optional shared decoder mode stays disabled until a specific 4+-vCPU design is tested. Images use only two WebP renditions.
- `apps/feed-cloud/Dockerfile.chat2-job` now provides separate `photo` and `video` build targets from the same source; photo excludes FFmpeg to reduce image size and cold start. Four Jobs require just **two** versioned, verified OCI images pinned by digest and pushed to Artifact Registry.
- `node infra/cloudru/chat2-job-provision.mjs --check` is read-only; `--create` requires verified image digests (`CHAT2_PHOTO_JOB_IMAGE`, `CHAT2_VIDEO_JOB_IMAGE`), HTTPS nonproduction Core, checked project, and explicit `GAFUS_CHAT2_JOB_CREATE_CONFIRM=four-dormant-refactor-chat-jobs`. Resources are created with `runImmediately:false` and `CHAT2_JOB_ENABLED=false`; secrets are **never** embedded. Existing Jobs cannot be overwritten or merged.
- Sample builds **once Docker or an isolated trusted image builder is available** (commands MUST be run only from the allowed Refactor directory):
  `docker build --platform linux/amd64 --target photo -f apps/feed-cloud/Dockerfile.chat2-job -t gafus.cr.cloud.ru/gafus-chat-photo:V2 .`
  `docker build --platform linux/amd64 --target video -f apps/feed-cloud/Dockerfile.chat2-job -t gafus.cr.cloud.ru/gafus-chat-video:V2 .`
  Push and obtain immutable `@sha256:` digests before any provisioning. **No image was built/pushed, no Cloud Job was created.** Docker Engine on the authorized Mac was unavailable.
- Unit tests cover pool 5/5 round-robin and fallback on 429, recovery at 0/1/2+ pending claims per kind, API type gating and cross-type claim denial, and both legacy Feed and Chat2 triggers. No production changes. Actual Cloud.ru concurrency, quotas and costs need isolated acceptance after registry deploy.


## FFmpeg 2-vCPU benchmark and recommended settings — 2026-10-27

This benchmark used a **new isolated Linux Docker container** with FFmpeg 5.1.9 and libx264, exact actual FFmpeg arguments from `packages/feed-cloud/dist/feed-v2.js`, CFS `cpu.max=200000 100000` (2 vCPU), RAM `8589934592` bytes (8 GiB). Docker Engine was available at test time. It was **NOT** a real Cloud.ru Container Job; Cloud.ru CPU hardware and image runtime may differ. The workloads were synthetic 25-second testsrc2 + AAC inputs at 1280x720 and 1920x1080, not actual user content. Two runs per main variant, one per exploratory ultrafast variant. Time covers **both** 360p and 720p encoding only (not S3 or separate poster/probe stages). In every mode both outputs were progressive H.264/AAC MP4 with standard per-quality target bitrates.

| FFmpeg mode | 720p input | 1080p input | Mean combined MP4 size, 720p test |
| --- | ---: | ---: | ---: |
| CURRENT decoder `-threads 2`, x264 auto `veryfast` | 4.920s | 9.614s | 8.456 MB |
| decoder `-threads 1`, x264 `-threads:v 2`, `veryfast` | 3.917s | 6.872s | 8.479 MB |
| decoder `-threads 2`, x264 `-threads:v 2`, `veryfast` | 4.110s | 7.221s | 8.476 MB |
| **decoder `-threads 1`, x264 `-threads:v 2`, `superfast`** | **3.157s** | **6.289s** | **8.557 MB** |
| shared decoder, 2 threads per output, `veryfast` | 4.381s | 8.849s | 8.477 MB |
| exploratory `ultrafast`, decoder1/x264 2 (single run) | 4.051s | 5.650s | 8.532 MB |

**Recommendation for both 2-vCPU Chat2 video Jobs:** `-threads 1` BEFORE `-i`, `-threads:v 2` after `-c:v libx264` / as video-output option, `-preset superfast`, encode 360p then 720p **sequentially**, continue to process two independent input videos concurrently via `gafus-chat-video` + `gafus-chat-video-2`. Relative to the code's current unbounded x264 auto mode, the faster balanced setup saved **35.8%** for 720p input and **34.6%** for 1080p input in this isolated bench; total MP4 bytes rose approx **1.1–1.2%**. H.264 SSIM (720p output vs scaled source): 720p synthetic, `veryfast` explicit1/2 **0.991603**, `superfast` **0.989577**, `ultrafast` **0.984882**; 1080p synthetic, `veryfast` **0.995309**, `superfast` **0.994678**, `ultrafast` **0.991631**. `ultrafast` has more quality loss and was not consistently faster, so it is not recommended.

**No automatic code change was made to the production-encoding profile from this benchmarking-only request.** Before activating on Cloud.ru, benchmark representative real-device clips (including HDR, high motion and rotations) on a real 2-vCPU job and inspect p50/p95 processing time, quality, filesize, cold start and S3 latency. `sharedDecode` won on unconstrained Mac but **lost on the realistic 2-vCPU Linux quota**, so it should remain disabled for current video-job sizing. Bench results/commands were retained in `.local-pg-scratch/chat2-encoder-comparison` (raw synthetic MP4 samples may be cleaned to save disk). No changes to GAFUS Main or existing Cloud Jobs.


## Chat2 selected FFmpeg settings and two OCI images — 2026-10-27

The user approved and the code now applies the recommended **Chat2-only** settings, leaving Feed/Moments' legacy defaults intact. `apps/feed-cloud/src/chat2-v2-processor.ts` passes `decoderThreads:1, encoderThreads:2, preset:"superfast"` into the shared `processFeedV2Video` optional tuning profile. The shared `feedV2Mp4Arguments` still defaults to `-threads 2`, x264 automatic threads, `-preset veryfast` for every other caller. Chat2 `-threads 1` is positioned before the input, and `-threads:v 2` is an output video encoder option; progressive H.264/AAC 360p + 720p, configured bitrates, 120-second media limit, poster, no HLS, no 1080p remain unchanged. On the two 2-vCPU video Container Jobs each file continues 360p then 720p sequentially; separate files can be processed on two Jobs.

Verified in the actual project at this checkpoint:

- `pnpm --filter @gafus/feed-cloud build` — PASS.
- `pnpm --filter @gafus/feed-cloud-runtime typecheck` — PASS.
- `pnpm --filter @gafus/feed-cloud-runtime build:chat2-job` — PASS, with no Prisma/Main code bundled.
- `pnpm --filter @gafus/api typecheck` — PASS.
- Relevant FFmpeg, Chat2 contract, adapter and runner unit tests — **22/22 PASS**, including both Chat2 profile options and regression protection for old Moments settings.
- Docker Engine became available. Two separate **local linux/amd64** production-target OCI images were successfully built using a **232 KiB/minimal source-only context** containing no local credentials, S3 keys or unrelated repository content: `gafus-chat2-photo:local-verification` (**97,048,044 bytes**) and `gafus-chat2-video:local-verification` (**272,364,934 bytes**). Photo starts Node+Sharp 0.34.3 and omits FFmpeg; video has Node+Sharp 0.34.3 plus FFmpeg 5.1.9/libx264. The bundled image contains the new `superfast` profile.
- **These OCI images are LOCAL ONLY**, unpushed, not digest-pinned in a Cloud.ru registry, and not a completed job deployment. No Cloud.ru Chat2 Container Jobs have been created, started or modified as part of this step. Existing Feed Container Jobs have not been changed. No git push or production deployment.

Next safe operational sequence: (1) establish a reachable isolated **Refactor-only** HTTPS Core and deploy the additive `Chat2V2MediaTask` migration to the confirmed **Refactor dev** database only; (2) secure the Job's least-privilege S3 chat-bucket credentials plus HMAC callback secrets using Cloud.ru secrets management rather than embedding them into images or Container Job environment literals; (3) push the two verified `linux/amd64` Chat2 images to Artifact Registry, pin exact digests, and use `infra/cloudru/chat2-job-provision.mjs` to create four **dormant** Jobs with the agreed Feed-matching CPU/RAM; (4) activate one isolated photo/video job at a time, exercise 360/720, 2-job round-robin, crash/retry, original deletion, partial cleanup, network/security tests on synthetic S3 objects; (5) Web+Mobile E2E and replace the old Chat2 upload path once the new path passes. Keep flags OFF and existing user-facing Chat2 media untouched until step 5 passes.


## Chat2 V2 isolated Backend + real PostgreSQL/Redis acceptance — 2026-10-28

**No production/Main access or writes.** GAFUS Refactor-only local setup is now verified, but Cloud.ru cannot access a loopback URL and the four container jobs remain unprovisioned.

- A stopped older project-local Chat2 PG cluster at `chat2-db` (55432) was started for identity checking but left **stopped**; its password/user did not match the available secret, so no schema/data changes were made there. Never reuse or overwrite it. PostgreSQL running on 5432 was never contacted.
- A **new, entirely empty and separate PostgreSQL 14 cluster** was initialized in `.local-pg-scratch/chat2-v2-backend-dev-20261027/data` with project-only unix socket `.local-pg-scratch/v2sock`, loopback port **55433**, isolated role `gafus_refactor_chat2` and database **`refactor_chat2_v2_dev_20261027`**. Password stored in an ignored mode-0600 file in the cluster's directory; never echo, export, commit or share this secret. This is a disposable dev environment, not a release database.
- On the confirmed empty database (0 tables), `prisma db push --skip-generate` created the full current GAFUS Refactor schema (~183 tables). Then **only** `packages/prisma/migrations/20261027172500_chat2_v2_media_task/migration.sql` was executed on port 55433 in one transaction; verified the 22 Chat2 task columns and all five indexes, including `Chat2V2MediaTask_cleanup_pending_idx`. **No `prisma migrate deploy` was run, and no migration history was falsely recorded.** When provisioning a real fresh Refactor database, use the approved normal migration process instead of relying on this dev-only db-push baseline.
- Found and fixed a real cross-timezone lease bug: `Chat2V2MediaTask.nextAttemptAt` and `leaseUntil` are Prisma `@db.Timestamp(3)` (UTC wall clock without timezone), but raw `NOW()` in the locked claim SQL was `timestamptz` and compared in the PostgreSQL server timezone (this cluster uses Europe/Samara). An active lease was incorrectly considered expired. The locked query now uses `(NOW() AT TIME ZONE 'UTC')` in **both** due/reclaim checks. Added unit-level SQL assertions so the bug cannot silently return.
- Real Prisma/Postgres concurrency acceptance: two simultaneous `claimOne('image')` calls lease **two different mediaIds**, the next image claim returns zero, video claims only video, mismatched lease token cannot renew, READY verifies all output HEAD checks (mocked local, **not** real S3), cleans **only** source, transient failure schedules backoff, and an expired unconfirmed upload schedules all-variant cleanup. Acceptance rows are explicitly deleted and table checked empty. Script: `apps/api/scripts/chat2-v2-isolated-db-acceptance.ts`, *guarded* by exact Refactor dev DB URL/user/port/name and `CHAT2_DB_ACCEPTANCE_ONLY=explicit-isolated-refactor-test`.
- Independent **local Redis** launched on **127.0.0.1:55929**, with no RDB/AOF persistence and restricted project-local PID/log directory, using Redis DB `/2`. Backend HMAC secret was randomly generated and stored in a separate ignored mode-0600 file in the dev cluster. The API handler was exercised **in process via the original Hono route** against real Postgres and Redis: signed image/video claims succeed; Redis NX/PXAT nonce replay is rejected; invalid HMAC and invalid type denied; cleanup with no tasks is safe; client-facing Chat2 media route stays **OFF**. Script: `apps/api/scripts/chat2-v2-isolated-hmac-acceptance.ts`, with identical exact-URL guards. Nothing was exposed to a public listener.
- Local PG 55433 and Redis 55929 can remain available for subsequent nonproduction acceptance, but are **not** a Cloud.ru-reachable HTTPS Core. The Hono public app's old `GAFUS_LOCAL_ISOLATED_API` profile intentionally restricts its existing restored-WORK database/Redis and must **not** be weakened or pointed at this new DB. Do not start the full app without an approved isolated profile.

**Next dependency before Cloud.ru Jobs:** provision a **separate nonproduction HTTPS endpoint** for the existing Hono internal route, with DNS/certificate or private ingress reachable from Cloud.ru, isolated Refactor database (not localhost), private secrets/Redis and outbound access controls. Validate HMAC, Redis nonce replay, real S3 outputs, exact-origin and per-kind job claims from Cloud.ru. Then push the two prebuilt chat-only OCI images to Artifact Registry with digest pinning, create four dormant Jobs, and test 2+2 concurrency. Do not enable `CHAT2_V2_MEDIA_ENABLED` for Web/Mobile until messaging attachment linkage, orphan reconciliation scheduling and cross-client tests pass.


## Cloud.ru capacity and managed database connectivity — 2026-10-28

Provider docs show 10 Container Jobs per **organization**; the authorized project currently has 10 Jobs. Four additional jobs require quota >=14, without removing Feed. Container Apps does not connect to Managed PostgreSQL. The recommended nonproduction solution is a separate VM hosting isolated Core/PG/Redis behind HTTPS (VM operating cost and approval required). A separate verified Core image and hardened staging-only Hono entry have been locally built and tested. No Cloud registry, VM, or Chat2 jobs have been deployed. Full detail in `docs/refactor/CHAT2_CLOUD_DEPLOYMENT.md`.
