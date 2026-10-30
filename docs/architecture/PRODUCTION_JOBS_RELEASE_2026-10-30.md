# Production jobs: состав и условия выпуска, 30.10.2026

Проверенный HEAD: `d083d382248ea81b5278da52df6cf518e73448ca`. Статус: выпуск не подтверждён. Документ фиксирует source/deploy contracts, не фактическое состояние облака.

## Обязательный состав

`packages/worker/src/index.ts` запускает push, reengagement, video-transcoding, consent/exam cleanup, pet prevention reminders, consultation mail/reminder/SLA, Chat2 outbox и media triggers Gallery/Feed/Chat2/Questions. `cron-scheduler.ts` регистрирует mail outbox/monitor, Gafus notifications, Smart Feed, account cleanup, CDN purge, training reminders, subscription reconciliation/renewals, NPD и consultation recovery. Часть задач включается только флагами. Production Dockerfile запускает этот index; отдельный системный cron для этих обработчиков не требуется.

Cloud.ru inventory по dispatcher:

| Направление | Имена Jobs |
| --- | --- |
| Gallery | `gafus-gallery-process`, опционально `gafus-gallery-process-2` |
| Feed photo | `gafus-feed-photo`, `gafus-feed-photo-2` |
| Feed video | `gafus-feed-video`, `gafus-feed-video-2` |
| Questions | только `gafus-questions-photo`; не создавать вымышленный `-2` |
| Chat2 photo | `gafus-chat-photo`, `gafus-chat-photo-2` |
| Chat2 video | `gafus-chat-video`, `gafus-chat-video-2` |

Это 11 поддерживаемых имён, включая опциональный Gallery slot; не утверждение о 11 развёрнутых Jobs в одном проекте. Chat2 dispatcher требует отдельную проверенную конфигурацию проекта. Квоты проверять по реальному целевому проекту.

## Найденные незакрытые условия

1. Основной `production-media-release.mjs` обновляет Gallery/Feed origins и базовые пять Gallery/Feed Jobs. Он не покрывает автоматически весь dispatcher inventory. Chat2 имеет отдельный `chat2-job-provision.mjs`; Questions и дополнительный Gallery требуют явной сверки существующего provisioning/release пути.
2. Worker environment в `docker-compose.prod.yml` не передаёт весь набор настроек dispatcher/cron: в частности Chat2 V2 media/project, Questions V2 и Gafus notifications. Feed dispatcher также требует `FEED_CLOUDRU_REFRACTOR_VERIFIED`, отсутствующий в этом environment. Наличие кода в образе не включает эти пути.
3. Сверить цепочку GitHub vars/secrets → deployment-generated .env → Compose → process.env. Не выставлять VERIFIED=true без фактической проверки. Секретные значения в отчёт не записывать.
4. Для каждого внешнего Job подтвердить существование, актуальный immutable image digest, команду, CPU/RAM/timeout, S3/IAM, endpoint/HMAC, разрешающие флаги и изолированный запуск с результатом в API/DB. Проверить отсутствие дубликатов и корректность leases/retries.
5. Только затем включать соответствующие readiness-флаги; подтвердить worker bootstrap, расписания, реальную обработку и recovery. Одна health-проверка этого не доказывает.

## Сборка и выпуск

- CI нового main `41081883967` отменён на установке зависимостей; build-apps и build-images не выполнены. Причина отмены этим аудитом не установлена.
- В repository variables отсутствует `GAFUS_REFACTOR_PRODUCTION_CUTOVER=approved`; production stages защищены этим условием. Environment-scoped variables отдельно не проверены.
- Static Chat2 broker/proxy/Compose contract PASS; candidate/live readiness этим не подтверждена.
- В предшествующих локальных отчётах есть успешные API/Worker linux/amd64 builds и isolated message E2E; нужны remote builds/digests именно release HEAD.
- `docs/qa/CURRENT_RELEASE_STATUS.md` содержит READY=NO, незакрытый security audit (исторически 1 high Zod3), native/offline/provider acceptance. Свежий audit в рамках этого inventory не выполнялся.

До заявления о готовности: полный CI release SHA, сборка всех production images и registry digests, актуальный security audit, миграции на изолированной копии, закрытый job inventory/env и Chat2/QA release gates. Автоматически включать production cutover по наличию main нельзя.
