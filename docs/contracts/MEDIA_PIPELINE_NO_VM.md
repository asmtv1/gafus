# GAFUS Refactor — единый Media V2 без виртуальных машин

Дата: 2026-10-28. Только рабочая копия `gafus-refactor`, ветка `vite`. Ни production, ни GAFUS Main не менялись.

## Обязательная архитектура

1. Авторизованный пользователь резервирует mediaId и подписанную S3 POST-загрузку через существующий GAFUS Refactor Backend (Hono), без передачи большого оригинала в Hono.
2. Оригинал поступает прямо в соответствующий Cloud.ru S3 bucket, только в `incoming`.
3. Backend проверяет загруженный объект S3 HEAD, сохраняет `QUEUED` в PostgreSQL и сигнализирует BullMQ. PostgreSQL — источник истины; Redis — только сигнал, сбой Redis не теряет задачу.
4. Существующий Cloud.ru Container Job берёт запись по подписанному HMAC + lease, скачивает оригинал из S3, обрабатывает Sharp/FFmpeg и записывает только финальные WebP/MP4 в S3. Два слота фото/видео не должны создавать дубли или переписывать чужие версии.
5. Backend независимо проверяет все результаты, переводит в `READY`, выполняет идемпотентную очистку оригинала. Удаление медиа должно также удалять варианты, переживать каскады удаления и повторяться после ошибок.
6. Получение: авторизованный API проверяет доступ к объекту и публикует CDN URL (если CDN данной категории реально настроен); при CDN 5xx/тайм-ауте клиент запрашивает S3 URL через контролируемый backend либо использует URL финального публичного объекта, ранее разрешённый API. S3 fallback никогда не применяется к неподтверждённым или чужим приватным media keys.
7. Никаких VM, дублирующего медиа-сервера, новых Cloud.ru Container Jobs или отдельных PostgreSQL/Redis. Использовать действующий Refactor Backend с его DB/Redis и существующие Container Jobs.

## Реализация в текущей рабочей копии

| Раздел | Прямой S3 POST / Job / READY | CDN → S3 fallback | Блокирующая приёмка |
| --- | --- | --- | --- |
| Моменты | Feed Media V2 фото/WebP и видео/MP4 в backend + cloud runtime | Web/Mobile фотографии, постеры, MP4 360/720/1080, авторизованные точные ключи и подписанный S3 fallback | Проверить на реальных Refactor Cloud Jobs и signed Beget CDN; production без отдельного разрешения не трогать |
| Фотоальбомы | Gallery Media V2, 2 WebP, PostgreSQL lease, два облачных слота по коду | Реализованная Gallery CDN/S3 fallback с авторизацией | Cloud.ru Gallery V2 два Job, Beget URL и реальное S3-provider E2E ещё не подтверждены |
| Вопросы | Questions Photo Media V2 в **существующем публичном** Cloud.ru бакете `gafus-questions-public`; исходники вне публичного read-префикса, WebP-варианты публичные | Beget `ebiteskukingusk.begetcdn.cloud` → тот же S3; CDN URL основной, public S3 URL fallback, Web Vite/Mobile миниатюры и просмотр | CDN-настройки сохранены и прочитаны обратно; реальный Cloud.ru Job → S3 → CDN GET/HIT ещё не подтверждён |
| Chat 2.0 | Реализованы reserve → signed S3 POST → confirm → PG/BullMQ → Cloud Job → READY → attach; Web/Mobile под флагами `VITE_CHAT2_MEDIA_V2`, `EXPO_PUBLIC_CHAT2_MEDIA_V2` | Готовые публичные варианты: опциональный строго ограниченный `CHAT2_V2_CDN_BASE_URL` или прямой Cloud.ru S3; клиенты используют разрешённый сервером S3 fallback при ошибках CDN | 4 созданных Jobs остаются `CHAT2_JOB_ENABLED=false`, без S3/HMAC секретов. Нужны доступность существующего Refactor API из Cloud.ru, безопасная настройка Job/Worker и реальный E2E. Beget CDN Chat 2.0 создан 2026-10-29, но домен/SSL ещё не готовы, переключение отложено. PDF сохраняет отдельный legacy-путь до собственного рефакторинга |

## Безопасный cutover

- Новые Media V2 флаги Chat 2.0 **не включать**, пока существующий Refactor API с PG/Redis не доступен из Jobs по HTTPS и не проверены HMAC, nonce, выдача заданий, HEAD результатов, очистка, retry, права пользователей и CDN/S3 fallback.
- Действующий `api.gafus.ru`/production PostgreSQL/S3/CDN не модифицировать для тестов.
- Никаких VM и затратных новых ресурсов для «проброса» Core. Удалённая VM `gafus-chat2-refactor-core` была удалена ранее с подтверждением Cloud.ru; VM-only файлы, SSH-ключи и секреты локально удалены. Изолированные новые S3 creds сохранены, не коммитятся.
- Не утверждать «100%» до реального Cloud.ru E2E photo/video + двух площадок Web/Mobile, включая инъекцию CDN 503/504, отсутствие fallback при 403/404, отзыв доступа, удаление и проверку Job executions. Локальные Vitest/tsc/Prisma/S3 smoke не доказывают облачный job-to-Core путь.

## Изоляция нового Cloud.ru Project ID для Chat 2.0

Исправлено в `packages/worker/src/cloudru-media-dispatcher.ts`: Chat2 dispatcher **не использует** глобальные `CLOUDRU_PROJECT_ID`, `CLOUDRU_KEY_ID`, `CLOUDRU_KEY_SECRET` старой организации. Для четырех новых Jobs требуется явный набор `CHAT2_CLOUDRU_PROJECT_VERIFIED=true`, `CHAT2_CLOUDRU_PROJECT_ID=6777bd18-4ee9-4d15-bb1b-134f7a18ed3a`, `CHAT2_CLOUDRU_KEY_ID`, `CHAT2_CLOUDRU_KEY_SECRET`, совместно с готовностью Refactor API/processor и включением Jobs. Подмена на старый Project ID отклоняется до сетевого вызова, тесты проверяют содержимое IAM и запуска. Секреты не пишутся в Git или документацию.

## Проверено 28 октября 2026 (без production)

- Web Vite, Mobile, API, Worker — полные TypeScript `typecheck`, exit 0.
- Обновлённый Feed Server: **19/19** тестов, Web Vite Chat2 direct upload + Moments CDN/S3: **10/10**, Mobile FeedVideo: **3/3**.
- Mobile CdnImage: **6/6** тестов, включая 403/404 запрет и 504 fallback. Старые HLS/устаревшие подписи тестов переведены на единый WebP/MP4 V2; Feed и Gallery S3 presigner + Questions S3 контракты: **6/6**.
- API Chat2/Questions V2 job/route/upload: **27/27**; Chat2/Questions cloud processor: **14/14**; Gallery cloud processor: **26/26**. Все тесты локальные, без реального запуска Cloud.ru Jobs.
- Chat2 new-account S3 guarded synthetic smoke: signed browser POST **HTTP 200**, byte/MIME S3 HEAD verified, test object DELETE + HEAD 404, no orphans or unrelated data touched. **Не заменяет** реальный поток Job → S3 → CDN.
- New organization Chat2 dispatcher unit: **20/20**, включая project/credentials separation and 2+2 scheduling.
- Существующий GAFUS Main, production DB/S3/CDN, Cloud.ru Jobs не изменялись; VM не создавались, Docker images в cloud не перезаписывались.

## Не закрытые release gates

**Это не 100% облачная приёмка.** Нет подтверждённых активных Chat2 Jobs с HMAC/S3 scoped credentials, нет доказанной доступности existing Refactor Backend HTTPS из Cloud.ru Jobs и подтверждённой 2+2 обработки реальных медиа. У Questions и Gallery ещё не подтверждены рабочие реальные V2 Cloud Jobs. У Chat2 CDN не задан и работает только S3 по умолчанию. Questions V2 использует ранее согласованный **публичный** S3 для финальных вариантов, а не приватный бакет; CDN настроен, но реальная выдача созданных Jobs ещё не подтверждена. Все эти проверки выполнить только в разрешённой изолированной Refactor инфраструктуре; не допускать влияния на production и не создавать VM.

## Реальная синтетическая обработка в новой организации Cloud.ru S3 — 28.10.2026

`apps/feed-cloud/src/chat2-new-org-s3-acceptance.mts` успешно обрабатывает реальные тестовые JPEG и MP4 в `gafus-chat2-media-2026`: два WebP, постер и 360p/720p MP4, HEAD и публичное чтение итоговых объектов, запрет анонимного чтения оригиналов, полная очистка. Exit code **0**, `objectsCleanupAttempted=12`, `syntheticPrefixEmpty=true`, два временных каталога удалены. Тест запускает процессор локально, **не** Cloud.ru Jobs. Временный HTTPS туннель к только HMAC-маршруту существующего Hono проверен (посторонний API путь 404, неподписанный claim 401) и выключен. Полный существующий Hono не стартовал из-за `@gafus/webpush` CJS/ESM re-export; подтверждения подписанного облачного claim нет. Четыре Job **не обновлялись и не запускались**. До стабильного изолированного HTTPS Refactor Backend и полного HMAC→READY Cloud Job E2E переключение запрещено.

### CDN → S3 delivery audit (29 October 2026, Refactor only)

- Questions V2: DTO includes `fallbackUrl`/`fallbackSmallUrl`; Web Vite/Mobile switch thumbnail and full-screen rendering to S3 after image failure. On 2026-10-29 the existing Beget Questions CDN was configured and verified by Beget API; for the **Cloud.ru public Questions bucket only**, delivery now defaults to this CDN even if the API launcher omits `.env.local`. An explicit empty `QUESTIONS_V2_CDN_BASE_URL` opts out for rollback; local isolated bucket does not acquire an implicit CDN URL. Real ready-object GET/HIT remains to be tested.
- Gallery and Feed: shared signed fallback helpers exist. Feed Web video UI was switched from stale HLS ticket playback to current progressive MP4 URL + signed CDN HEAD detection + authorized S3 variant fallback. Full end-to-end outage tests on both devices still required; do not claim full pass from code inspection alone.
- Chat 2.0: `CHAT2_V2_CDN_BASE_URL` remains optional; Beget Chat2 CDN resource was provisioned but its technical domain is still CONFIGURING with SSL disabled. Media V2 continues direct S3 until endpoint readiness is verified; CDN-first is not yet enabled.
- No production S3/CDN/Jobs configuration changed during this audit.

#### Vite client follow-up audit

- Main Vite Web client `apps/web-vite`: `QuestionPhotoGallery` now uses the authorized Questions API `fallbackSmallUrl` / `fallbackUrl` on thumbnail/fullscreen image failure, when a valid S3 endpoint is included; only the exact public Questions bucket host is allowed. Vite typecheck PASS; 16 focused Questions/Feed/Gallery tests PASS.
- Initially neither CDN origin was configured. The verified Questions CDN origin has now been written to ignored root `.env.local`; the new Chat2 CDN is staged as a disabled comment until DNS/SSL are working. Runtime env propagation and end-to-end reads still require verification.
- Playwright browser connection returned HTTP 429 and was unavailable for this check; browser-based and device outage checks remain unverified.

#### Beget CDN creation — 2026-10-29 (Safari session, API verified)

- Created exactly one new Beget CDN resource named **GAFUS Chat 2.0 Media**, resource ID `567db39b-6c57-4844-8d3a-8b0c54d7be8b` in the existing shared Beget project. No existing CDN resources were changed.
- HTTPS source: `gafus-chat2-media-2026.s3.cloud.ru`; automatically assigned free Beget domain: `wulipisusuyum.begetcdn.cloud`.
- API confirmed CDN service status `RUNNING`, but the domain initially reported `CONFIGURING`, `ssl_enabled=false` and a HTTPS HEAD failed with `ENOTFOUND` before DNS/certificate issuance. **Do not consider the CDN endpoint live yet.** Do not activate `CHAT2_V2_CDN_BASE_URL` in running Refactor API until HTTPS checks succeed; retain the S3 fallback.
- Beget Questions CDN was already existing: `ebiteskukingusk.begetcdn.cloud` → `gafus-questions-public.s3.cloud.ru`. It is locally configured in ignored `.env.local`.
- GAFUS Refactor Playwright MCP probe consistently returned `HTTP 429`; creation was completed using the already authorized Safari tab and independently verified using Beget API.

#### Chat 2.0 CDN additional settings — 2026-10-29

Verified the new **only** Chat 2.0 resource ID `567db39b-6c57-4844-8d3a-8b0c54d7be8b` against the existing working public S3 Feed V2 CDN. Before editing, the complete original Beget service response (including the provider-managed setting fields) was backed up in ignored mode-0600 `.local-pg-scratch/beget-cdn-rollback/chat2-new-cdn-before-settings.json`, without logging any credentials. Applied provider settings through authenticated Beget API and re-read to verify persisted values:

- Source: **HTTPS** `gafus-chat2-media-2026.s3.cloud.ru`; no origin credential or static request header; no changes to S3 or application production environment.
- Edge cache: `caching_time=86400` (24 h); `follow_origin_redirect=false`, `ignore_cookie=true`, `ignore_query_string=true`.
- Browser: provider built-in `caching_time_browser.enable=false`, custom response `Cache-Control: public, max-age=180, must-revalidate` (avoids provider built-in header override seen in previous Gallery/Feed acceptance).
- `redirect_http_to_https=true`, `allowed_http_methods.enable=true` limited to `GET`, `HEAD`, `OPTIONS`; stale serving disabled to match Feed public V2; provider tokenized signing remains **disabled with its original value unchanged**.
- Response headers: `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, ETag`. S3/edge must independently implement byte-range `206` responses; exposing headers alone does not enable HTTP Range.
- API settings update succeeded and read-back matched; existing four CDN resources were not altered. This public final-media cache policy is for Chat2 media only, **not for chat messages or user access permissions**.
- **Outstanding activation gate:** technical Beget domain `wulipisusuyum.begetcdn.cloud` still `CONFIGURING`, `ssl_enabled=false`, DNS A/AAAA `ENOTFOUND`, HTTPS unavailable at the time of the check. Do not enable `CHAT2_V2_CDN_BASE_URL` until the hostname resolves and HTTPS plus a real authorized final-media GET/HEAD/Range test succeeds. Root `.env.local` holds this setting disabled as a comment. Keep direct public S3 delivery active meanwhile; user chat text access remains unchanged.

#### Questions CDN cutover and provider settings — 2026-10-29

- Existing resource **GAFUS Questions CDN** (`3c2a1623-50a1-46a1-b7a4-bb1093eaedf0`) was **reconfigured in place**; no new CDN was created. Technical delivery hostname `ebiteskukingusk.begetcdn.cloud` status `WORKING`, `ssl_enabled=true`; HTTPS origin `gafus-questions-public.s3.cloud.ru` (existing public bucket). Do not create a private replacement bucket.
- Provider baseline saved before write to ignored mode-0600 `.local-pg-scratch/beget-cdn-rollback/questions-before-settings-20261029.json`, after write to `questions-after-settings-20261029.json`. Provider API returned success and readback matched.
- Updated to existing Feed public S3 V2 profile: edge TTL `86400`, `follow_origin_redirect=false`, `ignore_cookie=true`, `ignore_query_string=true`, `stale=false`, `redirect_http_to_https=true`, methods `GET/HEAD/OPTIONS`; built-in browser cache override disabled, static response `Cache-Control: public, max-age=180, must-revalidate`, `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, ETag`. No signing keys replaced.
- Cloud.ru Questions V2 delivery defaults to this verified CDN hostname when API `QUESTIONS_V2_S3_ENDPOINT=https://s3.cloud.ru` and `QUESTIONS_V2_S3_BUCKET=gafus-questions-public`. An explicit empty `QUESTIONS_V2_CDN_BASE_URL` disables CDN for emergency rollback; validated custom Beget origins override the default. S3 URL is carried in API DTO as a fallback. No changes made to production PostgreSQL, S3, Jobs, API deploy, or the Main repository.
- Public CDN HTTPS to a **nonexistent synthetic key** returned 403 and `x-cdn-edge-cache: MISS` as expected for the bucket's access policy. This verifies TLS/CDN reachability **only**, not actual media. Creating/updating production media to test edge HIT was intentionally avoided. Real confirmed variant GET/HEAD, fresh upload and CDN→S3 outage E2E (both client platforms) remain unverified.
- `packages/cdn-upload` 5/5 tests + build PASS; Web Vite Questions gallery 12/12 tests including thumbnail/fullscreen CDN→S3 failover PASS; TypeScript `@gafus/core`, `@gafus/api`, `@gafus/web-vite`, `@gafus/mobile` PASS.

#### Full read-only Questions CDN verification — 2026-10-29

**Evidence:** on the isolated Refactor Mac, verified the pre-existing *final* Cloud.ru S3 Questions WebP, without creating, editing, deleting, or purging any S3 object. A restricted Refactor service account listed 2 ready variant keys under `questions/uploads/questions/v2/` and issued read-only HEAD/GET. Both Beget `ebiteskukingusk.begetcdn.cloud` and public Cloud.ru S3 returned HTTP 200 `image/webp`, the same 1,366 bytes and **identical SHA-256**. The first CDN GET reported MISS and a repeat reported HIT; a byte-range request returned HTTP 206 with exact `Content-Range: bytes 0-99/1366`. CDN domain `WORKING`, TLS on, Beget service `RUNNING`; all nine expected settings groups persisted in provider API. No production data writes or Cloud Job executions.

**Important header mismatch / NOT full PASS:** actual public S3 object carries `Cache-Control: public, max-age=86400, immutable` and the CDN returns exactly that **instead of** the configured `public, max-age=180, must-revalidate`. Moreover, the CDN edge did **not** return the configured `X-Content-Type-Options`, `Access-Control-Allow-Origin` or `Access-Control-Expose-Headers` on the tested existing object. Although Beget settings readback shows these static headers enabled, they are **not proven applied at the edge**. Resolve header precedence/propagation with Beget and retest before claiming browser cache/deletion behavior or CORS complete. Do not mutate production S3 object metadata to conceal this defect.

**Actual client/backend:** isolated local Hono on `127.0.0.1:3001` was restarted to pick up the Questions CDN-first default with Cloud.ru public bucket and S3 fallback; it returned authenticated API HTTP 200 after a read-only synthetic-user browser login at `127.0.0.1:5173/questions`. The test account's question list was empty, so there was **no real question attachment URL rendered and tested end-to-end**. Chrome had zero JS page errors during the test. Playwright MCP remained unavailable with HTTP 429; local Chrome/Puppeteer was used for this read-only browser smoke.

**Static verification:** TypeScript typechecks passed for Types, Core, API, Web Vite and Mobile. Questions Web Vite suite **252/252**, Mobile suite **96/96**, Questions API Media V2 selected tests **11/11**, CDN-upload Questions contract **5/5**: **364/364** tested cases passed. Synthetic thumbnail/fullscreen CDN→S3 UI failure case passed; real forced CDN 5xx and native-device outage were not run.

**Existing Cloud Job read-only state:** Cloud.ru `gafus-questions-photo` reported `ready`, one container, 1 vCPU/2048Mi. Its image, resources and environment differ from the saved 2026-10-28 rollback snapshot, so the old strict `QUESTIONS_JOB_CONFIG_CHANGED` check fails; this does not itself mean the current Job failed. The exact current configuration must be re-baselined before a future controlled Job update. No Cloud Job was changed or invoked by this audit.

**Beget inventory drift:** provider currently reports three resources: Gallery production v2, Questions CDN and Feed public Cloud.ru S3 v2. The earlier Chat 2.0 CDN (`567db39b-6c57-4844-8d3a-8b0c54d7be8b`) and legacy Feed production CDN (`becd9e5d-4fa8-47da-878c-9b80ded74e71`) now return HTTP 404 by ID, and no longer appear in the list. Their removal was **not performed in this audit**; do not assume Chat2 CDN-first is still active or recreate deleted provider resources automatically.

#### Chat 2.0 CDN restored after accidental deletion — 2026-10-29

- Owner confirmed the previous Chat 2.0 Beget CDN was deleted accidentally and explicitly requested recreation. Beget API verified absence of its prior resource ID `567db39b-6c57-4844-8d3a-8b0c54d7be8b` and absence of any resource with origin `gafus-chat2-media-2026.s3.cloud.ru` before creating a replacement.
- Created exactly one new resource through the owner's already-authorized **Safari** session: **GAFUS Chat 2.0 Media**, ID `6a7349a8-c724-4001-a433-f39a8faa706c`, in the existing Beget Shared Project `e0f40584-71ee-4ad5-aef6-d5af89659c69`. HTTPS origin `gafus-chat2-media-2026.s3.cloud.ru`; Beget-assigned technical domain `gonomudedoje.begetcdn.cloud`. The remaining Gallery, Questions, and Feed V2 CDN resources were not changed.
- Saved complete mode-0600 pre-configuration backup to ignored `.local-pg-scratch/beget-cdn-rollback/chat2-recreated-before-settings-20261029.json`, and post-configuration backup to `chat2-recreated-after-settings-20261029.json`. Applied only the nine reviewed public final-media settings groups from the previous successful Chat2 CDN snapshot, preserving provider-managed fields on the new resource. Beget API confirmed **9/9 MATCH** against the old configuration: cache TTL 86400, browser cache override disabled, static `Cache-Control: public, max-age=180, must-revalidate`, `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *`, exposed byte-range headers; `GET/HEAD/OPTIONS` enabled, HTTPS redirect enabled, stale disabled, ignore cookies and query strings enabled. This does not prove header presence at the CDN edge (previous Questions CDN live header mismatch is documented above).
- Immediately after recreation service status was `RUNNING`, while delivery domain status was `CONFIGURING`, `ssl_enabled=false`, and DNS and HTTPS returned `ENOTFOUND`. Therefore no automatic activation in the running Refactor Backend. Ignored root `.env.local` now stages the **new** hostname in a disabled comment; the deleted predecessor hostname was replaced. `CHAT2_V2_CDN_BASE_URL` remains unset, so existing Chat2 public final-media S3 delivery remains active until the new domain passes DNS + valid TLS and live authorized WebP/MP4 GET, HEAD, and range tests.
- Playwright MCP still returned HTTP 429 before accessing browser tabs. No Cloud.ru Jobs, production database, production S3, production app, or Main files were changed.

#### Local Hono CDN-first activation audit — 2026-10-29

- Configured the four known existing Beget HTTPS origins in the **ignored** root `.env.local`: Questions `ebiteskukingusk.begetcdn.cloud`, Chat2 `gonomudedoje.begetcdn.cloud`, Feed V2 `quepraquiecebquomiel.begetcdn.cloud`, Gallery `mepsuduyokabib.begetcdn.cloud`. No credentials or private object keys were changed.
- The existing isolated local Hono launcher `.local-pg-scratch/cloudru/questions-v2-live-20261028/local-question-hono.mts` now strictly validates all four non-secret origins against these exact expected values and passes them into its `process.env` before importing the existing Hono API. The local Hono was restarted and returned HTTP 401 for unauthenticated Questions API (expected auth requirement); Web Vite on :5173 returned HTTP 200.
- **Actually enabled CDN-first on this local Hono:** **Questions V2** (Cloud.ru public bucket with fallback public S3) and **Chat2 Media V2** (now-valid SSL Beget CDN with API-supplied direct public S3 fallback). Chat2 browser GET of an actual final media file remains unverified, so this does not assert a full end-to-end CDN pipeline.
- **Feed V2 and Gallery are NOT fully activated on this isolated Hono:** original launch profile explicitly has `FEED_ENABLED=false` and `GALLERY_ENABLED=false` and has no verified scoped S3/provider secrets or safe upload path for those modules. Their CDN origins are staged as configuration only. The Feed V2 Beget CDN is `WORKING` but the older Feed Storage signer/monitor still expects the retired `garaquachegasourn.begetcdn.cloud` and a token; the Feed V2 CDN at `quepraquiecebquomiel.begetcdn.cloud` has tokenized signing disabled. Enabling the old signer without a compatible refactor would fail. Gallery CDN `mepsuduyokabib.begetcdn.cloud` returned HTTP 410 for the diagnostic path and the source is a legacy Container Apps origin; blindly enabling it would not establish working CDN-first. Do not flip the two production-S3-capable flags or silently write production data.
- Focused checks: `@gafus/api` Chat2/Questions media tests **10/10**, Questions CDN package tests **5/5**, Vite Chat2 attachments/Questions gallery **16/16**, API and Mobile TypeScript **PASS**. Playwright MCP was unavailable earlier (HTTP 429); this activation did not claim browser E2E.
- **Follow-up required for 'all four' PASS:** verify safe isolated Feed/Gallery read + upload configurations and reconcile Feed V2's current Beget unsigned public delivery with the old signed-only Feed code; repair Gallery's 410 origin before enabling its read path, then do Web/Mobile real-media CDN outage testing.
