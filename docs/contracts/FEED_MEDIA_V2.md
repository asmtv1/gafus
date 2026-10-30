# Feed Media V2 — «Моменты» GAFUS Refactor

Проверено 2026-10-28, разрешённый Git-корень `/Users/asmtv1/Desktop/gafus-refactor`, ветка `vite`. Production и GAFUS Main не затронуты. Источник истины — локальный исходный код и приведённые тесты, не удалённые планы Chat 2.0.

## Аудит и изменения

| Компонент | Состояние до изменения | Сделано | Чем проверено |
|---|---|---|---|
| Загрузка | Web и Mobile уже получают подписанный POST прямой загрузки в выделенный Feed S3 | Использован существующий API; второго конвейера не добавлено | Реальный изолированный S3/Postgres E2E |
| Изображения | Sharp WebP S/M/L: 360/720/1440 по **максимальной стороне** | Web `srcset` теперь учитывает фактическую ширину портретного WebP | Web unit, Sharp E2E |
| Видео | MP4 H.264/AAC faststart, WebP poster, no Feed HLS | Только MP4 360p/720p в активном worker; `superfast`, `-threads 1`, `-threads:v 2`, последовательные качества | FFmpeg/MinIO E2E с двумя MP4 |
| Очередь | PostgreSQL `FeedStorageJob`, BullMQ wakeup, leases, CAS | Атомарный захват под `FOR UPDATE SKIP LOCKED` + CAS | Core tests, реальная локальная PG |
| Диспетчер | 2+2 Cloud Feed pools, периодический запуск даже без задач | Recovery читает due-задания PG, 0 облачных запусков на пустой очереди; до 2 photo + 2 video | Worker unit 5 cases |
| Worker S3 | GET один раз, на каждый PUT дополнительный HEAD | Проверяемый `Content-MD5` и ETag позволяют пропустить HEAD успешного PUT; при конфликте HEAD сохраняется | MinIO E2E, типизация |
| READY | Core доверял перечню ключей из callback | Core независимо HEAD-проверяет все WebP, poster и MP4 перед READY | Core regression, MinIO E2E |
| Удаление | Source cleanup была после истечения presigned POST | Сразу после READY + идемпотентный повтор после срока действия POST | Core regression |
| Ошибка | FAILED без полной уборки частичных результатов | Долговечный `delete_keys` на source + ожидаемые outputs после max retries, с задержкой 11 минут для защиты от запаздывающего FFmpeg | Core regression |

## Рабочая цепочка

Web/Expo Mobile → авторизация и резервирование медиа в Backend → signed POST напрямую в Feed S3 → HEAD исходника/ETag → PostgreSQL QUEUED и BullMQ wake-up → 2 Photo/2 Video Cloud Job pool по **фактически due записям** → атомарный SKIP LOCKED claim + уникальный attempt token/lease → GET source один раз → Sharp (3 WebP) или FFmpeg (poster + MP4 360/720) → immutable S3 PUT → независимая Core HEAD-проверка результатов → READY → активация целой публикации → `cleanup_source` сейчас и после expiry URL. При терминальной ошибке — durable outbox удаления частично созданных outputs и source.

Ключи source: `posts/<ownerId>/<postId>/incoming/<uploadId>/source.<extension>`; финалы: `media/v2/<mediaId>/v1/image/{s,m,l}.webp`, `media/v2/<mediaId>/v1/poster.webp`, `media/v2/<mediaId>/v1/video/{360,720}.mp4`. Feed и Chat 2.0 имеют раздельные S3 credentials/buckets/queues/Jobs и доступы. Обработчик Chat 2.0 при этой работе не меняли. Photo 1080/1440 решение не пересматривали: существующие три WebP нужны Web/Mobile; фактические размеры определяются длинной стороной (у портрета 1200×2400 variant 360 имеет ширину 180). Parser допускает MP4 1080 только по существующему контракту, но новый Feed Worker её больше не кодирует до реальных измерений.

## Логический бюджет S3

Для каждого одного изображения (3 WebP) и одного видео (poster + 2 MP4) при успехе без конфликтов: 1 Client POST source; 1 Core HEAD source; 1 Worker GET source; 3 Worker PUT variants; **0** дополнительных Worker HEAD после успешного проверенного PUT; 3 Core HEAD variants; 1 DELETE original после READY и второй идемпотентный DELETE после истечения signed POST. Итого **11 логических S3 операций на медиа** в этом частном сценарии, без GET конечного пользователя, retry, CDN и eventual consistency. Из них 7 относятся к worker+Core готовности (1 GET + 3 PUT + 3 HEAD). Старый worker делал дополнительно по 3 HEAD на PUT, но независимых Core HEAD для READY тогда не было. Поэтому снижение числа HTTP вызовов и задержки end-to-end **нельзя считать доказанным** без сетевых замеров SDK/Cloud.ru.

## Приёмочные доказательства

- Core jobs unit: **17 PASS** (lease, idempotency, READY HEAD, source-cleanup, final partial cleanup, expired lease).
- Worker Cloud dispatcher + Chat2 recovery + Feed recovery: **27 PASS**, включая 5 новых Feed recovery.
- Web media renderer: **3 PASS**, включая портретное `srcset`.
- Проверки типов Core, Cloud runtime, Worker, API, Web и Mobile: PASS; Web Vite production build: PASS (только предупреждения о размере chunks).
- Тест в новой временной базе PG и **собственном локальном MinIO**: PASS exit 0. Две синтетические публикации, 3 WebP и **2 MP4**, реальные подписанные загрузка/получение, `Range 206`, READY только после HEAD, удаление собственной БД и тестовых S3 объектов; рабочий PG снимок не изменился.

## Общий лимит пяти Web-загрузок (дополнение 2026-10-28)

В Web `momentUploadPool` уже ограничивал отдельную публикацию пятью POST, но параллельные редакторы могли каждый создать собственный пул. `feedMediaTransfer.ts` теперь использует **один FIFO-семафор на вкладку** для `uploadMomentPhoto` и `uploadMomentVideo`: не более 5 операций `reserve → S3 POST → Core complete` одновременно независимо от количества редакторов. Слот захватывается **до резервирования** подписанной формы, чтобы срок её действия не истекал в очереди; слот возвращается и при исключении S3/Core. Порядок прикрепления медиа в ревизию по-прежнему задаёт редактор, а не порядок завершения загрузок. Expo Mobile уже использовал общий пул в `publication-client.ts`, его код не меняли.

Проверено: `feedMediaTransfer.globalSlots.test.ts` (2 новых теста: 9 конкурентных фото/видео из независимых вызовов и освобождение слота после HTTP 503), `feedMediaTransfer.test.ts` (9), `momentUploadPool.test.ts` (3); вместе **14/14 PASS**. `@gafus/web-vite` typecheck, production build, ESLint изменённых файлов и `@gafus/mobile` typecheck — PASS. Web сборка сохраняет прежние предупреждения о больших чанках и динамическом импорте; функциональная ошибка сборки отсутствует. Для фактической пропускной способности и поведения iOS/Android физические устройства и сеть остаются отдельными воротами.

## Long video, private S3, portrait and bitrate optimization (2026-10-28)

The strictly opt-in `apps/api/src/test/feed-v2-fresh-db-full-media.e2e.ts` now supports video durations 1/30/120 seconds (`GAFUS_FEED_V2_E2E_VIDEO_SECONDS`) and landscape/portrait images (`GAFUS_FEED_V2_E2E_PHOTO_SHAPE`). Real private local PostgreSQL and MinIO E2E PASS for 30s and 120s. For a 1200x2400 portrait source the three signed WebP downloads decoded to 180x360, 360x720 and 720x1440. Both photo and MP4 unsigned S3 GET returned 403; signed 360p MP4 Range 206 and invalid Range 416; no 1080p file was stored. READY, SKIP LOCKED exclusive claim, immediate source deletion, and exact own PG/S3 cleanup remained verified.

Feed worker now exclusively opts in to H.264 `capped-crf` (CRF 23, existing per-resolution maxrate/bufsize, AAC, faststart), rather than fixed average `-b:v`; the underlying shared encoder retains the previous ABR default for all other callers. Chat 2.0 codec invocation was not changed. No Feed HLS branch or second video delivery path was created. Unit and integration tests verify the explicit opt-in and unchanged default.

| Synthetic 120s source (1280x720, 24fps + audio) | Before | After Feed capped CRF |
|---|---:|---:|
| 360p MP4 + 720p MP4 + WebP poster | 28,673,334 bytes | 7,157,232 bytes |
| Local media job total | 8,087 ms | 6,710-6,897 ms (separate runs) |
| Source size | 2,519,219 bytes | 2,519,219 bytes |
| 720p SSIM vs source | Not measured | 0.999428 |

Additional 30s optimized run: combined output 1,788,792 bytes, job time 2,076 ms and 720p SSIM 0.999442. SSIM is obtained by downloading the full signed 720p MP4 and comparing it with the synthetic original through FFmpeg; both durations passed a conservative 0.95 threshold. These are NOT user-content tests, visual approval, 2-vCPU Cloud benchmarks, Beget CDN measurements, or physical Web/Mobile acceptance. Real scenes, HDR, high motion, vertical recordings, and actual Cloud Job quotas still require final verification.

Reproduce only with verified project-only PG18 and private MinIO: `GAFUS_FEED_V2_EPHEMERAL_E2E=1 GAFUS_FEED_V2_E2E_VIDEO_SECONDS=120 GAFUS_FEED_V2_E2E_PHOTO_SHAPE=portrait pnpm --filter @gafus/api exec tsx src/test/feed-v2-fresh-db-full-media.e2e.ts`. The script enforces exact project root and isolated resources; it creates only its own random database and test S3 objects and removes both after completion. No Cloud.ru/Beget or GAFUS Main access occurs.

## Не завершено / внешние приёмочные ворота

- Никаких Cloud.ru Jobs не изменяли и не запускали. Названия 2+2 есть в коде; фактические права, квоты, назначение Jobs, CPU/RAM, тайм-ауты и реальное облачное развертывание **не подтверждены**. Существующий скрипт `infra/cloudru/prepare-feed-job-pools.mjs` явно ожидает у этих имен `FEED_INTERNAL_BASE_URL=https://api.gafus.ru` — это потенциально действующие production Jobs. Поэтому добавлен обязательный fail-closed guard `FEED_CLOUDRU_REFRACTOR_VERIFIED=true` (оператор только после реальной проверки отдельной dev-инфраструктуры) для Feed Cloud dispatch; отсутствие флага не останавливает изолированные локальные unit/E2E. Production Cloud.ru не трогать.
- Внешний Beget CDN edge: signed/expired URL, Range 206/416, cache-hit, ограничение доступа и TTFB не проверялись.
- Нет реальных чисел времени загрузки→READY, CPU/RAM и сравнения до/после на настоящих пользовательских вертикальных фото и 30–120-секундных видео.
- Нет сквозного физического iOS/Android E2E и GUI Web Playwright с загрузкой, процентом, остановкой, опросами/комментариями, 5 одновременными загрузками.
- Не удаляли HLS иных продуктов: есть связанные с офлайн-обучением тесты и код; нельзя сносить их как старый Feed без аудита.
- До принятия Cloud, CDN и устройства это **локально проверенный конвейер**, не полная реализация всех 25 критериев пользовательского плана.

Никаких commit, push, production deployment, production S3/DB/CDN изменений не выполнялось.

## Численные замеры локального синтетического E2E (не пользовательский benchmark)

Новая агрегированная `FEED_MEDIA_V2_METRIC` в `apps/feed-cloud/src/worker.ts` публикует **только числовые** размеры, тайминги, CPU основного Node-процесса и RSS на момент завершения. Job identifiers, S3 keys, подписанные URL и токены отсутствуют. Ошибка метрик не меняет транзакционное состояние READY. FFmpeg запускается **отдельным процессом**, поэтому значения `cpuUserMs`/`cpuSystemMs` не включают CPU самого FFmpeg; `rssAtCompletionBytes` не является пиковым RSS.

| Synthetic fixture | Source bytes | Outputs | Output bytes total | Download | Process | S3 outputs upload | Core HEAD/commit | Media job total |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| JPG-like local photo 640×360 | 1 503 | 3 WebP | 1 222 | 4 ms | 27 ms | 5 ms | 24 ms | 60 ms |
| 1 second MP4 1280×720 | 29 128 | WebP poster + MP4 360/720 | 137 443 | 2 ms | 454 ms | 5 ms | 18 ms | 480 ms |

Измерялось при успешном повторном E2E 2026-10-28, private MinIO + локальная PostgreSQL. Synthetic input может вести себя совершенно иначе, чем реальные фото/видео: **не экстраполировать эти цифры на Cloud.ru, 120-секундные ролики, CDN или реальные устройства**. От загрузки/выбора файла до READY здесь не измерено. В том же E2E два параллельных claim PostgreSQL для каждого медиа дали ровно одного победителя (`exclusiveParallelPostgresClaims=true`).
