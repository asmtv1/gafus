# GAFUS Main: отдельное публичное хранилище вопросов + Beget CDN

Дата: 2026-10-18. Статус: **подготовлено, инфраструктура не создана, production не переключён**.

## Почему отдельный бакет

Cloud.ru Evolution Object Storage тарифицирует объём, запросы и трафик, **не число бакетов**. Free tier (общий на организацию): стандартное хранилище 15 ГБ, GET/HEAD 1 млн, LIST/POST/PUT 100 тыс., исходящий трафик 10 ТБ/месяц. Beget CDN: 0,60 ₽/ГБ исходящего трафика, первые 1 млрд запросов/месяц **на ресурс** включены. Стоимость не нулевая при нагрузке, но фиксированной платы за пустой бакет нет.

Официальные источники:
- https://cloud.ru/docs/s3e/ug/topics/pricing
- https://cloud.ru/docs/s3e/ug/topics/overview__free-tier
- https://beget.com/ru/news/2026/obnovlenie-tarifikaczii-cdn-s-15-sentyabrya

## Целевая схема

- Только опубликованные фото вопросов/ответов: `gafus-questions-public` (Cloud.ru S3), адресация `https://gafus-questions-public.s3.cloud.ru`, внутри — `questions/uploads/questions/<ownerId>/<UUID>.<jpg|png|webp>`.
- Public bucket policy: **только `s3:GetObject`** и только на `questions/uploads/questions/*`. Никогда публичный `PutObject`, `DeleteObject`, `ListBucket`; сервисная запись через IAM.
- Отдельный Beget Cloud CDN «GAFUS Questions CDN», HTTPS origin `gafus-questions-public.s3.cloud.ru`, технический `*.begetcdn.cloud` домен. Не менять Gallery/Feed ресурсы.
- CDN кеширует immutable UUID объекты; браузерный cache-control 180 с; edge кэш согласовать и отдельно доказать purge-by-path для удаления объектов и удаления аккаунта.
- Документы питомцев остаются **только приватными** в `gafus-documents-private`, без публичного доступа или CDN.
- Существующие `cloudru:questions:` маркеры продолжают указывать на **старый** приватный бакет. Новые фото нельзя направлять на другой бакет под тем же marker: нужен отдельный новый marker с явной идентичностью провайдера; чтение, очистка, owner erasure и rollback должны учитывать оба. Не переключать env `CLOUDRU_QUESTIONS_BUCKET` на новый бакет: текущая реализация `privateUserMediaStorage` намеренно допускает только `gafus-documents-private`.
- Раздел вопросов сейчас требует входа в GAFUS. Публичный S3 устраняет контроль авторизации на **сами изображения**: любой обладатель URL сможет их прочитать. Это изменение модели приватности, даже если страницы вопросов требуют авторизации. Проверить product/privacy policy перед запуском.

## Факты и блокер

- Production API/Web: `CLOUDRU_USER_MEDIA_ENABLED=true`, `CLOUDRU_QUESTIONS_BUCKET=gafus-documents-private`.
- 2026-10-18 на production проверено: `gafus-questions-public` -> HeadBucket 404, `gafus-documents-private` -> HeadBucket 200. Попытка CreateBucket действующим S3 service-account -> `403 AccessDenied`; **бакет не создан, ничего не перенесено**.
- Для Cloud.ru CreateBucket нужна общая роль `s3e.editor` (или временная role-equivalent) на уровне **тенанта/хранилища**, а для Bucket Policy нужна `s3e.editor-acl` на конкретном бакете. Текущие права записи/чтения в `gafus-documents-private` не позволяют создать новый бакет. Предпочтение: создать бакет оператором через панель Cloud.ru и назначить runtime SA scoped права `s3e.viewer`/`s3e.editor` только на новый bucket, **не расширять постоянно production SA на весь tenant**. Для readonly-аудита policy нужен `s3e.viewer-acl`.
- Beget API token в разрешённом локальном GAFUS Main подтверждён GET `/v1/cloud/cdn/price` HTTP 200. CDN config `cdn_v1` присутствует. Создавать CDN до публичной доступности S3 origin нельзя: origin Beget неизменяем после создания.

## Подготовленный provisioning tool

`infra/cloudru/questions-public-provision.mjs` действует только на новый бакет и новый ресурс:

1. `node infra/cloudru/questions-public-provision.mjs --plan` — без сайд-эффектов, показывает точную схему.
2. `node --env-file=.env infra/cloudru/questions-public-provision.mjs --check-beget` — readonly проверка токена.
3. После выдачи Cloud.ru IAM роли, с защищёнными переменными `CLOUDRU_S3_ENDPOINT`, `CLOUDRU_S3_ACCESS_KEY_ID`, `CLOUDRU_S3_SECRET_ACCESS_KEY` и `GAFUS_QUESTIONS_INFRA_CONFIRM=create-isolated-questions-public-storage`: `node infra/cloudru/questions-public-provision.mjs --create-bucket`. Пытается **только** создать новый bucket и применить узкую политику GET, не перезаписывая существующий bucket.
4. `node infra/cloudru/questions-public-provision.mjs --smoke-bucket` — синтетический PNG: signed PUT, anonymous GET байт-в-байт, anonymous LIST/PUT deny, точечная cleanup. Без PASS нельзя продолжать.
5. С тем же подтверждением и `BEGET_CDN_API_TOKEN`: `node infra/cloudru/questions-public-provision.mjs --create-cdn`. Повторно делает smoke и создаёт **новый** ресурс Cloud API Beget; выводит service ID. Не переключает ни один текущий ресурс.

Если `--create-bucket` завершился ошибкой **после** `QUESTIONS_BUCKET_CREATED=YES`, не повторять создание вслепую: проверить наличие бакета и его policy в панели. Для уже созданного бакета policy нужно проверить/применить отдельно.

## Обязательные gate перед маршрутизацией в приложении

1. Проверить фактический HTTPS CDN cache HIT / Range / CORS, origin host, Content-Type, Cache-Control (180 с browser), стойкость и обновление cache; только публичное чтение.
2. Выполнить Beget **path-exact purge**, проверить отсутствие после DELETE на прогретом edge: GET и HEAD должны дать 404. Учесть CDN propagation, retries, durable purge on delete и на account erasure.
3. Ввести **новый provider marker** для `gafus-questions-public`, не интерпретировать старые фото как новый bucket; загрузка в новом бакете должна сохранять ссылку-маркер, а не доверять сохранённым URL. Редактирование/удаление вопросов, очистка unbound фото через сутки, аккаунтная очистка — оба provider и каждый CDN key.
4. Проверить реальную загрузку/просмотр/удаление фото в вопросах и ответах на web/mobile (включая logout/relogin) и rollback без смены смысла старых URL.
5. Только после полного теста, review и **отдельного разрешения на push/deploy** активировать изменение в GAFUS Main. Старые 5 записей фото не затронуты; миграция и удаление старого контента требуют отдельной проверки ownership, SHA256, и rollback.

## Нельзя

Нельзя делать `gafus-documents-private` публичным; менять существующий Beget Gallery/Feed CDN; выставлять новый bucket в `CLOUDRU_QUESTIONS_BUCKET` без изменения кода; публиковать подписанные документы; считать созданный CDN автоматически пригодным к производству; пушить или деплоить без запроса пользователя.

## Live-обновление 18.10.2026 (после создания бакета в панели)

- В Cloud.ru создан `gafus-questions-public` с глобальным именем/доменом. Production API S3 credentials получают `HeadBucket=200`, `GetBucketVersioning` — выключено/не задано; публичной политики первоначально не было.
- Применена scoped Bucket Policy только `s3:GetObject` на `arn:aws:s3:::gafus-questions-public/questions/uploads/questions/*`, подтверждены `GetBucketPolicy` и `GetBucketPolicyStatus.IsPublic=true`. Cloud.ru нормализует policy, дописывая пустые `NotPrincipal`, `NotAction`, `NotResource`, `Condition`: проверять семантически, не сравнивать исходный JSON байт-в-байт.
- Production S3 signed PUT синтетического PNG прошёл `200`; анонимный GET того же объекта по `https://gafus-questions-public.s3.cloud.ru` — `200` с идентичными байтами; анонимные LIST/PUT — `403`. Отдельный synthetic fixture удалён, проверен S3 HEAD `404`.
- В Beget Cloud создан новый отдельный сервис `GAFUS Questions CDN`: UUID `3c2a1623-50a1-46a1-b7a4-bb1093eaedf0`, технический хост `ebiteskukingusk.begetcdn.cloud`, source HTTPS `gafus-questions-public.s3.cloud.ru`. Остальные Beget ресурсы не менялись.
- **CDN ещё НЕ ГОТОВ**: Beget API `service.status=RUNNING`, но `resource_domain.status=CONFIGURING`, `cdn.ssl_enabled=false`; GET тестового PNG через CDN — `403` (nginx, `x-cdn-edge-cache: HIT`) при прямом S3 `200`. Запрос `POST /v1/cloud/cdn/{id}/setting` на `caching_time=86400` вернул HTTP 200 с JSON `error`, фактический TTL остался 345600. Попытка точечного purge по тестовому ключу вернула HTTP 200 с `error=INTERNAL_ERROR`. Не считать завершённым HTTPS/origin/cache/purge acceptance до тех пор, пока CDN не перейдёт в `WORKING` и не пройдут повторные E2E тесты на новом synthetic fixture.
- На Mac TCP+TLS к Cloud.ru bucket-domain иногда зависает; с production хоста HTTPS работает. Отдельно проверить с другой внешней сети после завершения Beget provisioning.
- Production-флаги, реальные фото вопросов, существующие S3/Beget ресурсы, Git push и production deploy не менялись. Новые загрузки вопросов пока идут старым путём. 5 ранее существовавших тестовых фото из старого Yandex S3 удалены отдельно по явному разрешению пользователя, `QuestionPhoto` после удаления = 0.

## Реализация GAFUS Main после запроса «перенастроить обработчик»

Выполнено **локально, без push/deploy**. Отдельного ресайзера/транскодера в Questions нет: `packages/questions-server/src/index.ts` принимает multipart, общий `packages/core/src/services/questions/photos.ts` определяет MIME, сохраняет оригинал в S3. Web и Mobile используют единый `/api/v1/questions/photos`.

- `packages/cdn-upload/src/publicQuestionMedia.ts`: проверенный bucket `gafus-questions-public`, путь `questions/uploads/questions/{ownerId}/{UUID}.jpg|png|webp`, immutable S3 PUT, fail-closed настройки, провайдерный маркер `cloudru:questions-public:{key}`, direct-S3 fallback на случай выключения CDN после cutover, проверенное S3 удаление. Публичный URL получает только DTO, маркер остаётся в базе.
- `packages/core/src/services/questions/photos.ts`, `presentPhoto.ts`: резервируют новый provider marker **до S3 I/O**, загружают и отображают фото, удаляют/отзывают фото только под owner lock, ставят точечный `MediaCdnPurge` в транзакционную очередь после подтверждённого удаления S3. Прежние `cloudru:questions:` и Yandex-прямые URLs поддерживаются.
- `packages/core/src/services/mediaDelivery/purgeQueue.ts`, `purgeWorker.ts` + `packages/cdn-upload/src/begetCdnPurge.ts`: валидируют exact public Questions keys, закреплённый Beget service UUID/host, API purge request и после propagation требуют **HEAD и GET 404** на Beget edge. `403/410` не считаются доказательством удаления.
- `packages/core/src/services/accountCleanup/enqueue.ts` и `packages/cdn-upload/src/accountStorageCleanup.ts`: новый отдельный durable `questions-public` scope, точные S3 ключи и user prefixes, verification and Beget purge; старый `questions` cleanup не перенаправлен в публичный бакет, документы питомцев не затронуты.
- `ci-cd/docker/docker-compose.prod.yml` и `.github/workflows/production-deploy-reusable.yml`: отдельные env для Web, API, Worker; в действующем production cutover пока не включён. `QUESTIONS_PUBLIC_S3_ENABLED=true` требует `QUESTIONS_CDN_LIVE_VERIFIED=true` и точное соответствие bucket/CDN endpoint/creds. Исторический `CLOUDRU_QUESTIONS_BUCKET=gafus-documents-private` **не менять**.
- Тесты: `publicQuestionMedia.test.ts` + `begetCdnPurge.test.ts` + `purgeQueue.test.ts` + `storage.test.ts` + `worker.test.ts` + `photos.compensation.test.ts`, типизация API/Web/Worker и сборки `cdn-upload/core/questions-server` прошли. Сборка `@gafus/reengagement` понадобилась для локального TS Worker, после чего typecheck PASS.

## Подтверждённый real Beget CDN acceptance 18.10.2026

- Beget resource `3c2a1623-50a1-46a1-b7a4-bb1093eaedf0` стал `WORKING`, `ssl_enabled=true`, хост `ebiteskukingusk.begetcdn.cloud`.
- В новый Cloud.ru бакет загружен **только UUID disposable synthetic PNG** `questions/uploads/questions/cdn-smoke/2f5c4674-1150-4eb3-9aa1-b9b237340b1e.png` (не пользовательский объект); Beget возвращал GET 200 и byte match, повторные запросы показали CDN MISS, затем HEAD 200 HIT.
- Из Cloud.ru synthetic объект удалён. Точный `POST /v1/cloud/cdn/3c2a1623-50a1-46a1-b7a4-bb1093eaedf0/purge-cache-by-paths` вернул HTTP 200 с успешным `cdn` без `error`. Повторный HEAD и GET для удалённого ключа на CDN дали **404/404**. Путь source, service UUID, edge cache и purge E2E подтверждены. Производственные фото/вопросы не менялись.
- CDN edge TTL в Beget **пока 345600 секунд**, а целевое значение 86400. `POST /v1/cloud/cdn/{id}/setting` с одним `caching_time=86400` вернул `INVALID_OPTION: follow_origin_redirect is required`; существующие настройки НЕ изменились. Перед отдельным переключением при необходимости привести edge TTL к 86400 через корректную форму настроек с сохранением остальных параметров. Browser cache должен быть 180 секунд, для новых S3 изображений `Cache-Control: public, max-age=180, must-revalidate`.
- Web/Mobile authenticated upload, signed-in rendering, delete/edit, ownership и logout ещё не прогонялись на deployed коде. Push/deploy не выполнялись и должны быть отдельно разрешены.

### Режим следующего approved deploy

После успешного реального CDN/HIT/purge acceptance в production release workflow значения Questions cutover **включены по умолчанию**: `QUESTIONS_PUBLIC_S3_ENABLED=true` и `QUESTIONS_CDN_LIVE_VERIFIED=true`, если защищённые GitHub vars явно не установлены в `false`. В ручном Docker Compose без release env defaults остаются `false` (fail closed). Это изменение **только локальное**, push/deploy не выполнялись. При следующем согласованном push/deploy новые фото пойдут в отдельный Cloud.ru S3 и Beget CDN; legacy marker продолжит читать старые файлы. Перед push следует повторить smoke CDN, получить e2e Web/Mobile upload/delete и подтвердить отсутствие несовместимых незакоммиченных изменений других задач.

## Дополнительная release-проверка 18.10.2026 — soft-delete фотографий

Проверка перед push выявила, что `deleteQuestion` / `deleteQuestionAnswer` используют `deletedAt`, поэтому фото уже не видны в DTO, но оставались доступны по публичному S3 URL. Локально расширен существующий `cleanupUnusedQuestionPhotos`: каждые пять минут (было ежечасно) фоновая задача выбирает только необработанные uploads старше суток и фото вопросов/ответов с подтверждённым `deletedAt`, включая фото ответов при удалении родительского вопроса. Повторная проверка eligibility после row-lock предотвращает удаление фото действующих вопросов. Сначала подтверждённое S3 удаление, затем durable `MediaCdnPurge` и удаление БД внутри транзакции. При сбоях оставляется запись для повторной попытки. Для старых Yandex URL используется относительный `storagePath`, а не HTTP URL. Модераторское скрытие (`hiddenAt`) не приводит к стиранию файлов, так как допускает обратное открытие.

Проверено: `@gafus/core` build PASS, `@gafus/worker` typecheck PASS, `photos.cleanup.test.ts` (6 тестов) и совместимые медиа-тесты — 73/73 PASS, workflow/deploy-only contracts — 14/14 PASS, живой Beget readonly preflight — `ready`. Ранее финальный повторный полный Next.js build → typecheck 31/31 PASS (exit 0, job `10a89b4e694f6feb`) до последнего точечного дополнения cleanup; повторное core build/worker typecheck выполнено после него.

Push, commit и production deploy не выполнялись. Сценарии фото на реальных опубликованных вопросах после обновления production ещё нужно проверить после разрешённого релиза. В рабочем дереве параллельно присутствуют Feed/Gallery правки, не включать их автоматически в Questions-only commit.


## Questions WebP Cloud.ru Job: current local implementation (supersedes direct originals)

This local implementation supersedes older notes above describing direct PNG/JPEG publication and default-enabled Questions cutover. Nothing below is deployed.

- New `gafus-questions-photo` Cloud.ru Container Job uses the separate SHA-tagged `gafus-questions-worker` image; it never changes Feed/Gallery jobs. Job creation is gated by `QUESTIONS_CLOUD_JOB_ENABLED=true` (default false).
- API reserves `QuestionPhoto` with `cloudru:questions-pending:` and empty URL before writing JPG/PNG/WebP to nonpublic `questions/incoming/questions/<owner>/<id>/source.ext`.
- Job uses sharp autorotation, EXIF removal, 50 MP limit, quality82, and produces <=1.75 MB `thumb.webp` 480px and `full.webp` 1920px. Its staging is nonpublic: `questions/processed/questions/`.
- Web/Mobile poll authenticated GET `/api/v1/questions/photos/<id>` each 3s for max 3min. API checks owner and unbound status under row lock, HEADs both staged files, copies them to public `questions/uploads/questions/<owner>/<id>/thumb.webp|full.webp`, and persists final provider marker only after both successful copies.
- Cancel/soft-delete/account erasure remove S3 source, staging, and final variants. Durable Beget purge covers both full/thumb. Separate cleanup removes only private intermediary files older than 24h. Historical JPG/PNG objects remain under their old provider.
- Redis wake is best effort and capped at 1.8s; the worker cron recovers through an allowlisted Cloud.ru job each minute.
- Release vars `QUESTIONS_PUBLIC_S3_ENABLED`, `QUESTIONS_CLOUD_JOB_ENABLED`, and `QUESTIONS_PROCESSOR_READY` are ALL false by default. This overrides prior default-true statement above. Existing `CLOUDRU_QUESTIONS_BUCKET=gafus-documents-private` remains unchanged.
- Validated locally: real sharp PNG -> 2 WebP, security/key tests, queue/cleanup contracts, package build/typecheck, Web+Mobile typecheck and CI workflow tests. No commit, push, deployment or production data changes.
- Outstanding: actual Cloud.ru S3 CopyObject e2e on new source/stage/final keys, Docker Linux AMD64 build (local Docker daemon unavailable), creation and trial execution of Cloud.ru Job, real Web/Mobile sign-in/upload/poll/delete, CDN purge GET/HEAD 404 and account-erasure acceptance. Previous CDN PNG tests did NOT test the new job.


## Questions live release verification: linux-amd64 and S3 CopyObject (2026-10-18)

- PASS: macOS Docker Desktop local image built with `docker buildx build --platform linux/amd64 -f apps/questions-cloud/Dockerfile ...`; job d09a722defdc3581 exited 0. `docker run --rm --platform linux/amd64 -e QUESTIONS_JOB_ENABLED=false` exited 0. No runtime production environment was used.
- PASS: Production Cloud.ru S3 API credentials ran an isolated two-object test in `gafus-questions-public` under disposable `qa-copy` keys: private stage PUT, `CopyObject` to public `thumb.webp` and `full.webp`, HEAD/GetObject verified exact content, `Content-Type: image/webp` and `Cache-Control: public, max-age=180, must-revalidate`. Exit code 0, job 0c44e46e6cd3819c; cleanup confirmed deleted variants and stage objects, leaving zero `qa-copy` objects in initial inventory. No user files touched.
- PASS: Cloud.ru API readonly listing confirmed `gafus-questions-photo` did not yet exist (job 64066c4eac8871dc).
- A QA-tagged image `gafus.cr.cloud.ru/gafus-questions-worker:questions-qa-20261018` was built on an isolated Docker image namespace on the production Linux host from a scoped ~10KB Questions source archive. Docker build log reached image creation, but agent status repeatedly timed out; do not claim remote build exit 0 without its exit status.
- BLOCKED: registry publication using runtime credentials from production containers was rejected by tool safety controls. Do not route credentials to the developer machine or bypass this restriction. The QA image has NOT been confirmed published in Cloud.ru Registry and no Cloud.ru processing Job has been created or executed. Existing Feed/Gallery Jobs and production application containers were not modified.
- Approved release path when user specifically requests push: inspect concurrent dirty Feed/Gallery work before any commit, use normal GitHub Actions Cloud.ru registry credentials and immutable SHA image publication. Set protected CI variable `QUESTIONS_CLOUD_JOB_ENABLED=true` for the Cloud.ru-only Job creation, while keeping `QUESTIONS_PUBLIC_S3_ENABLED=false` and `QUESTIONS_PROCESSOR_READY=false` until explicit Job, Web/Mobile and CDN E2E acceptance. No push/deploy has occurred during these checks.


## GitHub Actions isolated QA image publication (2026-10-18)

- Created an isolated QA-only commit `dbeba449619f45b981e95cf82f5eb4380644dca5` on remote `qa/questions-cloud-image-20261018` using a separate Git index inside the permitted GAFUS Main repository. Checked-out `main` stayed at `3ee094fc5b3d4fb6d369e6942ff43590311c5354`. The QA commit has exactly nine scoped files: Questions Dockerfile/sources/tsconfig, manual Cloud.ru image workflow and the publish script. Concurrent local Feed/Gallery, API, Web and Mobile edits were not included.
- QA review workflow run `39080688135` succeeded (verify-media-contracts and Linux AMD64 Questions image build/archive), `publish=false` and no deploy.
- QA publication workflow run `39080860420` succeeded (both jobs). `publish=true` was limited to the Questions worker image and used GitHub Actions Cloud.ru Registry secrets.
- Confirmed Cloud.ru Registry image tag: `gafus.cr.cloud.ru/gafus-questions-worker:dbeba449619f45b981e95cf82f5eb4380644dca5`. OCI manifest-list digest: `sha256:83faf0a8a6940eda455ccead6a4e21c985a4f30fa5e57f31c0aa44c084bdd5f9`. The Actions log reported `Cloud.ru image published: gafus-questions-worker`, and the run finished `success`.
- NO Cloud.ru processing Job was created/executed, NO production service was deployed, NO main push or merge, and NO runtime cutover flags were changed. Next isolated step is QA-only Job provisioning and synthetic PNG -> WebP E2E acceptance with the exact immutable image digest before enabling production traffic.


## One-push default-on Questions WebP rollout (post-deploy readiness), 2026-10-18

- New production release defaults to true (unless an explicitly protected GitHub environment variable is false): `QUESTIONS_PUBLIC_S3_ENABLED`, `QUESTIONS_CLOUD_JOB_ENABLED`, and `QUESTIONS_PROCESSOR_READY`. The old private documents bucket and historical Questions markers are preserved. Manual Compose retains fail-closed false defaults if release env is absent.
- Before building/publishing production images the GitHub workflow checks working HTTPS Beget Questions CDN and real existing `gafus-questions-photo` Job (Cloud.ru IAM read-only GET, exact project/container, immutable Questions image SHA256, bounded resources and expected environment variable names). Manual production deploy performs the same read-only checks before SSH.
- The Cloud.ru media release builds the new SHA-tagged Questions worker, updates the single existing Job to the new release digest, and blocks app deploy until `--verify` confirms matching image and bounded Job configuration. Gallery/Feed Jobs retain their existing release behavior.
- Before opening the reverse-proxy maintenance gate, the release verifies that deployed API, Web and Worker containers all report Questions S3/Job/processor/CDN enabled with the expected public bucket, and that the Worker Cloud.ru dispatcher is enabled; any failure blocks traffic and invokes existing deploy rollback/recovery.
- Updated Web and Mobile explicitly send `X-Gafus-Questions-Async: 1` for photo uploads; only this opt-in receives pending/ready status polling. Installed older Mobile builds without this header keep the existing private Cloud.ru S3 upload and immediate signed URL, so a first-push rollout does not break older application versions. These old builds will only use the new WebP processing after being updated.
- Targeted Questions media, HTTP compatibility, S3/CDN purge and release contract tests are blocking in main CI. These changes are LOCAL on main, NOT committed or pushed. Before a push, inspect all concurrent Gallery/Feed changes and run the complete main-release checks; no runtime Web/Mobile authenticated smoke can be claimed until code is actually deployed.


### Final one-push pre-deploy processing verification

The main CI Cloud.ru preparation job now executes a one-time real synthetic PNG smoke AFTER verifying the new revision digest of the existing gafus-questions-photo and BEFORE the API/Web/Worker production deploy. The smoke resolves the immutable SHA image digest, executes the actual Cloud.ru Job, requires verified private thumb.webp and full.webp, requires no direct public final object, and deletes its UUID-scoped temporary source and outputs. Failure blocks the deploy. No separate test push or manual enablement is needed.
