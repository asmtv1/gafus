# GAFUS Refactor — Questions Photo Media V2

Дата: 2026-10-28. Статус: реализация в коде и локальные unit/component-тесты; развертывание двух Cloud Jobs и полная E2E-приёмка пока НЕ подтверждены.

## Изоляция

Работа только в /Users/asmtv1/Desktop/gafus-refactor (ветка vite). Production GAFUS Main, production-ресурсы, действующие Feed Jobs и новый аккаунт Chat 2.0 не затрагивались.

АКТУАЛЬНОЕ РЕШЕНИЕ 28.10: использовать только существующий публичный Cloud.ru bucket `gafus-questions-public`. Оригинал — `questions/v2/<owner>/<media>/incoming/` (вне публичной политики), WebP — `questions/uploads/questions/v2/<owner>/<media>/v1/image/[sm].webp` (внутри прежней политики). Для Cloud использовать `QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED=true`, публичные URL `https://gafus-questions-public.s3.cloud.ru/`. Старый приватный план отменён; никаких дополнительных bucket и Job не создавать.

## Аудит: до и после

| Операция | До | V2 |
| --- | --- | --- |
| Загрузка | Backend POST multipart, uploadBufferToCDN | резервирование + прямой S3 signed POST |
| MIME | file-type после приёма bytes API | заголовки S3 + фактический формат в Sharp |
| Оригинал | сохранялся целиком | один ограниченный S3 GET, удаление после READY |
| Конвертация | отдельного Questions Sharp Job не было | Sharp, autoorient, WebP |
| Размеры | исходный файл | два варианта по максимальной ширине 360/720 px |
| Очень маленькое фото | исходник | единственный WebP, без upscaling и дублирования |
| Готовность | URL из CDN upload | два проверенных S3 HEAD и транзакционный READY |
| Очередь | синхронный API upload | PostgreSQL lease/retry + BullMQ wakeups |
| Cleanup | непосредственный delete или обработка старых orphan | durable SOURCE/ALL cleanup с повторами |
| Web/Mobile | один URL, иногда «фото недоступно» | малый/основной, статус pending, retry, signed GET |
| Старый загрузчик | POST /photos | HTTP 410, больше не обрабатывает тело фото |

Поддержаны JPEG, PNG, статический WebP до 10 MiB, не более 50 млн пикселей. HEIC/HEIF не активирован без проверки парсера и клиентов. Нет FFmpeg, HLS, MP4, видеопостеров или видеочасти Jobs.

## Data flow и контракты

1. Клиент отправляет mime и bytes в POST /api/v1/questions/photos/reservations.
2. Backend проверяет auth/лимит, сохраняет QuestionPhoto и QuestionV2MediaTask в одной транзакции со статусом AWAITING_UPLOAD; выдаёт подписанный S3 POST и mediaId.
3. Клиент отправляет фото непосредственно в отдельный S3 по подписанной форме. Backend больших файлов не принимает.
4. POST /api/v1/questions/photos/:id/confirm проверяет S3 HEAD (точный исходный размер/MIME) и переводит task в QUEUED. Неудача Redis не уничтожает PG task.
5. BullMQ несёт только mediaId; два контейнера через HMAC internal API получают независимые PG claims.
6. Worker выполняет один ограниченный потоковый S3 GET, проверяет формат Sharp, ориентацию, страницы и input pixel limit, создаёт два WebP (для маленького один) с фактической шириной/высотой. Sharp concurrency=1, cache(false). clone не является доказательством одного физического декодирования.
7. Каждая созданная версия отправляется отдельным S3 PUT с Content-MD5, без копирования между бакетами. Backend независимо проверяет существование/размер/MIME обоих результатов S3 HEAD до READY.
8. READY и URL-маркер QuestionPhoto фиксируются в одной транзакции, после чего удаляется исходник (idempotent DELETE).
9. Из-за 10-минутного окна повторного signed POST после READY обязательно выполняется дополнительный SOURCE DELETE после срока подписи; это осознанная защита от оставшихся оригиналов.
10. Авторизованный читатель получает короткоживущие подписанные URL small/medium из Question detail либо GET /api/v1/questions/photos/:id/status (последний только собственнику). Списки не скачивают original.
11. Удаление/замена/FAILED/EXPIRED создают durable ALL cleanup; при S3 ошибках сохраняются cleanupAttempts и cleanupNextAt с backoff.

Путь S3, вычисляемый на сервере:
- questions/v2/{ownerId}/{mediaId}/incoming/source.{jpg|png|webp}
- questions/v2/{ownerId}/{mediaId}/v1/image/s.webp
- questions/v2/{ownerId}/{mediaId}/v1/image/m.webp

Привязка к вопросу/ответу хранится в QuestionPhoto через questionId/answerId. До создания вопроса нельзя достоверно включить questionId в source key. Клиент не передаёт доверенный S3 key.

Типобезопасный контракт и проверка манифеста: packages/feed-cloud/src/questions-v2.ts. Worker: apps/feed-cloud/src/questions-v2-processor.ts, questions-v2-s3-objects.ts, questions-v2-job-runner.ts, questions-v2-job-entry.ts. S3-обёртка и подписанный POST/GET/DELETE: packages/cdn-upload/src/questionsV2Media.ts.

## PostgreSQL, конкуренция и удаление

Миграция packages/prisma/migrations/20261028134000_questions_photo_v2/migration.sql добавляет отдельную QuestionV2MediaTask со всеми status, attempts, nextAttemptAt, attemptToken, leaseUntil, manifest, errorCode, cleanupKind, cleanupAttempts, cleanupNextAt, cleanupToken, cleanupLeaseUntil, cleanupCompletedAt. Миграция АДДИТИВНАЯ, старые QuestionPhoto не очищает. В рамках этой сессии она не применялась к тестовой БД; на production применять запрещено.

AWAITING_UPLOAD → QUEUED → PROCESSING → READY. Временный сбой: PROCESSING → QUEUED; после 4 попыток FAILED; неподтвержденный POST EXPIRED. Atomic SELECT FOR UPDATE SKIP LOCKED в PostgreSQL, сравнения lease только в UTC: NOW() AT TIME ZONE 'UTC'. CAS проверяет попытку перед renew/complete/fail. Потеря ответа об успешном complete не вызывает fail поверх потенциально опубликованного READY.

Утраченный BullMQ trigger восстанавливается по due-записям PostgreSQL (cron раз в минуту), не вызывает пустые Cloud Jobs. Internal /internal/questions/media/jobs/{claim,renew,complete,fail,cleanup} защищён HMAC SHA-256, timestamp, nonce/replay guard в Redis. Redis outage может временно остановить запуск, но не удаляет PG task. Один Job работает с одним mediaId, параллельно допускаются два независимых Job.

Обрабатываются soft-delete вопросов и ответов, замена фото при редактировании, DELETE непривязанного upload, hard-delete QuestionPhoto и отложенное удаление после signed POST/lease. Отдельный cleanup row остаётся жив даже после физического удаления QuestionPhoto, без FK в сторону удаляемого фото. Все S3 deletes идемпотентны. Старые фото сохраняются читаемыми и удаляемыми без восстановления старого upload.

## Cloud.ru Image-only Jobs

Один существующий Cloud Job `gafus-questions-photo` с двумя параллельными executions (лимит 10 Jobs). Каждый 1 vCPU / 2 GiB RAM, timeout 240 секунд; приложение прерывает работу через 225 секунд и поддерживает heartbeat. Dockerfile apps/feed-cloud/Dockerfile.questions-photo, сборка pnpm --filter @gafus/feed-cloud-runtime build:questions-photo-job. Образ Node+Sharp+S3, без FFmpeg. Имя и Docker-образ подготовлены в коде; реальные Container Jobs в облаке не создавались и квоты не занимались.

Ключевые флаги: QUESTIONS_V2_MEDIA_ENABLED, QUESTIONS_V2_PROCESSOR_READY, QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED, QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED, QUESTIONS_V2_JOB_ENABLED, CLOUDRU_MEDIA_JOBS_ENABLED. Для внутреннего HTTPS API требуется также QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED=true и QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME с точным именем отдельного Refactor API. Известные production GAFUS API домены отвергаются. Локальный API разрешён только при GAFUS_LOCAL_ISOLATED_API=1 на loopback:3001. Настройки S3: QUESTIONS_V2_S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY. Внутренний HMAC: QUESTIONS_V2_INTERNAL_BASE_URL, QUESTIONS_V2_INTERNAL_HMAC_SECRET. Секреты в код и документацию не записываются.

## Web/Mobile

Web Vite: немедленное локальное превью, процент прямого upload, статус обработки, PhotoGallery lazy-load, small WebP в превью, medium в full-screen, srcset/sizes с реальными width, retry, отсутствие broken URL при pending/failed. Для pending фото — ограниченный polling при видимости; подписанные URL не кешируются в React Query. Дополнительный Refactor Web клиент переведён на direct S3 API.

Mobile: исходные JPEG/PNG/WebP отправляются без повторного клиентского сжатия, только HEIC/HEIF явно преобразуется в JPEG; direct S3 POST, прогресс загрузки, локальный URI превью, cachePolicy=disk для GET, pending placeholder, обновление детали до READY, кнопка retry с повторным запросом авторизованной ссылки и удаление только после ACK. Все business rules вопросов/ответов, гафусов, жалоб, модерации и уведомлений остаются в Core.

## Проверки (фактически выполненные)

- TypeScript: API, Core, Worker, Mobile, Web Vite, Questions Server, Feed Cloud Runtime — PASS в выполненных адресных прогонах.
- Image-only Job bundling — PASS; FFmpeg в image-only Dockerfile отсутствует.
- Адресные ESLint Web Vite и Mobile — PASS без предупреждений после исправления оформления и Tracer catch. Финальный повторный typecheck API/Web Vite/Mobile и 26 Web Vite + 5 Mobile фото-тестов — PASS.
- Sharp unit: JPEG/PNG input, вертикальное 800×1280 → 360×576 и 720×1152, auto-orientation EXIF (orientation=6), удаление GPS/EXIF, маленький без duplicate PUT, повреждённое изображение и несовпадение MIME — PASS.
- Контракт S3 key + signed multipart POST: synthetic, без сетевых вызовов — PASS.
- Runner: два одновременных process разных mediaId, один GET и два PUT на фото, отсутствие пустого Job, потерянный ACK — PASS на mock S3/Core.
- Queue: atomic claim SQL, duplicate trigger, проверка двух результатов до READY и блокировка при неверном HEAD — PASS на mock БД. **Реальная изолированная PostgreSQL:** миграция успешно применена к временной локальной базе, два параллельных psql соединения получили разные mediaId через SKIP LOCKED (с разными часовыми поясами). Дополнительный real-Prisma smoke (scripts/refactor/questions-photo-pg-isolated.py) успешно проверил два claims, CAS lease, READY+cleanup outbox, retry, stale token, hard-delete QuestionPhoto при сохранении outbox и безопасный финальный ALL cleanup source/small/medium после моделируемого истечения подписанного POST. База остановлена и тестовые данные удалены; постоянную dev PG не меняли.
- Web Vite PhotoPicker/PhotoGallery/PhotoRead: 26 тестов — PASS; Core photo cancellation: 5 PASS; Questions Server HTTP: 6 PASS. Отдельно проверена невозможность повторного присоединения EXPIRED/FAILED фото и восстановление недоступной фотографии Mobile через retry.
- Next/Refactor Web total typecheck не пройден: несвязанные с Questions ошибки в старых .next-* type validators и существующих модулях Feed playback. Это не считать PASS.

**Синтетический offline-бенчмарк (не latency реального Cloud.ru/Web/Mobile):** скрипт apps/feed-cloud/scripts/bench-questions-photo.mts, JPEG 800×1280 со сгенерированным градиентом, 374059 байт → WebP 360×576 (31476 байт) + 720×1152 (162174 байта), суммарно 193650 байт. В одном прогоне Sharp+mock S3 заняли ~104.6 мс, CPU-процесс ~131.6 мс; RSS-снимки 90.0→101.3 MiB (это не пик RAM), 1 mock GET и 2 mock PUT, сетевых HTTP-запросов было 0. Нельзя использовать эти результаты как доказательство production-ускорения; требуется реальный benchmark до/после на типичных фото и устройствах.

НЕ выполнено: миграция постоянной dev PostgreSQL и полный end-to-end PG/Redis/S3 (выполнена только отдельная временная PG smoke), реальный S3 GET/PUT/HEAD/DELETE, CORS/ACL реального бакета, два Cloud Jobs, полные 5 конкурирующих uploads с внешними сбоями, Playwright E2E, устройства Android/iOS, цифры p50/p95 latency/RAM/CPU и полная проверка бизнес-паритета. Ускорение не заявляется без замеров.

## Следующие обязательные шаги приёмки

1. Подтвердить отдельную тестовую PostgreSQL, Redis, приватный Questions S3 и его CORS; production не использовать.
2. Изолированный real-PG smoke миграции, параллельных claims, lease и READY — выполнен. До общей приёмки необходимо развернуть постоянную dev PG/Redis и проверить именно сбои/перезапуски Redis, истечение lease и восстановление реальных долгих Jobs.
3. Создать в разрешённом тестовом Cloud.ru два одинаковых 1 vCPU/2 GiB Questions Photo Jobs на отдельной квоте, не занимая Feed/Chat.
4. Прогнать S3-интеграцию на синтетических JPEG/PNG/WebP с EXIF/GPS, повреждённых файлах, повторных подтверждениях, отказах, retry, удалении/замене, replay signed POST.
5. Пройти реальные Web E2E и Mobile на устройствах. Сохранить функциональность ответов, модерации, лучших ответов, жалоб, гафусов и уведомлений.
6. Зафиксировать baseline/after: upload POST, ожидание очереди, Sharp, S3 GET/PUT/HEAD/DELETE, READY, объём файлов, HTTP request count, пик RAM, CPU, p95 времени показа. После приёмки включать только Refactor.


## Дополнительная локальная приёмка, 2026-10-28

- Реальный loopback HTTP (127.0.0.1:9500) с AWS SDK и Sharp: `apps/feed-cloud/src/questions-v2-loopback-s3.test.ts`. Проверены presigned multipart POST (реальные байты), HEAD оригинала, один GET, два immutable WebP PUT с MD5/ETag, presigned GET, три DELETE. Один файл и пять одновременных файлов с независимыми ownerId: **PASS** (3 integration tests, including signed-policy negative cases). Сервис поднимается и останавливается самим тестом; имя бакета и доступ тестовые. Сервис лишь имитирует часть S3 API: проверяет POST-policy HMAC SigV4 локально на synthetic keys, но **не** Cloud.ru CORS, ACL или фактическую доступность внешнего S3.
- `scripts/refactor/questions-photo-pg-isolated.py` расширен: вместе с временной PostgreSQL поднимает **собственный** Redis только на 127.0.0.1:35440, без AOF/RDB, с данными и логами строго внутри `.refactor-acceptance`. Скрипт `apps/api/src/test/questions-photo-pg-redis-isolated.acceptance.mts` проверяет пять уникальных уведомлений (параллельные дубликаты объединены BullMQ), затем останавливает Redis, подтверждает сохранение пяти `QUEUED` строк в настоящей PG, повторно поднимает пустой Redis и восстанавливает все пять через PG scan → BullMQ Worker (concurrency=2) → реальный Prisma `claimOne`/`complete` с mock HEAD/S3 delete: **PASS**. Это не тест Cloud Job API и не гарантия настроек Cloud.ru.
- `apps/feed-cloud/src/questions-v2-job-core.ts` и `packages/worker/src/questions-photo-recovery.ts`: блокировка `*.gafus.app` дополнительно к `*.gafus.ru` даже при ошибочно выставленном verify-флаге. Unit-тесты транспорта и recovery: **PASS**.
- Перед каждой новой стадией запуска проверяются Git root=`/Users/asmtv1/Desktop/gafus-refactor`, ветка `vite`; доступ к GAFUS Main и production исключён. Во время тестов Redis и PostgreSQL находятся только в loopback и удаляются после завершения.

**По-прежнему не выполнено:** Cloud.ru Questions-only приватный бакет/реальные подписи и CORS, два выделенных Cloud Container Jobs и гарантии их максимальной параллельности, реальные сбои внешнего S3, Playwright Web E2E, Android/iOS устройства, измерения p50/p95 в облаке. Ни одна readiness-переменная для облака не включалась.

**Финальная повторная проверка после добавления интеграции:** exit 0 для typecheck `@gafus/feed-cloud-runtime`, `@gafus/api`, `@gafus/worker`; `build:questions-photo-job` (image-only bundle), 17/17 выбранных фото-тестов Feed Cloud, 5/5 Worker recovery тестов. Отдельный повтор `scripts/refactor/questions-photo-pg-isolated.py` — exit 0, все PG + Redis outage проверки PASS, локальные службы остановлены, тестовые файлы удалены. Эти локальные результаты не заменяют облачную/устройственную приёмку.

## Questions Photo V2: concurrency and confirmation, 2026-10-28

- Added an atomic PostgreSQL Questions-only advisory transaction lock around `claimOne`'s active-lease count and SKIP LOCKED selection. No more than **two unexpired PROCESSING leases** are allowed across multiple API instances. This limits *actual photo processing leases*, not Cloud.ru's count of Container Job executions. The fixed advisory key is only used by Questions V2; Feed/Chat are unchanged.
- The isolated real-Prisma test starts five concurrent claims; exactly two acquire leases, and a third can claim once one finishes (`REAL_PRISMA_MAX_TWO_ACTIVE_PHOTO_LEASES=PASS`). Separate PostgreSQL smoke rows are removed before the Redis-restart test to avoid artificial slot starvation.
- The Redis-outage acceptance test now handles empty claims when both slots are occupied. A recurring bounded scan reissues due notifications from durable PG, and all five uploads reach READY after Redis is restarted (`REAL_REDIS_RESTART_PG_RECOVERY_FIVE_READY=PASS`). Test PG, Redis, and socket files are stopped and removed.
- `confirmQuestionsPhoto` now handles the losing compare-and-set with one bounded re-read rather than unbounded recursion. A concurrent discard yields HTTP 409; an already QUEUED result is idempotent. Six dedicated API tests cover S3 size/MIME mismatch, HEAD outage, Redis outage, duplicate confirm, and two compare-and-set races.
- The isolated HTTP S3 simulator now validates the synthetic HMAC SigV4 **multipart POST policy**, catches tampered keys, MIME, success status, signatures, and unsigned GET, and preserves the five concurrent photo test. S3 `content-length-range` applies to the **entire multipart body**, not exact object size; Core HEAD validation remains mandatory. This simulator is not a substitute for Cloud.ru ACL/CORS, signed GET/PUT verification, or external network tests.

**Cloud.ru scheduling warning:** Cloud.ru documents a maximum of five simultaneous executions **per Container Job**, so two job definitions alone are not a strict two-execution quota. The durable PG guard limits active photos to two, but unwanted empty Cloud executions can still be launched by duplicate wakeups/recovery. A verified execution-level limiter and separate Questions-only Cloud environment are prerequisites before enabling any readiness flag. Default Cloud.ru Container Jobs organization quota is ten Jobs and may require increase before the Questions pool can be provisioned. References: https://cloud.ru/docs/container-apps-evolution/ug/topics/guides__job-run and https://cloud.ru/docs/container-apps-evolution/ug/topics/overview__limitations . No Questions Cloud Jobs were created, run or deployed in this work.

**Worker dispatch improvement:** `questions-photo-trigger-worker.ts` and `questions-photo-recovery.ts` consult the active PostgreSQL lease count before requesting Cloud execution; with two occupied leases they skip the request, and with one occupied lease cron requests at most one. This prevents obvious empty executions but is NOT a distributed execution mutex, because multiple Worker instances may read the same count before issuing Cloud requests. The PostgreSQL claim transaction remains the authoritative two-photo cap. Dedicated immediate-wakeup and cron tests cover these branches (13/13 PASS).

**Final repeat after the lease-cap and worker preflight changes:** dedicated command job `cc9b7c95982406e78a8816ad6951542124a0f32f405e5d0f` exited with code 0, not timed out. API, Worker, Feed Cloud Runtime TypeScript checks and dedicated Questions Photo Job bundle PASS; photo runtime tests 18/18, API tests 32/32, Worker tests 13/13; the isolated real PostgreSQL+Redis smoke PASS, including two concurrent leases, five uploads recovered after a Redis outage, and cleanup of its own temporary services.

## Questions Photo V2 - real linux/amd64 container preflight (2026-10-28)

- Built the Dockerfile from the **Refactor** root: `docker buildx build --platform linux/amd64 -f apps/feed-cloud/Dockerfile.questions-photo -t gafus-questions-photo:preflight-local --load --progress=plain .` — job exit_code 0, not timed out.
- Local-only image: `gafus-questions-photo:preflight-local`; Docker inspect `linux/amd64`, 106045139 bytes, local image ID `sha256:138a24459c752f94cacaacf0b13c582559328035da61c792b66572434996649c`. **This ID is NOT a Cloud.ru Registry digest.**
- Ran the built amd64 image with Node+Sharp and processed an actual 720x1152 WebP: `AMD64_SHARP_WEBP_PASS`. Entry-point without verified V2 flags refused to run: `QUESTIONS_FAIL_CLOSED_PASS`.
- Docker credential configuration lists `gafus.cr.cloud.ru`, but credentials and repository push authorization were not verified, and **nothing was pushed to Registry**. Cloud.ru S3 ACL/CORS and separate Questions bucket readiness were not verified; the actual Questions-only jobs are not yet provisioned, and Cloud needs a separate HTTPS-accessible Refactor Backend HMAC endpoint. The existing `127.0.0.1` Hono endpoint is inaccessible from Cloud.ru.
- The two local, unit-tested Questions Photo Jobs remain separate from the four narrowly authorized existing Feed Media V2 jobs. No new cloud Jobs were created or existing cloud Jobs modified, no production DB/S3 touched, no production deploy.


## Реальная Cloud.ru инвентаризация и публикация, 2026-10-28

- Read-only authenticated Cloud.ru API project `4c590727-4133-475b-a4bc-564c90a9e686`: **ровно 10 Jobs** и **только один** Questions — `gafus-questions-photo`. Jobs `gafus-questions-photo-2` **нет**. Остальные 9 Feed/Gallery не являются устаревшими Questions Jobs и не должны перезаписываться под Questions из-за квоты.
- Снимок текущего Questions Job с конфигурацией и env/секретами сохранён mode 0600 в ignored Refactor `.local-pg-scratch/cloudru/questions-v2-existing-job-backup-20261028/gafus-questions-photo.json`, вместе с инвентаризацией. Старый образ: `gafus.cr.cloud.ru/gafus-questions-worker@sha256:42f3f4420ba4a1926edad52ce90fe4ca57ea633e6748a39c460a16dff0519036`. Сохранён старый Job `ready`, 0.5 vCPU, 1024Mi, timeout 240s, три retries. Env старого Job содержит `QUESTIONS_JOB_ENABLED=true`, старый публичный `gafus-questions-public` и S3-credentials, **не содержит `QUESTIONS_V2_INTERNAL_BASE_URL`, `QUESTIONS_V2_INTERNAL_HMAC_SECRET`, readiness**. Новый V2 Job несовместим с этой конфигурацией; **Cloud Job не обновлён, это обязательный stop gate**, пока не готов изолированный HMAC backend.
- Существующий `gafus-questions-public` реально обнаружен и доступен; публичная `s3:GetObject` политика относится к legacy `questions/uploads/questions/*`, CORS нет. Создан **отдельный новый** `gafus-questions-v2-private`, реальный Cloud.ru `HeadBucket=200`, **нет bucket policy**, CORS настроен исключительно для `localhost:5173` / `127.0.0.1:5173`, GET/HEAD/POST. Legacy bucket untouched. Первый фактический synthetic signed multipart POST в новый bucket возвратил HTTP **200** (а локальный S3 mock ожидал 204); этот код разрешён клиентами Web/Mobile, однако полный тест исходника/вариантов завершён **не был**, критерий HTTP требует повторной проверки. Один собственный синтетический объект под `questions/v2/synthetic-test-only/` обнаружен чтением (count 1); автоматическая scoped cleanup была заблокирована средой инструментов, поэтому не заявлять удаление и больше не создавать тестовые объекты, пока не выполнено подтверждённое удаление. Ни одного пользовательского объекта не затрагивали.
- Docker image `linux/amd64` собран и протестирован, Sharp WebP PASS, отсутствующие env fail closed PASS. Docker Registry **публикация успешна**, remote `docker buildx imagetools inspect` PASS: `gafus.cr.cloud.ru/gafus-questions-worker:questions-v2-amd64-138a24459c75`, digest OCI `sha256:138a24459c752f94cacaacf0b13c582559328035da61c792b66572434996649c` (amd64 manifest `sha256:2436d76c536019bfe9c0dd4e8526a60e8d39ba3529d18a9a9dafaa9ea7e81b52`). Публикация нового immutable tag не меняет работающий Job и не занимает квоту Cloud Jobs; прежний registry digest сохранён для отката.
- Под квоту реального проекта Refactor Worker изменён на **один** `gafus-questions-photo`, поддерживая до двух отдельных Job execution и не запрашивая `-2`. Questions-only IAM route обновлён на реально проверенный `/api/v2/auth/token` без изменения Feed/Gallery/Chat IAM маршрутов. 23/23 dispatcher-тестов + Worker TypeScript PASS. PG транзакционная граница продолжает ограничивать максимум две фотографии в PROCESSING, но лимит общего количества Cloud executions требует дополнительной защиты при нескольких Worker инстансах.
- Локальный Hono на `127.0.0.1:3001` отвечает `GET /health=200`, однако `GET /internal/questions/media/jobs/claim=503`; отсутствует проверенная Cloud-reachable HTTPS/подтверждённая V2 конфигурация. Не перенаправлять новый контейнер на `api.gafus.ru`: старый API не совместим с HMAC V2. Нельзя заменить старый контейнер, пока новый V2 обработчик не сможет реально получать задания; таким обновлением был бы сломан активный Questions Job. **Никаких PATCH/DELETE/execute Cloud Jobs не проводилось, число Job осталось 10.**

**Final Cloud read-back after separate V2 image Registry publication:** `node .local-pg-scratch/cloudru/questions-v2-verify-existing-20261028.mjs` exited 0. Cloud.ru still lists **10 Jobs**. Existing `gafus-questions-photo` is `ready`, and its **image, resources, all environment entries and full template are byte-for-byte equal** to the mode-0600 pre-cutover snapshot. The rollback image remains pinned at digest `sha256:42f3f4420ba4a1926edad52ce90fe4ca57ea633e6748a39c460a16dff0519036`. The new V2 Registry digest has been uploaded but **NOT assigned to any Job**, because local Questions V2 internal endpoint still returns HTTP 503 and no verified isolated HMAC API is remotely reachable; replacing the running legacy Job now would violate the API compatibility stop rule.

## Исправление архитектурного решения Questions S3 — 2026-10-28 (актуальное)

Владелец подтвердил: для фотографий вопросов **уже существует публичный** Cloud.ru bucket `gafus-questions-public`. Создание отдельного приватного бакета для Questions V2 было ошибкой и **отменено**. Изолированный `gafus-questions-v2-private` удалён через Cloud.ru S3 API, после удаления единственного собственного синтетического объекта. `HeadBucket` нового бакета вернул 404; `HeadBucket(gafus-questions-public)` — 200. Существующий публичный бакет и его политика, объекты и CORS не изменялись.

Дальнейшая целевая архитектура — **существующий публичный Questions S3**, без новых бакетов и без ограничения доступа к готовым публичным изображениям, если это предусмотрено правилами существующих вопросов. Важное текущее расхождение: код Questions Photo V2 пока требует `QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED`, генерирует `questions/v2/` ключи, а публичная S3 policy существующего бакета распространяется только на `questions/uploads/questions/*`. Нельзя считать V2 совместимым с публичным S3 до исправления путей/политики, CORS и тестов; не изменять production S3 policy без отдельного разрешения. Новый `linux/amd64` образ опубликован отдельно, существующий `gafus-questions-photo` Job не обновлён; сохранён rollback прежней конфигурации.

**Этот раздел отменяет предшествующие решения этого документа о необходимости нового приватного Questions-only Cloud.ru бакета.**


## Questions Photo V2: real public S3 accepted (2026-10-28)

* Existing public bucket: `gafus-questions-public`. Accidental `gafus-questions-v2-private` was removed. Original public bucket policy was not changed.
* CORS-only change on existing bucket: backed up exact prior CORS (none) and original policy in the ignored mode-0600 `.local-pg-scratch/cloudru/questions-v2-existing-job-backup-20261028/gafus-questions-public-cors-before.json`. One restricted rule `gafus-questions-v2-web` allows GET/HEAD/POST for GAFUS web and localhost/127.0.0.1:5173 origins. Real browser-style OPTIONS returned HTTP 200. Existing policy remains `s3:GetObject` on `questions/uploads/questions/*`.
* Direct signed POST must use virtual-host `https://gafus-questions-public.s3.cloud.ru/`, because path-style S3 API URL returns HTTP 403 for OPTIONS. Public WebP GET URLs use the same alias.
* **Real Cloud.ru synthetic S3 acceptance PASS**: exact one owned synthetic source PNG multipart SigV4 POST HTTP 200, S3 HEAD/GET with verified bytes, Sharp 360/720 two WebP PUT/HEAD, anonymous browser-CORS WebP GET HTTP 200, anonymous original GET HTTP 403, exact three synthetic UUID object DELETE and HEAD 404. Script `.local-pg-scratch/cloudru/questions-v2-real-public-s3-e2e-20261028.mjs` exited 0. No legacy photo was read, overwritten, or removed.
* New `linux/amd64` image built, Sharp verified, **Registry push successful**: `gafus.cr.cloud.ru/gafus-questions-worker:questions-v2-public-20261028`, OCI digest `sha256:96f76942f9f12099353b131c61332502175f18a1ec94919bfcfd1f4cc04ab321`. Existing Cloud Job still uses prior digest `sha256:42f3f4420ba4a1926edad52ce90fe4ca57ea633e6748a39c460a16dff0519036` and its untouched settings saved for rollback. Never swap before the compatible HMAC Refactor Backend is verified reachable (local Questions internal route currently HTTP 503). No Jobs were created, patched, or executed.
* API, Worker, Feed Cloud, Web Vite, Mobile TypeScript PASS. Worker/Cloud dispatcher/Questions contract tests 43/43 PASS; loopback HTTP SDK+Sharp tests 7/7 PASS. These tests do not establish a working remote Container Job or complete Web/Mobile browser/device end-to-end.

## ACCEPTANCE 2026-10-28: LOCAL WEB -> CLOUD.RU JOB -> EXISTING PUBLIC QUESTIONS S3

Current status OVERRIDES earlier warnings about Job not being switched. The existing `gafus-questions-photo` is now `ready` on published `gafus.cr.cloud.ru/gafus-questions-worker@sha256:96f76942f9f12099353b131c61332502175f18a1ec94919bfcfd1f4cc04ab321`, resources 1 vCPU/2048Mi. No additional Jobs created: project count remains 10. Original Job spec is preserved privately in `.local-pg-scratch/cloudru/questions-v2-existing-job-backup-20261028/gafus-questions-photo.json`, old digest `sha256:42f3f4420ba4a1926edad52ce90fe4ca57ea633e6748a39c460a16dff0519036` available for rollback.

Actual isolated environment: Vite 127.0.0.1:5173 -> Hono 127.0.0.1:3001 -> local PostgreSQL 127.0.0.1:55433 `refactor_chat2_v2_dev_20261027` (only additive Questions V2 table applied) and Redis 127.0.0.1:55929/2 -> Questions-only BullMQ trigger -> existing Cloud.ru Job. A temporary Cloudflare HTTPS tunnel forwards ONLY HMAC-authenticated Questions Job POST endpoints via localhost gateway port 3851 to Hono 3001. No production DB changes or app deploy. The tunnel is ephemeral; Cloud Job must be repointed if tunnel restarts.

REAL end-to-end synthetic test exited 0: authenticated HTTP reservation 201 -> direct signed multipart POST to existing `gafus-questions-public` 200 -> local confirm QUEUED 200 -> real Cloud Job HMAC claim/complete 200 -> local READY -> public Cloud.ru WebP GET 200 (720x1080) -> local draft discard PASS. Marker `QUESTIONS_V2_REAL_LOCAL_TO_CLOUD_END_TO_END_PASS`. Vite `/questions` serves 200, proxy `/api/v1/questions` now correctly returns 401 when unauthenticated instead of 502. Browser Chrome QA: login, questions/new file picker, real S3 upload, Cloud Job READY and public WebP GET all PASS. Browser remove-photo check still NOT PASS: click did not restore counter before timeout, leaving one unbound synthetic local test photo in isolated dev DB. No test question was published. QA cleanup pending; do not claim full browser deletion acceptance.

All running launch scripts, dedicated worker/gateway/tunnel logs, Cloud update scripts are under ignored `.local-pg-scratch/cloudru/questions-v2-live-20261028/`; credentials/rollback JSON are mode 0600. S3 original legacy objects/policy unchanged; only bounded browser CORS added to existing bucket. Nothing committed or pushed.

## 29.10.2026 — восстановление локального Questions Photo V2 после 503 в DevTools

На скриншоте страницы /moments в браузерной консоли были два POST /api/v1/questions/photos/reservations с HTTP 503. Этот endpoint принадлежит выбору фото в разделе «Вопросы», а не «Моментам»; сохранённый журнал браузерной консоли может содержать запросы из предыдущей навигации. Backend-лог подтвердил реальные 503, а проверка работающего loopback API выявила отсутствие QUESTIONS_V2_MEDIA_ENABLED, QUESTIONS_V2_S3_ENDPOINT, QUESTIONS_V2_S3_BUCKET и credentials: API запустился без настроек Questions Photo V2.

Исправления строго в Refactor:
- Локальная конфигурация Questions Photo V2 восстановлена в Hono 127.0.0.1:3001. Используются только WORK PostgreSQL 127.0.0.1:55921/gafus_refactor_real_work_20261024, Redis 127.0.0.1:55927, MinIO 127.0.0.1:9000 и существующий локальный bucket gafus-refactor-questions-test. Credentials подгружаются из ignored mode-0600 .local-pg-scratch/nonprod-s3/credentials.json; их значения не выводятся, не коммитятся и не помещаются в исходники.
- scripts/refactor/local-questions-v2-runtime.py безопасно восстанавливает уже запущенный loopback API или запускает отдельно локальный worker. Скрипт запрещает чужие DB/S3 endpoints и включённые Cloud.ru media Jobs. Режимы: --restart-api, --worker, --e2e.
- scripts/refactor/local-questions-v2-api-env.py подключён к штатному scripts/refactor/moments-live-local-3001.sh. При следующих запусках этого локального Hono настройки Questions V2 не должны исчезать. Выполняются строгие проверки WORK DB, Redis, MinIO, локального bucket и выключенных Cloud Jobs. Никакого production S3 fallback нет.
- scripts/refactor/local-questions-v2-worker.ts выполняет исходную обработку Sharp Questions V2 в изолированном контейнере окружения (локальный процесс), с lease/ACK в той же WORK DB и безопасной отложенной cleanup queue. Запущен отдельно через ChatTerminalHub durable job (не является системным daemon). После завершения локального рабочего сеанса worker нужно запускать снова.
- scripts/refactor/local-questions-v2-e2e.ts проверяет резервирование, signed multipart POST в локальное MinIO, подтверждение, READY и реальный signed GET WebP. Успешный E2E вывел метки LOCAL_QUESTIONS_V2_RESERVATION_POST_CONFIRM_PASS, LOCAL_QUESTIONS_V2_READY_WEBP_PASS, LOCAL_QUESTIONS_V2_TEST_PHOTO_DISCARDED. Первоначальный процесс теста достиг лимита по времени уже после успешного результата из-за открытого BullMQ соединения; one-shot script скорректирован для явного завершения после очистки. Не утверждать, что тот исходный процесс завершился с exit 0.
- Read-only сверка WORK DB: пробное фото отсутствует (photoExists=false), V2 task EXPIRED и cleanupKind=ALL, очистка объектов запланирована после истечения окна replay подписанной загрузки. Это штатная отложенная очистка, не оставлять production-объекты.
- Непосредственно проверены CORS 204 для http://127.0.0.1:5173, signed POST 204, HEAD объекта и его удаление для отдельного синтетического локального объекта, а также готовый WebP HTTP 200 после обработки. Локальные Hono, Vite и MinIO на момент проверки отвечают HTTP 200.
- Тесты: API 28/28, Feed Cloud 12/12, CDN Upload 5/5, Web Questions 36/36 — всего 81/81.
- Полная проверка TypeScript API по-прежнему выявляет отдельные несовместимые тестовые фикстуры в apps/api/src/routes/v1/public-paid-course-outline.test.ts (поля type/equipment/estimatedDuration/theoryMinutes) — не связано с Questions и не включено в scope этой правки.
- Авторизованное ручное подтверждение в Chromium после перезапуска не выполнялось. Новых прод-изменений, prod миграций, Jobs, S3/CDN, API api.gafus.ru и чтения/записи GAFUS Main не было.
