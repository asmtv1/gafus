# Медиа — архитектура, обработка, выдача и Cloud.ru

Сверено со структурой исходников 29.10.2026. Фактическое состояние внешних Cloud.ru Jobs, S3 и Beget CDN **не проверялось** в рамках документирования.

## Путь файла

Клиент → HTTP API → проверка владельца и лимитов → enqueue/job request → обработчик фото/видео в Cloud.ru → S3 object → Beget CDN → Web/Mobile. Предусмотренный конкретным доменным контрактом S3 fallback при деградации CDN требует безопасной проверки; не считать доказанным только по архитектурной схеме.

Главный [контракт без VM](../contracts/MEDIA_PIPELINE_NO_VM.md); [CDN read-only contract](../contracts/LIVE_MEDIA_CDN_READONLY.md). Обрабатывать изображения (Sharp), видео (FFmpeg), статус и recovery в соответствующих воркерах и jobs. Не создавать параллельный legacy-путь без отдельного решения.

## Справочник доменов

| Область | Актуальный контракт | Реализация |
|---|---|---|
| «Моменты» фото/видео | [Feed Media V2](../contracts/FEED_MEDIA_V2.md) | `apps/feed-cloud`, `packages/feed-cloud`, `packages/feed-server`, `packages/feed-storage`, `apps/api/src/routes/v1/feed.ts` |
| Фотоальбомы | [Gallery Media V2](../contracts/GALLERY_MEDIA_V2.md) | `apps/gallery-cloud`, `packages/gallery-server`, `packages/gallery-storage` |
| Вопросы | [Questions Media V2](../contracts/QUESTIONS_MEDIA_V2.md) | `packages/questions-server`, `packages/feed-cloud/src/questions-v2.ts`, `apps/api/src/routes/internal/questions-media-jobs.ts` |
| Chat 2.0 media | [Chat2 Media V2](../contracts/CHAT2_MEDIA_V2.md) | `packages/chat-server`, `packages/feed-cloud/src/chat2-v2.ts`, `apps/api/src/routes/internal/chat2-media-jobs.ts` |
| Видео курсов/offline | [Video access](../packages/video-access.md), [Mobile](../apps/mobile-rn.md) | `apps/api/src/routes/v1/offline.ts`, `apps/mobile` |

Повторно проверено 29.10.2026: на исходном 5173 исправлена выдача локальных WebP после обновления устаревшего Core dist и перезапуска локального 3001; старое legacy-фото из другой среды обозначается UNAVAILABLE. Подробности в [Questions Photo V2 local acceptance](../qa/QUESTIONS_PHOTO_V2_LOCAL.md).

Локальный QA для фото вопросов (изолированные Web 5507, Hono 3002, MinIO и Sharp): [Questions Photo V2 local acceptance](../qa/QUESTIONS_PHOTO_V2_LOCAL.md). Обычный Web 5173/API 3001 эта проверка не переключает.

Для «Моментов» целевой формат видео — единый MP4 без HLS feed; не переносить старую HLS-документацию в новый pipeline. Фотографии вопросов используют согласованную публичную S3/CDN-доставку. Права доступа к личным перепискам Chat 2.0 остаются серверными, публичный media URL не отменяет ACL текстов.

Удаление: DB → объектное хранение → отзыв CDN, с durable ledger/retry. [Account storage cleanup](../features/account-storage-cleanup.md).

## Разрешённые Cloud.ru Feed Jobs

Cloud.ru project ID: `4c590727-4133-475b-a4bc-564c90a9e686`. Registry: `gafus.cr.cloud.ru`.

- `gafus-feed-photo` и `gafus-feed-photo-2`: по 1 vCPU / 2 ГБ.
- `gafus-feed-video` и `gafus-feed-video-2`: по 2 vCPU / 8 ГБ.

Для этих **четырёх существующих Jobs** отдельно разрешено обновлять images/config и проверять, предварительно сохраняя image digest, прежние ресурсы и rollback. Разрешение не распространяется на production PostgreSQL, S3/CDN, другие jobs и production frontend/backend deployment.

Протоколы проверок: [Feed local acceptance](../contracts/FEED_MEDIA_LOCAL_ACCEPTANCE.md), [release readiness](../qa/RELEASE_READINESS.md).

## Beget 410 и безопасный fallback

Подтверждённый HTTP 410 Gone на подписанном CDN URL теперь запускает одноразовую попытку штатного media-specific fallback, если Hono заново подтвердит право видеть именно этот объект. Неизвестные/неподписанные URL отвергаются. HTTP 403/404 не инициируют S3 fallback; 410 не открывает circuit breaker всего CDN. Browser HEAD проверяется через аутентифицированный same-origin proxy. Доступность внешнего Cloud.ru/Beget по-прежнему требует read-only smoke.

## Sharp security consistency across Cloud media Docker images

Feed Cloud, Gallery Cloud and CDN-upload runtime packages use Sharp 0.35.5, with matching Linux x64 libvips optional dependency where declared. In addition, the five real worker/auxiliary image Dockerfiles have eight explicit `sharp@0.35.5` install pins; this avoids reverting to the vulnerable 0.34.3 while preparing Cloud.ru Container Jobs. `node scripts/qa/check-media-docker-sharp-version.mjs` is the CI guard. Local Sharp WebP/AVIF conversions and FFmpeg H.264/AAC encode tests passed; actual cloud S3/CDN/Jobs remain separate, protected provider tests.

## Local Linux worker/origin validation

Feed Worker and Origin as well as Gallery Worker and Origin have each been built locally for Linux AMD64 after the Docker copy/alias fixes. The `scripts/qa/refactor-cloud-media-images-offline-smoke.sh` test verified Node syntax, native Sharp 0.35.5 WebP/AVIF and FFmpeg with network disabled, 4/4 PASS. These are local readiness checks only: Cloud.ru Registry SHA256, live Job revisions/statuses, actual S3/CDN delivery and rollback still require separate provider access and production-safe observability.
