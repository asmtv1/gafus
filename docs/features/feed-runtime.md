# Лента: подключение server/storage и локальная DB-проверка

## Реализованные внутренние маршруты

На Hono API зарегистрированы POST:

- `/internal/feed/jobs/claim`: `{ "batchSize": 1 }`, максимум 20.
- `/internal/feed/jobs/complete`: `{ "jobId": "...", "attemptToken": "UUID", "output": { "width": 100, "height": 100, "thumbKey": "...", "fullKey": "..." } }`. Для cleanup output отсутствует, для видео core проверяет poster/playlist/segments.
- `/internal/feed/jobs/fail`: `{ "jobId": "...", "attemptToken": "UUID", "code": "MEDIA_PROCESSING_FAILED" }`.
- `/internal/feed/maintenance`: `{ "batchSize": 20 }`.

Подписывать нужно через `createFeedCloudInternalClient` из `@gafus/feed-cloud`. Клиент и сервер используют один `FEED_INTERNAL_HMAC_SECRET` (UTF-8, минимум 32 байта). Подпись покрывает метод, путь, исходные байты тела, timestamp и nonce. Допустимое отклонение часов — 60 секунд. Query string запрещён. Лимит тела — 16 KiB, неизвестные поля и неподдерживаемые команды отклоняются.

Nonce хранится атомарно в существующем Redis (`SET NX PXAT`); при недоступности Redis запрос получает 503, core не вызывается. Ожидание Redis ограничено одной секундой. Ответы `no-store`, успешный ответ содержит результат core без внешнего envelope. Устаревший attempt token не позволяет завершить задание. Maintenance работает независимо от публичных флагов.

`/internal/feed/uploads/*` пока не реализованы: фактическая обработка проходит через `FeedStorageJob`; восстановление пропущенного завершения прямого upload ещё требует отдельного сканера.

## Конфигурация адаптера хранения

Все значения задаются через защищённую конфигурацию окружения, реальные секреты в репозиторий не помещаются:

| Переменная | Назначение |
| --- | --- |
| `FEED_ENABLED` | Публичный флаг функции |
| `FEED_PROCESSOR_READY` | Независимый флаг готовности обработки |
| `FEED_BUCKET` | Существующий `gafus-feed-private` (одно хранилище, исходники приватные) |
| `FEED_S3_ENDPOINT` | `https://s3.cloud.ru` |
| `FEED_S3_ACCESS_KEY_ID`, `FEED_S3_SECRET_ACCESS_KEY` | Учётные данные S3 |
| `FEED_CDN_BASE_URL` | HTTPS origin выделенного CDN, без пути/параметров/credentials |
| `FEED_CDN_SECRET` | Только прежний подписанный Beget CDN, 24–32 символа; в публичном Feed не обязателен |
| `FEED_BUCKET_PUBLIC` | `false` — старый подписанный CDN, `true` — публичные готовые объекты Feed |
| `FEED_CDN_HEALTH_OBJECT_KEY` | Проверенный готовый `posts/.../attachments/.../*.webp` для публичного мониторинга |
| `FEED_INTERNAL_HMAC_SECRET` | Общий ключ внутреннего API, минимум 32 байта |
| `REDIS_URL` | Существующий общий Redis для nonce |

Без обоих публичных флагов адаптер выключен. Флаги галереи его не включают. При попытке включения неполная/небезопасная конфигурация отклоняется. `FEED_BUCKET_PUBLIC=true` разрешён только при `FEED_BUCKET=gafus-feed-private` и готовом новом Beget CDN:
в этом режиме `FEED_CDN_SECRET` и `FEED_CDN_EDGE_TOKEN_VERIFIED` не требуются,
подписанная загрузка S3 и HLS playback ticket остаются обязательными, а CDN URL для
`posts/*/attachments/*` становятся публичными. `incoming` и временные попытки
не получают публичные URL. Пока переменная не переключена, действует старая
подписанная схема. Production env здесь не изменялся; порядок переключения см.
`docs/features/feed-public-cutover.md`.

Прямой S3 POST ограничен точным ключом, MIME и размером (10 MiB для фото, 200 MiB для видео); TTL не превышает 600 секунд. HEAD ограничен пятью секундами, поддерживает multipart ETag и различает 404 и ошибки доступа. CDN signer принимает только конечные ключи `posts/.../attachments/...`, срок не превышает 120 секунд.

**Signer не настраивает CDN и политику бакета.** Перед включением необходимы реальные проверки подписи на cache hit, закрытого origin и источников. Playback API, cloud worker/queue/deployment и push delivery остаются отдельными незавершёнными задачами.

## Мгновенный запуск Cloud.ru после подтверждения загрузки (2026-10-14)

При включённых `CLOUDRU_MEDIA_JOBS_ENABLED=true` и `FEED_PROCESSOR_READY=true`
серверный `POST /api/v1/feed/uploads/{id}/complete` **сначала фиксирует**
`uploaded` и соответствующий `FeedStorageJob` в Core, затем создаёт в общем Redis
BullMQ-задание `feed-processing-trigger` с ключом `feed-{uploadId}`. Поле
`FeedUploadDto.kind` (`photo` / `video`) определяется сервером по сохранённому MIME,
а не берётся из пользовательского запроса при подтверждении. Worker запускает
**только** соответствующий пул через allowlisted Cloud.ru API:
`gafus-feed-photo` / `gafus-feed-photo-2` для фото и
`gafus-feed-video` / `gafus-feed-video-2` для видео. Команды чередуются между
двумя заданиями своего типа; одна загрузка создаёт одну команду запуска.
При отказе запуска повторная попытка выбирает следующее задание пула.
Секреты облака не поступают в Web/Mobile или публичные маршруты.

Сигнал ограничен по времени (1,2 с), повторяется BullMQ при ошибках провайдера
и ограничен одним запуском на 0,5 с (до двух команд в секунду). Сбой Redis не делает уже загруженный файл
«неуспешным»: Core хранит запись и durable job. Текущий периодический
Cloud.ru dispatcher (каждую минуту) остаётся резервом и подбирает просроченные
или пропущенные обработки. При выключенных флагах ничего не запускается.
Подтверждение запуска Container Job **не означает готовности фотографии/видео**:
статус `ready` выдаёт только Core после успешной обработки. Время запуска контейнера
и FFmpeg может оставаться заметным, особенно для видео.

Локально реализовано и проверено без production execution, push и деплоя.
При следующем разрешённом релизе проверить задержку `uploaded → ready`, ошибки
очереди, acceptance Cloud.ru, обработку серии фотографий и роликов, а также
резервный путь при недоступности Redis/Container Jobs.

### Пул Cloud.ru Jobs (2026-10-14)

Cloud.ru ограничивает одно задание пятью одновременными выполнениями:
https://cloud.ru/docs/container-apps-evolution/ug/topics/guides__job-run.
Два задания каждого типа дают предел до 10 выполнений фото и до 10 видео.
Каждое выполнение захватывает одну задачу Core; существующие lease/CAS и
attempt token защищают от обработки одной записи разными исполнителями.
Это предел параллельности, а не гарантия времени запуска или готовности поста.

Резервный минутный dispatcher сохраняет три исходных запуска (Gallery, фото,
видео) и не вызывает дополнительные Jobs при каждом опросе. Дополнительные
задания получают команды из мгновенной очереди. Сами незапущенные Jobs не
выделяют вычислительные ресурсы; общий объём обработки по-прежнему зависит
от числа загрузок, времени выполнения и повторных попыток.

`infra/cloudru/prepare-feed-job-pools.mjs --plan` показывает план без сети.
`--apply` с `CLOUDRU_FEED_POOLS_CONFIRM=create-dormant-feed-pool-jobs` создаёт
два незапущенных задания из текущих production-конфигураций: тот же digest
образа, тип, ресурсы, timeout и env, без вывода секретов. `--verify` проверяет
их соответствие исходным заданиям. Уже существующие задания не перезаписываются.
Обычный main release поддерживает все пять production Jobs и обновляет их
на одну версию образа. Создание пула в облаке не активирует локальные изменения
диспетчера: для этого требуется релиз Worker.

## PostgreSQL acceptance 2026-10-09

Контейнер PostgreSQL 18 запущен отдельно, база `feed_test`, схема `feed_acceptance`, порт только `127.0.0.1:55439`. Проверки подключались исключительно через явно заданный `FEED_TEST_DATABASE_URL`. Тест отказывается использовать нелокальный хост или другое имя базы. Очистка удаляет только собственных fixture-пользователей и их jobs.

Полный `prisma migrate deploy` на пустой БД остановился на исторической миграции `20241108120000_exam_result_trainer_review`: `ExamResult` ещё не создана. Это не ошибка новой миграции ленты; существующие миграции не менялись.

Для независимой проверки из текущей Prisma-схемы сформирован baseline без Feed-моделей/enum/relations через `prisma migrate diff --from-empty`. Baseline применён к отдельной схеме, затем выполнен настоящий SQL `20261009072000_feed_initial/migration.sql`. Сравнение результата с полной Prisma-схемой вернуло пустую миграцию.

10 интеграционных тестов с настоящим PostgreSQL проверяют конкурентное создание, приватность черновиков, права, конфликт изменений, idempotency, границу часа, даты, уникальные просмотры/реакции, удаление комментария автором поста, недоступность удалённого поста и обработку фото через claim/attempt token/complete.

Это проверка модели и транзакций, без настоящего S3/CDN/камеры/push/production.

## Продолжение: playback, processing и обслуживание

Этот раздел уточняет прежний статус: playback, обработчики файлов, recovery и push теперь реализованы в коде.

- `POST /api/v1/feed/media/:id/playback` требует пользователя; выдаёт билет на 120 секунд. `GET /api/v1/feed-playback/:id?ticket=...` принимает этот короткий bearer-билет, повторно проверяет активную ревизию/публикацию/удаление и возвращает no-store HLS с подписанными сегментами. Не публиковать билеты в логах. `FEED_PLAYBACK_SECRET` (минимум 32 байта) при отсутствии использует `FEED_INTERNAL_HMAC_SECRET`.
- Web использует native HLS либо hls.js; Mobile — expo-video. Запуск по нажатию, одновременно один плеер, остановка при скрытии/смене вложения/потере фокуса и перед истечением билета. Это не подтверждает работу на физических устройствах.
- `apps/feed-cloud` — самостоятельный worker без Prisma/core/application logger в bundle. Реальные Sharp/FFmpeg, ограниченные файлы, immutable outputs, ETag источника, heartbeat `/internal/feed/jobs/renew`, fencing attempt token и очистка temp. Неопределённый результат callback не приводит к удалению опубликованных файлов.
- Сборка: `pnpm --filter @gafus/feed-cloud-runtime build`; origin ZIP: `pnpm --filter @gafus/feed-cloud-runtime package:origin` → `apps/feed-cloud/artifacts/feed-origin.zip`, handler `index.handler`, Node 22. Docker build из корня: `docker build -f apps/feed-cloud/Dockerfile .`. Docker image в этом проходе не собирался и не публиковался.
- Worker требует `FEED_WORKER_TYPE=photo|video`, `FEED_INTERNAL_BASE_URL` (HTTPS production API по уточнению пользователя), `FEED_INTERNAL_HMAC_SECRET`, `FEED_BUCKET`, `FEED_S3_ACCESS_KEY_ID`, `FEED_S3_SECRET_ACCESS_KEY`. Photo забирает copy/photo/cleanup jobs, video — только video. Private контейнер POST `/`, concurrency 1; concurrency одного экземпляра не ограничивает число экземпляров облака.
- Origin требует отдельную сервисную учётную запись с правом читать конечные Feed WebP/TS, `FEED_ORIGIN_SECRET` (32+), `FEED_BUCKET`, S3 credentials. Принимает только GET/HEAD с `x-feed-origin-secret`; запрещает исходники, альбомы и неподписанные playlists. CDN обязан проверять пользовательскую подпись до cache hit и закрывать origin внешнему доступу. Код origin сам не заменяет CDN/IAM настройки.
- Recovery сканирует ограниченную порцию reserved uploads, сверяет HEAD с зарегистрированным MIME/размером и атомарно создаёт processing job. Не требует включённых публичных флагов. Удаление сохраняет задачи до каскада аккаунта; учитывает ещё действующие POST и leases, возможные незарегистрированные конечные файлы и ограничивает порцию ключей двадцатью. Альбомные оригиналы не удаляются.
- Обычный worker запускает обслуживание раз в минуту только при `FEED_MAINTENANCE_ENABLED=true` (после миграции). `FEED_PUSH_ENABLED=true` отдельно разрешает outbox доставку через существующие Web/Expo/RuStore транспорты. Эти переменные не включались. Push доставляется at-least-once; сетевой неопределённый результат допускает повтор.

### Current production rollout status (supersedes earlier notes)

The owner authorized production testing for all accounts. No separate DEV server is required. Dedicated Feed Terraform resources, private bucket/credentials, Lockbox, queues/DLQs, object triggers and private photo/video containers are deployed. Queue triggers and the maintenance timer remain off until the production internal API is ready.

Media reuses https://gallery-dev.gafus.ru through a specific /posts/{path+} route on its existing API Gateway. The Gallery route is preserved. Feed uses the existing CDN signing key and origin header secret, with separate storage credentials and internal HMAC. No second CDN/DNS record is needed. The certificate challenge CNAME already created for feed.gafus.ru may remain.

Live smoke: signed GET 200, repeated GET 200, Range 206 with correct Content-Range and CORS, unsigned 403, expired 410, direct gateway without secret 403. Worker writes outside posts/ are rejected. Smoke objects were removed. An explicit edge cache HIT was not observable in response headers.

Build/typechecks passed for core/feed-server/runtime and API/Web/Mobile/worker/runtime. 111 targeted tests and 13 real PostgreSQL tests passed. Native Sharp/FFmpeg passed in an AMD64 worker image in GitHub Actions. Notification comment lookup now authorizes the live post, rejects deleted content and scrolls to the target. Root comment lists paginate. Feed queries refresh every 90 seconds for 120-second signed URLs. Origin supports bounded single byte ranges.

Production backup preflight verified a fresh pg_dump via pg_restore --list: Feed tables were absent and failed migrations were zero. App deployment/migrations and production post/photo/video/HLS checks must still be confirmed separately. Physical iOS/Android camera/microphone/background/permissions and push delivery remain device acceptance work. Temporary local PostgreSQL/Redis/Next services are stopped.
