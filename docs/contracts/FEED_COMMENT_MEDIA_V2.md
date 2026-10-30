# Моменты: медиа в комментариях — Feed Media V2

**Статус (29.10.2026):** реализовано в Refactor, не развёрнуто в production. Миграция 20261029173500_feed_comment_media применена только к изолированной локальной WORK PostgreSQL 127.0.0.1:55921/gafus_refactor_real_work_20261024; prisma migrate status подтвердил актуальную схему. Пересобраны @gafus/types, @gafus/core, @gafus/feed-server и перезапущен локальный API 127.0.0.1:3001 с сохранением изолированных Redis/S3-параметров. Реальный E2E с браузером и передачей фото в локальный S3/Jobs ещё не выполнен.

## Возможности

- Web, Android и iOS: текст, фото, видео и их сочетания как в корневых комментариях, так и в ответах. Возможен комментарий только с вложениями, без текста.
- Ограничения такие же, как у публикации: до 10 файлов, до 3 видео; JPEG, PNG, WebP, MP4, MOV, WebM; фото до 10 МиБ, видео до 200 МиБ, длительность до 120 секунд. На Mobile существующий загрузчик конвертирует HEIC в JPEG.
- Предпросмотр и удаление выбранного файла; обработка, успех, ошибка; просмотр готовых файлов теми же проигрывателями, что у публикаций.
- Авторизация и существующие права доступа к видимым опубликованным постам. Блокировка публикации модератором распространяется на резервирование файлов комментария.

## Архитектура без дублирования

1. Существующий POST /api/v1/feed/posts/:postId/uploads с новым необязательным полем purpose=comment. Без purpose сохраняется поведение публикации поста.
2. Существующие FeedUpload + FeedMediaAsset, короткоживущий подписанный POST в Cloud.ru S3. Клиент передаёт файл напрямую через существующий Web/Mobile upload transport.
3. Существующий POST /api/v1/feed/uploads/:uploadId/complete и те же задачи publish_photo / publish_video для Feed Media V2. Те же FFmpeg/Sharp, объектные ключи media/v2/{mediaId}/v1/*, Cloud.ru S3, CDN-first Beget и авторизованный S3 fallback. Новые Container Jobs не создаются.
4. POST /api/v1/feed/posts/:postId/comments принимает mediaIds вместе с текстом. В транзакции проверяются владельцы медиа, postId, purpose=comment, статус загрузки, отсутствие повторной привязки и лимиты. Связи хранятся в FeedCommentMedia с порядком position. Допустимы состояния uploaded/processing/ready: комментарий появляется сразу, медиа — по завершении работы Job.
5. GET /comments/:commentId, /posts/:postId/comments, /comments/:commentId/replies возвращают media: FeedMediaDto[] с короткоживущими подписанными ссылками. Клиенты обновляют данные до окончания обработки. S3 fallback для медиа комментария проверяет видимость и отсутствие удаления комментария.

## Схема БД и cleanup

- Аддитивная миграция: packages/prisma/migrations/20261029173500_feed_comment_media/migration.sql.
- FeedUpload.purpose: значение по умолчанию post для полной совместимости ранее созданных загрузок. Значение comment меняет только разрешённую цель прикрепления, не медиа-пайплайн.
- FeedCommentMedia(commentId, mediaId, position): FK и уникальность вложения. Один файл нельзя прикрепить к нескольким комментариям, к посту/опросу и комментарию одновременно.
- Удаление комментария: только связанные с ним медиа получают статус cancelled, enqueue delete_keys для исходников и всех допустимых результатов обработки, с задержкой до окончания POST URL и leases. Не удалять другие файлы родительского поста.
- Периодическая уборка после 24 часов находит загруженные, но не прикреплённые к комментариям файлы и удаляет их через стандартную очередь. Блокировки строк загрузки защищают от гонки с созданием комментария.
- Удаление поста и аккаунта использует общий Feed cleanup, с учётом source keys владельцев-комментаторов.

## Безопасная проверка и выпуск

- Проверка Prisma schema и генерация клиента делаются с фиктивной DATABASE_URL, без записи в БД.
- TypeScript typecheck: Core, Web, Mobile. Тесты: comment-media.contract, comment-media.service, feedMediaTransfer, существующие Web/Mobile comment scenarios, Feed Jobs и maintenance.
- Остаточные обязательные проверки: выполнить реальную загрузку JPEG/MP4/ошибки/удаление/ответы/обработку в локальном Backend с изолированным S3 и Jobs, проверить подписанные CDN URL и fallback, провести Playwright в Chromium и тест на Android/iOS. Ошибка HTTP 400 при POST /posts/:id/uploads от 29.10 была вызвана старым packages/core/dist, отвергавшим поле purpose: comment; после пересборки runtime-контракт подтверждён тестом компилированной схемы и HTTP /health=200.
- Не менять production PostgreSQL, S3/CDN, Backend, Jobs, GAFUS Main и не выполнять деплой в рамках проверки этой задачи.


## Local Moments publishing outage, 29.10.2026

- The Web publication composer encountered ERR_CONNECTION_REFUSED on direct POST to http://127.0.0.1:9000/gafus-refactor-feed-test because the isolated local MinIO server was not running. No evidence of a production S3 problem.
- The project-owned binary in .local-pg-scratch/nonprod-s3/bin/minio was started via scripts/refactor/ag1-nonprod-s3-server.py in a durable local job; only 127.0.0.1:9000 was exposed. Credentials and objects remain within .local-pg-scratch/nonprod-s3. The existing bucket gafus-refactor-feed-test was reused, not replaced.
- Verified MinIO /minio/health/live HTTP 200; browser origin http://127.0.0.1:5173 POST CORS preflight HTTP 204; generated S3 signed multipart POST HTTP 204, HEAD returned the exact sample length, and the synthetic object was deleted.
- The Web publication composer no longer permanently disables retries on quickPublishError. After an upload transport failure, it permits a safe retry only for the exact same untouched server draft (version 0, no committed attachments/revision) and reuses the same per-file upload clientRequestId values. If any revision was committed, the existing safe draft editor route remains the recovery path.
- The error now identifies media-transfer failure separately from uncertain publish acknowledgments; successful publication still requires Core's authoritative response, not optimistic navigation.
- Full browser-authenticated photo to processing Job to rendered CDN/S3 URL has not been demonstrated by this S3 transport smoke test; do not count the production job pipeline as PASS.
- Local MinIO is a non-production development dependency. When starting the local Hono/Vite stack anew, verify the local server is actually listening and healthy before exercising photo/video flows; never fall back to production S3.


## 29.10.2026 — устранена зависшая обработка комментариев в изолированном WORK окружении

### Диагностика
- На WORK PG 127.0.0.1:55921/gafus_refactor_real_work_20261024 две опубликованные фотографии комментариев были в FeedMediaAsset.status=uploaded; связанные задачи FeedStorageJob.kind=publish_photo имели status=pending, attempts=0. Загрузка исходников в локальное MinIO была успешной; фоновый Feed V2 worker отсутствовал.
- Изолированный API, Redis, MinIO и Web отвечали. Никакие Cloud.ru Jobs, production S3/CDN, production PostgreSQL, Main и production API не использовались.
- В старом локальном снимке присутствовали ещё задачи очистки HLS с ключами не из нового media/v2 формата. Их выполнение строгим V2 worker запрещено. Они остаются отдельной задачей техдолга (согласованная ручная безопасная миграция/удаление при необходимости), но больше не блокируют новые V2 публикации.

### Реализация
- scripts/refactor/local-feed-media-worker.ts: локальный worker на исходном Feed Media V2 engine (Sharp/FFmpeg). Имеет два независимых канала photo/video, опрашивает текущие задачи и вызывает оригинальные Core claim/complete/fail/renew; изолирован на WORK PG и локальное MinIO. Строгие условия: localhost 55921 и 9000, конкретная WORK БД и test bucket, запрет внешних S3 credentials.
- scripts/refactor/local-feed-media-worker-run.py: безопасный запуск без переноса паролей на командную строку, только после проверки запущенного изолированного API. Команда из корня Refactor: python3 scripts/refactor/local-feed-media-worker-run.py --serve; --once — разовая обработка, --verify — read-only проверка текущих комментариев и подписанных WebP.
- В packages/core/src/services/feed/jobs.ts для внутреннего локального worker добавлен дополнительный необязательный scoped exactMedia в claim. Публичный HTTP контракт не меняется. Позволяет получить lease ровно на один допустимый media job без случайного захвата устаревших HLS cleanup rows. Другие ограничители, попытки и идентификация владельца сохранены.
- В Web компонент MomentCommentMediaProcessing показывает предупреждение после 5 минут ожидания без готовности, убирает бесконечно бегущую полосу и сообщает, что комментарий сохранён. Запросы статусов продолжаются; при ready вложение отображается автоматически.

### Фактические результаты
- Разовый запуск локального engine поднял две фотографии комментариев из uploaded в ready и создал по 3 варианта WebP.
- Read-only проверка через оригинальный createFeedSocial.getComment подтвердила **2** DTO с media.status=ready и корректными подписанными URL. Настоящий HTTP GET по каждому подписанному URL из локального MinIO вернул 200 и заголовок WebP RIFF...WEBP.
- Локальный durable worker --serve запущен в отдельной сессии для новых задач. Он ограничен временем исполнения сессии, не является автоматически запускаемым системным демоном; после следующего запуска всего локального стенда его нужно запускать отдельно.
- Web комментарии/ответы: 60 тестов PASS (в том числе обработка задержки). Core jobs: 20 PASS, comment media service: 3 PASS; @gafus/core и @gafus/web-vite typecheck PASS.
- Playwright MCP отвечает HTTP 429, поэтому отдельного визуального подтверждения в Chromium в этом прогоне нет. Production готовность по этому локальному доказательству не объявлять.

### Неизменённые ограничения
- GAFUS Main, production БД, миграции, S3/CDN, Cloud.ru Jobs и deploy не затронуты. Для production нужен отдельный контроль соответствия runtime и remote worker, не использовать локальные привилегии для production.

- Дополнительная защита Core: при переводе комментарийного медиа в READY не активировать независимую редакцию родительского поста; при исчерпании попыток обработки не переводить родительский пост в failed. Два новых unit-теста. Локальный worker перезапущен с этой актуальной логикой.
