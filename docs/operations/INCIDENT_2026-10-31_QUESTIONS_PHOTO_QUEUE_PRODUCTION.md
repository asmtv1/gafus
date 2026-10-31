# Production Questions Photo V2: queued photo, zero processing attempts (2026-10-31)

## Production evidence (AI Commander `gafus.ru`, read-only)

- User screenshot: `/questions/cmvwbaldi000dot01n5jgmpuk`, title «тестовый», pending UI «Обрабатываем фото…».
- Production Docker: `gafus-api` and `gafus-worker` up/healthy, which does **not** prove Questions queue operation.
- Production PostgreSQL *SELECT only*, joining `Question`, `QuestionPhoto`, `QuestionV2MediaTask`:
  `cmvwbaldi000dot01n5jgmpuk | тестовый | QUEUED | attempts=0 | no errorCode | createdAt=2026-10-31 11:22:22.103 UTC`.
  One older «тестовый» question task was `EXPIRED`, error `PHOTO_REMOVED`; it is unrelated. No INSERT/UPDATE/DELETE were executed.
- Production Worker logs show repeating `QUESTIONS_V2_RECOVERY_UNSAFE_ORIGIN` in the `cron-scheduler` context roughly every minute. The exception occurs at `packages/worker/src/questions-photo-recovery.ts` *before* the query for pending tasks and Cloud dispatch because `createQuestionsPhotoRecoveryTick` executes `await cleanup()` first.
- Production Worker environment read-only (`printenv` on **names without secrets**): `NODE_ENV=production`, `QUESTIONS_V2_MEDIA_ENABLED=true`, `QUESTIONS_V2_PROCESSOR_READY=true`, `QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED=true`, `QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED=true`, `CLOUDRU_MEDIA_JOBS_ENABLED=true`, `QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED=true`, `QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME=api.gafus.ru`, `GAFUS_LOCAL_ISOLATED_API` unset, `QUESTIONS_V2_INTERNAL_BASE_URL` host `api.gafus.ru`, HMAC present with at least 32 bytes (value never printed).
- Production workflow config explicitly sets `QUESTIONS_V2_INTERNAL_BASE_URL=https://api.gafus.ru/` and the exact hostname while the recovery code **blanket-rejected** `api.gafus.ru` and any `*.gafus.ru`. This is an internally inconsistent release contract and a confirmed cause of the cron-recovery failure. The Redis immediate-wakeup path can be investigated separately, but the observed task had 0 attempts. A read-only unauthenticated `GET https://api.gafus.ru/internal/questions/media/jobs/cleanup` responded `405` in about 0.13s, confirming the production API route is present, not proving authenticated POST/job execution.

## Refactor code fix

- Worker now permits an **exact** `https://api.gafus.ru/` only in `NODE_ENV=production`, with `QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED=true`, `QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME=api.gafus.ru`, `GAFUS_LOCAL_ISOLATED_API != 1`, no nondefault port, URL credentials, query, fragment or path. Existing signed HMAC, nonce, 15s timeout and body restrictions remain unchanged.
- Other GAFUS production/staging subdomains remain denied, as do HTTP and custom ports. Dev isolation is unchanged; loopback 3001 remains permitted only with the explicit local isolation flag.
- Tests: `pnpm --filter @gafus/worker exec vitest run src/questions-photo-recovery.test.ts --maxWorkers=1` PASS 8/8, including exact production host and rejection of similar-looking hosts; `pnpm --filter @gafus/worker typecheck` PASS.

## Required production verification / release boundary

**The fix is only in Refactor; it has not been deployed. Production incident is still OPEN.** Existing project isolation instructions prohibit a production Worker/application deployment or changes to production PostgreSQL/S3/CDN/API without a separate deployment authorization. The single existing `gafus-questions-photo` Cloud Job is *not* one of the four separately authorized Feed Media V2 Jobs and was not modified, executed or read as part of this task.

After separately authorized release of a compatible Worker image, verify by read-only checks:

1. `QUESTIONS_V2_RECOVERY_UNSAFE_ORIGIN` no longer repeats in the new Worker logs.
2. The existing `cmvwbaldi000dot01n5jgmpuk` photo transitions `QUEUED/attempts=0` -> `PROCESSING` -> `READY`, or reaches an explicit `FAILED` with an actionable error. Do not artificially mutate its status in PostgreSQL.
3. Open that question as an authorized user, confirm its actual WebP thumbnail and viewer are displayed, and confirm no permanent «Обрабатываем фото…» state. Mobile should render the same READY state.
4. If Worker passes the origin guard but Cloud dispatch fails, capture the exact read-only error/lease and stop before touching the Questions Job or production media resources. Preserve prior Worker image digest/configuration for any independently authorized release rollback.

Do not infer successful processing from unit tests or from the healthy status of API/Worker containers.

## Additional pre-release check: Cloud.ru S3 / Beget CDN delivery (2026-10-31)

A second **independent** blocker was found in `apps/feed-cloud/src/questions-v2-job-core.ts`: the bundled one-shot Cloud Job client itself denied `api.gafus.ru`, which is the exact URL pinned by production Cloud Job activation. The fix allows it only when `QUESTIONS_V2_JOB_ENABLED=true`, the explicit internal host verification is on, hostname is exactly `api.gafus.ru`, URL is HTTPS root with no explicit port, and local-isolated flag is off. The Docker Job image does **not** define `NODE_ENV`; the new check deliberately uses the Job enablement gate instead. HMAC, timeout, response limits and nonce signing remain intact. The Cloud Job bundle and its focused unit tests pass.

A read-only S3 listing using the existing production API S3 access identified an already-existing QA WebP object under the public `questions/uploads/questions/v2/.../v1/image/` prefix; **no new object was uploaded or created**. Both variants were downloaded from the public S3 alias and the actual Beget CDN hostname and compared in memory:

| Variant | Direct public Cloud.ru S3 | Beget CDN | Result |
|---|---|---|---|
| `s.webp` | HTTP 200, `image/webp`, 412 bytes | HTTP 200, `image/webp`, 412 bytes | SHA-256 equal; valid RIFF/WEBP |
| `m.webp` | HTTP 200, `image/webp`, 1,366 bytes | HTTP 200, `image/webp`, 1,366 bytes | SHA-256 equal; valid RIFF/WEBP |

A nonexisting V2 public variant returned 404 from **both** providers; a nonexisting source under `questions/v2/.../incoming/` returned S3 403. On CDN 404, CORS response included `Access-Control-Allow-Origin: *`; S3 returned an allow-origin for `https://gafus.ru`. These prove public routing / privacy classification and successful real CDN object delivery, **not** that the current user's stuck object has been processed. Existing `QUEUED` photo must still become READY.

The original Web/Mobile thumbnail/image `onError` switched to S3 **for any failure**, including 403 and 404, contrary to the CDN-first security rule. Both now perform a bounded, no-credentials cross-origin CDN `HEAD` on the *actual failed public WebP variant*, validate exact S3 key equivalence, and switch to public S3 only on HTTP 410/5xx; 403/404/opaque CORS/network/timeout failures cannot bypass CDN. Read tests for these statuses pass in Web and Mobile; Web mounted gallery tests pass, and both TypeScript checks pass. No S3 credentials are shipped to either client.

**Single release requirement:** a new immutable `gafus-questions-worker` Cloud Job image **must be built from the revised `apps/feed-cloud/src/questions-v2-job-core.ts`, pushed, and its new verified registry digest reflected in `infra/cloudru/production-job-release.mjs`** before the one permitted production cutover. Merely releasing Web+Worker against the existing pinned Questions image will leave the Cloud Job Core origin rejection in place. Do not guess the digest or silently reuse the previous image. Include the updated Web bundle, Worker bundle, Cloud Job image, and Mobile binary as applicable in the same coordinated acceptance; Mobile app release remains separate from Web. Verify production user photo reaches READY and both real generated `s.webp`/`m.webp` URLs return HTTP 200 through S3 and CDN (plus CORS/browser image rendering) before closing incident. No production deploy or Cloud Job mutation was performed in this preflight.

**Final read-only HEAD/CORS check:** both providers returned 200 / `image/webp` for the existing `s.webp`. Direct S3: `Content-Length: 412`, `Access-Control-Allow-Origin: https://gafus.ru`, `Access-Control-Allow-Methods: GET,HEAD,POST`, `Cache-Control: public, max-age=86400, immutable`. Beget CDN: `Content-Length: 412`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=180, must-revalidate`. This confirms the client's status-probe HEAD is CORS-readable for this existing object. The observed CDN response cache TTL is 180s (separate from any internal CDN TTL configuration); no cache settings changed. Dedicated regression checks: Web Questions read/gallery/fallback 35 PASS, Mobile fallback 12 PASS, Cloud Job Core/runner/S3 objects 11 PASS, cdn-upload public URL and S3 tests 5 PASS, Worker recovery 8 PASS: **71/71 PASS**. Web, Mobile, Cloud runtime and Worker typechecks PASS; Web build and Questions Job bundle PASS; `git diff --check` PASS. An independently authorized production release and readback of this user's new photo remain outstanding.
