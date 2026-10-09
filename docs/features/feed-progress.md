# Лента GAFUS — фактический статус реализации и проверок

Дата проверки: 2026-10-09. План: пользовательский «План реализации „Ленты“ в GAFUS для web и mobile»; функциональный контракт: [feed-contract.md](feed-contract.md).

## Изоляция рабочего дерева

Стартовая ветка `main`, SHA `f475eea47e79cd36fde70d3fb7a18752c5b9504d`, локально опережает `origin/main` на один коммит. **На старте уже были незакоммиченные изменения** меню, профилей, вопросов, галереи, части core/types и Terraform галереи. Их не сбрасывали. В ходе работы с лентой **ни коммитов, ни пушей, ни deploy не было**. Не объединять эти изменения с лентой без отдельного просмотра diff.

Bridge обновился до 2.0.0, ранний блокер `path_changed` на `packages/types/src/index.ts` исчез: `@gafus/types` экспортирует `./feed`. При попытке записать `packages/feed-storage/src/storage.ts` Bridge ответил `policy_denied / unsafe_content_detected` (конфигурация с секретами). Запись не состоялась; контроль не обходили.

## Реально присутствует в репозитории

- **Контракт:** `docs/features/feed-contract.md`; **типы и клиент:** `packages/types/src/feed.ts` + экспорт из `index.ts`; серверные Zod-схемы `packages/core/src/services/feed/schemas.ts`.
- **База:** добавлены 12 Feed-сущностей в Prisma и локальная миграция `20261009072000_feed_initial`. Клиент Prisma сгенерирован, схема валидна. **Миграция ни к одной настоящей PostgreSQL не применялась в рамках текущей проверки.**
- **Core:** каркас постов, ревизий, прав и часового срока, комментариев/реакций/просмотров и записей уведомлений, плюс методы загрузки `getUpload`, `completeUpload`, `cancelUpload`, `retryUpload`. Для album-copy добавлена проверка повторного `clientRequestId`. Логика не подтверждена реальными транзакционными интеграционными тестами.
- **HTTP:** `@gafus/feed-server` + Hono JWT и web NextAuth/CSRF; обработка JSON, no-store, базовые запросы, комментарии/реакции/уведомления, методы состояния/завершения/отмены/повтора upload. **Отсутствуют подписанные внутренние callback и рабочий playback API.**
- **Storage:** `@gafus/feed-storage` содержит проверки допустимых объектных ключей. Реального подписания S3-загрузки, проверки метаданных и CDN-ссылок в подключённой реализации пока нет. Сервер использует fail-closed `unavailableStorage` и статус ленты остаётся disabled, чтобы не выдать неработающую функцию за готовую.
- **Видео:** создан отдельный локальный `@gafus/feed-cloud` с типизированным FFmpeg/ffprobe-преобразованием, проверками контейнера, временной шкалы, выходных HLS-сегментов и постера. **Нет Yandex Serverless Container, очереди, подключения к Object Storage и реального облачного smoke.**
- **Web и mobile:** каркас страниц ленты, поста, создания текстового поста, комментариев, уведомлений; добавлены скрываемые флагом пункты меню, компактный блок 3 постов в своём/чужом профиле и отдельный список публикаций автора. Mobile теперь использует UUID requestId и API FlashList v2. **Нет готового редактора медиа, album picker, камеры/видео, работающего HLS-плеера и всей требуемой UX-проверки.** Временно используется иллюстрация `articles.webp` для пункта ленты, а не отдельная иконка.
- **Push:** запись уведомлений и outbox в core имеется, но worker/delivery/recovery на уровне production не интегрированы.
- **Terraform/DEV/production:** не развёрнуты, не активированы.

## Проверки, выполненные в рабочем окружении

| Проверка | Фактический результат |
| --- | --- |
| `pnpm --filter @gafus/prisma db:generate` | PASS, Prisma 6.10.1 |
| `pnpm --filter @gafus/prisma build`, `prisma validate` с тестовой строкой DATABASE_URL | PASS, синтаксис схемы (без подключения к БД) |
| `pnpm --filter @gafus/types build` | PASS |
| `pnpm --filter @gafus/core typecheck`, `build` | PASS |
| `pnpm --filter @gafus/feed-server typecheck`, `build` | PASS после добавления upload endpoints |
| `pnpm --filter @gafus/api typecheck` | PASS после серверных правок |
| `pnpm --filter @gafus/web typecheck` | PASS с пунктом меню, превью и списком автора |
| `pnpm --filter @gafus/mobile typecheck` | PASS с меню, превью, UUID и списком автора |
| `pnpm --filter @gafus/core test` | PASS: **1036 тестов**, **50 интеграционных тестов пропущены** |
| `pnpm exec vitest run packages/feed-storage/src/keys.test.ts` | PASS: 3 |
| `pnpm exec vitest run packages/feed-server/src/index.test.ts` | PASS: 6 |
| `pnpm exec vitest run packages/feed-cloud/src/video.test.ts` | PASS: 5 |
| `pnpm --filter @gafus/feed-cloud build` | PASS |
| Targeted ESLint web/mobile files | PASS: 0 errors, предупреждения (22 web / 29 mobile) |
| Full ESLint web | **PASS**: 0 ошибок, 145 предупреждений |
| Full ESLint mobile | **PASS**: 0 ошибок, 160 предупреждений |
| PostgreSQL integration, реальный cloud, CDN, web-browser screenshots, устройства iOS/Android, prod | **NOT VERIFIED** |

## Статус 14 этапов

1. Контракт и карта экранов — **частично**, нет уникальной иллюстрированной иконки и визуального утверждения.
2. Типы/валидаторы/время — **основной код + unit-тесты готовы**, без полной интеграции.
3. Схема БД — **локальная миграция написана**, тест PostgreSQL не прошёл.
4. Жизненный цикл поста — **каркас кода**, реальная DB-приёмка отсутствует.
5. Комментарии/реакции/просмотры — **каркас**, concurrency и DB-приёмка отсутствуют.
6. Photo storage и album copy — **частично**, рабочий S3 адаптер и processing не подключены.
7. Video processing/CDN — **локальные чистые модули и unit-тесты**, облако не подключено.
8. Единый HTTP — **публичный адаптер частично**, внутренние callback и playback не готовы.
9. Уведомления — **in-app/outbox частично**, push worker/recovery не готовы.
10. Web UI — **частично**, нет media UI/HLS и браузерной приёмки.
11. Mobile UI — **частично**, нет camera/media, device-проверки.
12. Облачная инфраструктура/сквозной DEV — **не выполнено**.
13. Полная приёмка web/iOS/Android/PostgreSQL/cloud — **не выполнено**.
14. Production rollout — **не выполнено**, FEED_ENABLED должен остаться выключенным.

## Обязательные release-blockers

Реальное приватное хранилище и подпись CDN, закрытый origin, облачный HLS worker с очередями и восстановлением, signed internal HMAC API, воспроизведение через плейлист, полный медиа-редактор, push/outbox worker, миграция в изолированной PostgreSQL, device/web/browser/visual и cloud DEV-smoke, наблюдение расходов. Кроме того, план **исключает UGC complaints/blocking/moderation**, что конфликтует с требованиями App Store Review Guideline 1.2 при публичном iOS-релизе — этот вопрос должен быть решён явно, без скрытого добавления scope.

Никакая из этих недоказанных частей не считается выполненной; текущую ленту выпускать нельзя. Не включать `FEED_ENABLED` / `FEED_PROCESSOR_READY` на production до реальных gate-проверок.

## Продолжение реализации в этом сеансе (перекрывает более ранние частичные статусы)

**Добавлено локально, без пуша:**

- `@gafus/feed-cloud/src/image.ts`: декодированная проверка JPG/PNG/WebP, EXIF orientation, защита от анимаций и 50 Мп, подготовка WebP thumb/full без метаданных; только алгоритм с внедряемым движком, **не облачный deployment**.
- `@gafus/feed-cloud/src/hmac.ts`: подпись внутреннего запроса (исходные байты, timestamp, nonce, whitelist операций) с проверкой clock skew и защитой от повторов через обязательный `NonceStore`. **Не подключено к Redis/HTTP callback в API**, поэтому внутреннее облако не готово.
- `apps/web/src/features/feed/upload.ts`: клиент прямой загрузки S3 POST, проверки MIME/размера и получение статуса; редактор web теперь принимает файлы, позволяет менять порядок, поддерживает пост без текста.
- `apps/mobile/src/features/feed/uploads.ts`: Expo-подготовка фото и видео с HEIC→JPEG, съёмка/библиотека, прямой POST и завершение загрузки; редактор mobile управляет вложениями.
- `FeedAlbumPicker.tsx` на web и mobile: чтение **своих** альбомов, включая скрытые, выбор фотографий, явное предупреждение о публичной копии; редакторы вызывают `copyAlbumPhoto`.
- Web/mobile: редактирование/удаление/реакции на комментариях, ответы с постраничной загрузкой; на web также список приватных незавершённых постов.
- `@gafus/core/services/feed/outbox.ts`: атомарное бронирование задания с attempt-token и lease, backoff/retry, пропуск удалённых постов и отозванных реакций; миграция FeedNotificationOutbox дополнена `leaseUntil`, `attemptToken`, `lastErrorCode`. **Транспорт пушей пока не подключён.**
- `@gafus/core/services/feed/maintenance.ts`: очистка просроченных загрузок и неактивных черновиков через идемпотентные storage jobs, **без зависимости от FEED_ENABLED**. Реальный запуск по расписанию не организован.
- Исправлена коллизия idempotency на `saveRevision`: повтор с тем же ключом и иным текстом/вложениями/версией возвращает конфликт.

**Проверено в продолжении:** `feed-cloud` 15 unit-тестов (video + image + hmac) — PASS; `core/services/feed` 15 targeted-тестов (schemas + outbox + maintenance) — PASS. Web и mobile TypeScript после добавления загрузок, альбомов и комментариев — PASS. Новый Prisma Client с дополнительными полями outbox — сгенерирован. Полный `core test` был прерван: локальный Redis недоступен (`EPERM 127.0.0.1:6379`), четыре **не связанных с лентой** теста консультаций упали по таймауту. После запуска Docker Desktop соединение с Docker daemon по сокету также запрещено. **Тесты PostgreSQL нельзя считать выполненными**.

**Последняя дополнительная проверка:** `pnpm --filter @gafus/prisma build` PASS; `pnpm --filter @gafus/feed-cloud typecheck` и `build` PASS; `git diff --check` PASS. Повторная `pnpm --filter @gafus/core build` в текущем окружении долго не завершалась и была прервана без результата — этот build не отмечается как успешный после новых изменений. Локальная ветка не коммичена и не пушилась.

## Дополнение: защита cloud processing и UX-карусель (последний проход)

- Создан `packages/core/src/services/feed/jobs.ts` — **атомарный claim / complete / fail** для `FeedStorageJob` со сроком аренды, случайным attempt token, CAS при завершении, проверкой границ готовых медиа, транзакционным переходом `media → ready`, активацией только актуальной опубликованной ревизии, retry/backoff и terminal failure для истёкшей пятой попытки.
- Удалён старый незащищённый `completeAsset(postId, mediaId, input)`. Он принимал вызов без принадлежности к текущей попытке, что допускало публикацию устаревшего результата. Новый метод не вызывается из общедоступного API — он ждёт защищённой интеграции.
- Создан `jobs.test.ts`: **7 тестов PASS**, в том числе попытка со старым токеном, удалённый пост, посторонний ключ результата, последняя истёкшая попытка и атомарное завершение.
- Web `FeedMedia`: стрелки карусели + клавиатурная навигация, счётчик, нативный диалог увеличения фото и закрытие по Esc; мобильная кнопка выбора фото из альбомов остается. **Видео пока не играет** — playback endpoint отсутствует.
- Попытка создать защищённый `feed-server/src/internal.ts` снова отклонена Bridge политикой `unsafe_content_detected`. Отсутствующие операции `/internal/feed` не подключались, запрет не обходили. Временные зависимости для попытки интеграции удалены из `feed-server/package.json`, lockfile пересчитан offline.
- Проверки после изменений: `pnpm --filter @gafus/core build` PASS (на новом запуске); `core typecheck`, `feed-server typecheck`, `api typecheck`, `web typecheck`, `mobile typecheck` PASS; Prisma `validate` PASS с **фиктивным** `DATABASE_URL` (без соединения с БД); целевой ESLint для web/feed PASS (0 ошибок, 38 предупреждений); `git diff --check` PASS.
- **Миграции не применялись к PostgreSQL; Yandex DEV/production не изменялись, коммитов/пушей нет.** `FEED_ENABLED` и `FEED_PROCESSOR_READY` оставлены в неактивном режиме. Реальная обработка фото и видео, закрытая выдача HLS, push delivery и end-to-end по-прежнему **не готовы**.

- В `@gafus/feed-cloud/src/playlist.ts` появился **чистый подписываемый HLS-манифест**: индивидуальные подписанные HTTPS/CDN URL сегментов, предел 120 с, проверка сегментов, HLS-тегов и доверенного hostname. Четыре unit-теста `playlist.test.ts` PASS, `@gafus/feed-cloud build` PASS. Подписанный API manifest, origin enforcement и плееры всё ещё не подключены.

**Последний контроль тестов (сводный):** 28/28 тестов `feed-cloud + feed-server + feed-storage`, 22/22 теста `core/services/feed`, итого **50/50 targeted PASS**; `pnpm --filter @gafus/feed-cloud build` PASS, `pnpm --filter @gafus/web typecheck` PASS, `git diff --check` PASS. Это **не** заменяет PostgreSQL/cloud/device/production acceptance.

**Без Docker (2026-10-09):** создан `packages/feed-cloud/src/internal-client.ts`, клиент внутренних POST `claim/complete/fail/maintenance` с инъекцией ключа при запуске, HMAC-подписью каждого запроса, запретом HTTP/редиректов, ограниченными размерами request/response, повтором только временных ошибок и проверкой структуры callback. `internal-client.test.ts`: **6 из 6 тестов PASS**. Сборка `@gafus/feed-cloud` PASS. Этот клиент **ещё не соединён с действующим серверным маршрутом**, реальные cloud-вызовы не осуществлялись. Проверки БД переносятся на DEV/CI вместо локального Docker.

**Релиз по-прежнему заблокирован:** адаптер закрытого S3 storage и CDN, внешняя обработка в Yandex Cloud, очереди и DLQ, подписанный callback на сервере, HLS playback, реальная доставка push, DEV/devices/visual acceptance, production migration/rollout. Bridge ранее отказал в записи storage-конфигурации как `unsafe_content_detected`; этот отказ не обходили. `FEED_ENABLED` и `FEED_PROCESSOR_READY` в production не включать.


## Продолжение 2026-10-09: внутренний API, storage и PostgreSQL (актуальный статус)

Этот раздел заменяет прежние утверждения об отсутствии S3-адаптера, внутренних маршрутов и локальной PostgreSQL-проверки.

- `feed-server/src/internal.ts`: bounded raw-body HMAC dispatcher, строгие команды jobs claim/complete/fail и maintenance. Redis nonce с атомарным NX/PXAT, таймаутом 1 с и fail-closed при отказе. `/internal/feed` подключён в Hono API; готовый cloud internal client теперь имеет серверную сторону. **Не подтверждено внешним cloud-вызовом.**
- `feed-storage/src/storage.ts`: отдельная FEED-конфигурация, реальная AWS SDK подпись прямого POST с фиксированными key/MIME/size/TTL, bounded HEAD с multipart ETag, короткие Yandex CDN-ссылки только для конечных файлов. Адаптер подключён вместо unavailableStorage. **Никакие флаги/секреты/CDN/bucket policies не менялись; настоящий S3/CDN smoke не выполнен.**
- Outbox: исправлен бесконечный повтор задания после истечения lease на пятой попытке. Такое задание теперь терминально failed без новой отправки.
- PostgreSQL 18: миграция ленты реально применена поверх отдельного baseline текущей схемы без ленты; `prisma migrate diff` с итоговой схемой — пустой. **10/10 настоящих DB integration PASS**, включая конкурентные изменения, idempotency, уникальность реакций/просмотров, права, час и активацию обработанного фото.
- Полная историческая цепочка миграций на чистой БД **FAIL** на старой `20241108120000_exam_result_trainer_review` (`ExamResult` не существует). История не изменялась; baseline-тест новой миграции не следует называть успешным bootstrap всей истории.
- Описание подключения и границ: `docs/features/feed-runtime.md`.

Остаются: реальные облачные обработчики и S3 file processing, очереди/DLQ/восстановление потерянного upload completion, подписанный origin и playback API, плееры web/mobile, push delivery и переходы, полная UX/device/visual/cloud приёмка, production rollout. Лента целиком пока **не готова к выпуску**; флаги в production не включались.

Финальная проверка этого продолжения: **104/104 PASS** (15 файлов, включая types и 10 реальных PostgreSQL tests); `feed-cloud build`, `feed-storage build`, `feed-server build`, `core typecheck`, `api typecheck`, `git diff --check` — PASS. После исправления ESM-extension в storage keys test дополнительный targeted прогон — **24/24 PASS**. Временный PostgreSQL-контейнер остановлен/удалён, production и пользовательские БД не затрагивались. Сборки web/mobile и UI в этом продолжении не менялись и заново не проверялись. Коммитов/пушей/deploy не было.

## Продолжение: рабочие обработчики и playback (актуальнее предыдущих разделов)

- Подключены защищённый playback ticket/manifest и web/mobile HLS-плееры, остановка/освобождение ресурсов при потере видимости и переключении. Мобильные источники фото/видео разделены; разрешение микрофона запрашивается перед съёмкой видео.
- Добавлен самостоятельный cloud runtime: Sharp, FFmpeg, ограниченное S3 чтение/запись, immutable файлы, ETag, heartbeat lease и fencing. Отдельный закрытый origin и ZIP сборка. Worker разделяет photo/video claims; Dockerfile подготовлен, image не проверен/не опубликован.
- Recovery потерянного completion, deferred source cleanup, снимок ключей до удаления аккаунта, независимый maintenance и существующие push-транспорты. Порядок блокировок completion/delete согласован post → job.
- Проверки: **121/121 targeted unit PASS**, отдельно **12/12 real PostgreSQL PASS**, **11/11 runtime PASS** с настоящими Sharp/FFmpeg и отрицательными origin-тестами. `feed-cloud`, `feed-storage`, `core`, `feed-server`, standalone runtime builds PASS. Это не доказательство cloud/device delivery.
- Подробности конфигурации/границ: `docs/features/feed-runtime.md`.

Не выполнены: отдельная облачная Feed инфраструктура и очереди/DLQ, настоящие S3/CDN cache-hit/origin/processing проверки, физические устройства и push delivery, точный переход к комментарию, автоматическое продление фото, полная визуальная/UX-приёмка и production rollout. Существующий DEV галереи связан с production API, не переиспользован. Никаких deploy/commit/push/production flags в этом проходе.

Финальный контроль прохода: `core build`, `feed-server build`, `api/web/mobile/worker/feed-cloud-runtime typecheck`, standalone worker+origin build и origin ZIP — PASS; `git diff --check` PASS. После согласования lock order также повторно PASS 17 unit + 12 PostgreSQL tests. Авторизованная лента появилась в браузере, но повторная визуальная проверка разных ширин не завершена: dev-server/auth отвечали с длительными задержками и таймаутами. Пустые снимки не считаются QA. Browser HLS/S3/CDN и UI acceptance не подтверждены. Временные Next/Redis/PostgreSQL остановлены; production не затрагивался.

Origin пока отвечает полным ограниченным объектом; поддержка одиночного Range из плана остаётся открытой вместе с gateway/CDN инфраструктурой.

## Уточнение среды пользователем

Пользователь подтвердил: отдельного тестового сервера нет, проверки выполняются на production. Требование отдельного DEV API/БД из первоначального документа больше не применяется; отсутствие DEV не является блокером. Это не означает, что миграция, инфраструктура или включение Feed уже выполнены. Текущие флаги глобальны; перед ограниченным smoke требуется механизм допуска тестового аккаунта. Незавершённые облачные и продуктовые пункты перечислены выше.

## Production rollout update — 2026-10-09

The owner authorized production testing and visibility for all users. A separate test server is not required. Cloud workers use a dedicated private Feed bucket and queues, while media delivery reuses the existing `gallery-dev.gafus.ru` CDN through its `/posts/…` origin route. No additional CDN DNS record is needed. The certificate challenge CNAME already created for `feed.gafus.ru` can remain; that hostname is not the active media URL.

A fresh PostgreSQL dump was verified through production SSH in GitHub Actions before rollout; Feed tables were absent and there were no failed migrations. Native Sharp/FFmpeg processing passed in an AMD64 container. Application deployment, production queue processing and browser acceptance must be recorded separately after their actual checks; infrastructure creation alone does not establish them.
