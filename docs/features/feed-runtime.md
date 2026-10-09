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
| `FEED_BUCKET` | Закрытый бакет; может быть существующим приватным бакетом с отдельным `posts/` namespace |
| `FEED_S3_ENDPOINT` | `https://storage.yandexcloud.net` |
| `FEED_S3_ACCESS_KEY_ID`, `FEED_S3_SECRET_ACCESS_KEY` | Учётные данные S3 |
| `FEED_CDN_BASE_URL` | HTTPS origin выделенного CDN, без пути/параметров/credentials |
| `FEED_CDN_SECRET` | Secret Yandex CDN: 24–32 символа `A-Z a-z 0-9 _ -` |
| `FEED_INTERNAL_HMAC_SECRET` | Общий ключ внутреннего API, минимум 32 байта |
| `REDIS_URL` | Существующий общий Redis для nonce |

Без обоих публичных флагов адаптер выключен. Флаги галереи его не включают. При попытке включения неполная/небезопасная конфигурация отклоняется. `FEED_BUCKET_PUBLIC=true` запрещён. Никакие env в ходе реализации не менялись.

Прямой S3 POST ограничен точным ключом, MIME и размером (10 MiB для фото, 200 MiB для видео); TTL не превышает 600 секунд. HEAD ограничен пятью секундами, поддерживает multipart ETag и различает 404 и ошибки доступа. CDN signer принимает только конечные ключи `posts/.../attachments/...`, срок не превышает 120 секунд.

**Signer не настраивает CDN и политику бакета.** Перед включением необходимы реальные проверки подписи на cache hit, закрытого origin и источников. Playback API, cloud worker/queue/deployment и push delivery остаются отдельными незавершёнными задачами.

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

### Оставшиеся внешние зависимости

Уточнение пользователя: отдельного тестового сервера нет, проверяем на production API и БД. Это заменяет требование отдельного DEV API/БД из исходного плана. Отсутствие DEV больше не является блокером. Облачные ресурсы Feed, права и секреты всё ещё должны быть подготовлены явно. Остаются Feed IAM/bucket policy, private containers, photo/video queues+DLQ, storage triggers, maintenance timer, gateway/CDN и отрицательные cache-hit/origin проверки. Terraform ресурсов Feed пока не добавлен; конфигурация галереи сама по себе не развёртывает Feed. Текущие публичные Feed flags глобальны: тестовый аккаунт сам по себе не ограничивает доступ остальных пользователей. Перед ограниченным production smoke требуется механизм допуска тестового аккаунта либо согласованный общий запуск.

Перед release остаются реальный cloud smoke/retry/DLQ, браузерный HLS через настоящий CDN, физические iOS/Android (камера/микрофон/permissions/background), доставка push, полная UX-приёмка и production migration/rollout. Навигация push открывает пост и сохраняет commentId; точный переход/раскрытие нужного комментария пока не реализован. Фото с истёкшими CDN-ссылками требуют обновления запроса; автоматическое продление фото ещё не реализовано.

Финальный контроль: core/feed-server/standalone runtime builds и API/Web/Mobile/worker/runtime typechecks PASS. PostgreSQL после последнего исправления порядка блокировок — 12/12 PASS. Browser QA не завершена из-за медленного dev-server/auth и таймаутов; сохранённые пустые снимки не являются приёмкой. Origin пока возвращает полные ограниченные объекты: одиночный Range из плана ещё не реализован. Временные локальные сервисы остановлены.
