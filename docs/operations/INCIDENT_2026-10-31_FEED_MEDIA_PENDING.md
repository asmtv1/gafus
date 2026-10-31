# Incident: «Моменты» — публикация с вложениями зависает в обработке

Дата проверки: 2026-10-31. Рабочая директория: только GAFUS Refactor.

## Подтверждённое production состояние до вмешательства

- `https://api.gafus.ru/health`: HTTP 200; существующий `/internal/feed/jobs/claim` без подписи: HTTP 401, то есть endpoint существует и защищён.
- Read-only GitHub Actions run `41184427313` (production `mode=diagnose`): API и Worker healthy, без рестартов и OOM. Флаги `CLOUDRU_MEDIA_JOBS_ENABLED=true`, `FEED_CLOUDRU_REFRACTOR_VERIFIED=true`, `FEED_ENABLED=true`. В API логе есть HTTP 200 на `/internal/feed/jobs/fail`.
- В Cloud.ru у всех четырёх Feed Jobs статус `ready`; однако Cloud job log `gafus-feed-photo` и `gafus-feed-photo-2` за 31 октября многократно содержит `FEED_CLOUD_INVOCATION_FAILED`.
- Код предыдущего образа скрывал причину за этой одинаковой строкой и не позволял различить вызов Core, загрузку исходника из S3, обработку Sharp/FFmpeg, загрузку результата или callback.
- До проверки изменяемых задач текущий образ: `gafus.cr.cloud.ru/gafus-feed-worker@sha256:26fe7a6011930877eb76459e7c6d5a68895387ec027988b7fc40fab4b8da0de0`.

## Сохранённый откат

Полные конфигурации **всех четырёх** Jobs сохранены перед любыми Cloud.ru изменениями в `.local-pg-scratch/cloudru/feed-live-rollback-20261031/`, режим каталога 0700, файлов 0600. Файлы содержат конфиденциальные переменные окружения и **запрещены к Git/логированию/публикации**. Включают digest предыдущего Docker-образа, env, resource/timeout и logging service. Фото: `gafus-feed-photo`, `gafus-feed-photo-2` (1 vCPU, 2048Mi, timeout 240); видео: `gafus-feed-video`, `gafus-feed-video-2` (2 vCPU, 8192Mi, timeout 650).

## Локальная подготовка

В `apps/feed-cloud/src/server.ts` добавлено строго ограниченное логирование этапов `maintenance/claim`; в `apps/feed-cloud/src/worker.ts` — `download/transform/upload/complete/cleanup` и классификации только по allowlist. SDK error objects, signed URLs, ключи объектов и секреты в журнал не выводятся. Никакие production PostgreSQL, S3/CDN, приложение или другие Jobs не затрагиваются этой правкой.

Локальные проверки: `@gafus/feed-cloud-runtime` typecheck PASS; build PASS (2026-10-31); `src/worker.test.ts` 12/12 PASS.

## Статус

Окончательный результат требует подтверждения причины по безопасным журналам Cloud.ru, проверки доступности новых обработчиков и пользовательского перехода pending -> published/failed. Статус `ready` у Container Job не является доказательством успешной обработки.

## Выполненное обновление Cloud.ru

- Собран `linux/amd64` Docker-образ с новыми безопасными диагностическими метками этапов.
- Исходный образ проверен локально под платформой `linux/amd64`: FFmpeg 5.1.9, Sharp WebP кодирование/декодирование, bundled server, non-root `node`. Локально `src/worker.test.ts`: **13/13 PASS**, включая тест на отсутствие утечки URL/signature; `typecheck` и `build` — PASS.
- Опубликованный тег: `gafus.cr.cloud.ru/gafus-feed-worker:feed-v2-incident-20261031-diagnostic-a1`.
- SHA-256 digest Registry: `sha256:0fdca7bea758c2469d639f3f9b3e3a78dfa71bcb787ab4218426e407027f9176`. Проверен удалённый OCI manifest (`linux/amd64` плюс attestation).
- Успешно обновлены **только** `gafus-feed-photo`, `gafus-feed-photo-2`, `gafus-feed-video`, `gafus-feed-video-2`. На каждом проверен статус `ready` и digest, CPU, memory, timeout и сохранность переменных окружения, логирование. Cloud.ru не создавал новых Jobs. Никакие production API/Worker/Frontend, DB, S3/CDN, DNS или GitHub Actions configuration не изменялись. `runImmediately=false`; обработчики вручную не запускались.
- Результаты Cloud.ru PATCH, polling и полного подтверждения: `.local-pg-scratch/cloudru/feed-live-rollout-20261031.log` (без секретов). Откат: вернуть **точный образ** `gafus.cr.cloud.ru/gafus-feed-worker@sha256:26fe7a6011930877eb76459e7c6d5a68895387ec027988b7fc40fab4b8da0de0` по сохранённым полным конфигурациям из `.local-pg-scratch/cloudru/feed-live-rollback-20261031/` на четырёх Jobs, с `runImmediately=false`, после каждого PATCH проверить `ready`, image digest и точное сохранение env/resources/timeout. Старый образ в Registry сохранён.

## Дополнительное read-only исследование production

- 2026-10-31, read-only `SELECT` production PostgreSQL (AI Commander): за 24 ч один `publish_photo` job = `failed`, `MEDIA_PROCESSING_FAILED`, **5 attempts**. Сопряжённая публикация, ревизия и медиа = `failed/failed/failed` (примерно 22 мин после создания на момент SELECT). В очереди также 1 `delete_keys/pending`. Это подтверждает фактическую неудачу обработки, а не только бесконечную UI-анимацию. Не выводились id пользователей/публикаций, содержимое поста или секреты.
- Проверены Cloud.ru S3 с credentials Фото Job, исключительно read-only `HeadBucket`, `ListObjectsV2`, `HeadObject`: все SUCCESS. Это **не доказывает** разрешение на запись и не доказывает доступность исходника конкретной неудачной задачи.
- В первые минуты после установки нового диагностического image не было новых organic Job executions/logs, поэтому новая подробная ошибка ещё не получена. **Первопричина не подтверждена, новый image сам по себе не гарантирует успешность публикации.** Для достоверной причины нужен безопасный лог следующей реальной обработки и окончательное подтверждение `ready/published` по серверу.
- Гипотеза для следующей проверки: `If-None-Match: *` при `PutObject` в Cloud.ru; официальная документация Cloud.ru для PutObject не перечисляет этот заголовок, и ответ `501 NotImplemented` возможен для неподдерживаемых заголовков. Это **гипотеза**, её нельзя лечить простым удалением условия записи, нарушая защиту immutable media. Новый лог предоставляет HTTP-статус и фазу `upload` для проверки без вывода ключей S3. Документация: https://cloud.ru/docs/s3e/ug/topics/api__headers-request и https://cloud.ru/docs/s3e/ug/topics/api__response-codes.

**Итоговая приёмка проблемы: НЕ ПОДТВЕРЖДЕНА.** Новые обработчики здоровы и диагностируемы, однако ни одна новая реальная публикация не прошла через них до `published` в ходе текущей проверки. Existing failed job не сбрасывался и production данные не изменялись вручную.

## Дополнительная проверка конкретного сбоя

Read-only JOIN в production PostgreSQL подтвердил для неудачного `publish_photo`: `FeedPost.status=failed`, `FeedPostRevision.status=failed`, `FeedMediaAsset.status=failed`, `FeedStorageJob.status=failed`, `attempts=5`, `errorCode=MEDIA_PROCESSING_FAILED`. По полученному из SQL `mediaId` выполнен только read-only S3 `ListObjectsV2` для соответствующего конечного префикса; на момент проверки итоговых вариантов `image/*.webp` там **0**. Это совместимо с ошибкой на этапах скачивания/трансформации/записи, но также может объясняться уже выполненной очисткой после окончательного отказа — **этап ошибки пока достоверно не установлен**. Никакие персональные ключи S3 или пользовательский медиаконтент не скачивались и не выводились.

## Исправление 2026-10-31 — согласованный публичный Feed S3

**Подтверждённая первопричина, обнаруженная после предыдущей диагностической поставки:** на всех четырёх существующих Jobs `FEED_BUCKET_PUBLIC=true` (это корректный, явно одобренный владельцем режим публичного Feed S3). Однако `apps/feed-cloud/src/objects.ts` ошибочно выбрасывал `PUBLIC_MEDIA_BUCKET_REFUSED` до обращения к S3, как только видел `FEED_BUCKET_PUBLIC=true`. В Cloud.ru при этом фиксировались многочисленные `FEED_CLOUD_INVOCATION_FAILED`, API успешно обрабатывал claim/fail, а пользовательские фото-задания достигали 5 неудачных попыток. Отдельные случайные `phase:maintenance` ошибки в логах были, но не являются причиной отказа при корректном публичном Feed S3.

**Исправление:** в `createFeedCloudObjects` разрешён `FEED_BUCKET_PUBLIC=true` без смены bucket policy, не удалены обязательные S3 credentials, не ослаблены проверки Endpoint/ключей и `IfNoneMatch` для защиты immutable публикаций. `GALLERY_BUCKET_PUBLIC=true` по-прежнему вызывает отказ, чтобы не ослаблять правила отдельного Gallery V2. Добавлены `objects.public-bucket.test.ts` (3 случая).

**Подтверждённые проверки:** `@gafus/feed-cloud-runtime typecheck` PASS; `src/objects.public-bucket.test.ts` + `src/worker.test.ts` **16/16 PASS**; сборка `linux/amd64` PASS; внутри Docker образа FFmpeg 5.1.9, Sharp WebP и server bundle PASS. Контракты Cloud.ru release **21/21 PASS**.

**Registry:** `gafus.cr.cloud.ru/gafus-feed-worker:feed-v2-public-bucket-20261031-r1`, `sha256:cbf25f7f60e8f33ff261c6eeeab39f3f89412fc561340cc7f10ad903b5e16a02`; Registry manifest подтверждает `linux/amd64`.

**Реальный Cloud.ru update:** четыре ранее разрешённых Jobs (`gafus-feed-photo`, `gafus-feed-photo-2`, `gafus-feed-video`, `gafus-feed-video-2`) теперь используют ровно новый digest, повторный read-only GET вернул `ready` для всех четырёх. Image-only PATCH, `runImmediately=false`; не создано новых Jobs, env и resources сохранены. Photo 1 vCPU/2048Mi, timeout 240; Video 2 vCPU/8192Mi, timeout 650. Изменений S3 policy, production PostgreSQL, CDN, Backend или приложения нет.

**Откат:** полные конфигурации перед обновлением в `.local-pg-scratch/cloudru/feed-public-rollback-20261031/*.json` (0600, НЕ В GIT); предыдущий image digest `sha256:0fdca7bea758c2469d639f3f9b3e3a78dfa71bcb787ab4218426e407027f9176` сохранён в Registry. Script `.local-pg-scratch/cloudru/feed-public-image-rollout-20261031.mjs` проверил все четыре Jobs и rollback path; безопасный image-only возврат из snapshot возможен. Подробности PATCH в `.local-pg-scratch/cloudru/feed-publicfix-rollout-20261031.log`.

**Синхронизация будущих релизов:** `infra/cloudru/production-job-release.mjs` и контракт закрепления image обновлены на `cbf25f7f…`; GitHub Environment `production` variable `CLOUDRU_FEED_WORKER_IMAGE` изменена на тот же immutable digest и read-back подтверждён. Запускать production app deploy ради замены Jobs не требуется.

**Граница фактической проверки:** новое пользовательское `published` после обновления не подтверждено; старые `failed` публикации из production не переоткрывались, не сбрасывались и автоматически не восстановятся только от замены Docker. Это исправление блокирующей проверки конфигурации, а не подтверждение полного пользовательского E2E.
