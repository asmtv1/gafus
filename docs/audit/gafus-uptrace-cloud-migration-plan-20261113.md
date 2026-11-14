# План перехода GAFUS на Uptrace Cloud

| Подсистема | Уже готово | Не готово | Блокирующие проблемы | Этап |
|---|---|---|---|---|
| Uptrace Cloud | Проект 9378, Viewer API, две синтетические трассы | Реальные сигналы, панели, бюджет и оповещения | Тариф и ACL организации 7251 требуют проверки в аккаунте | A–B, I–J |
| Mobile JS | Expo 57 и Hermes локально, AppTracer, ErrorUtils, очередь GAFUS | Production ingest, ранний fatal, rejection, корреляция | Совместимость старых Store builds | E, G, J |
| iOS Native | AppTracer plugin, MetricKit в зависимости Expo | Ранний сбор, символы, release build и физические краши | Совместимость crash handlers, ограниченные отчёты ОС | F–G, J |
| Android Native | JVM handler и exit records в Expo | ANR/LMK, tombstones и проверенные native stacks | API 24–29 без ExitInfo, API 30 без гарантированного native trace | F–G, J |
| Web, панели, Bull Board | Рабочие entrypoints, общий API client и ErrorBoundary | Ingress, capture, карта точного чанка и старые вкладки | Отдельные origins/CSP и privacy | D, G, J |
| API, Worker, очереди | Частичные traces/metrics и spool в рабочей копии | Production OTLP, коррелированные логи и очередь | В запущенных API/Worker отсутствует OTEL/UPTRACE env | B–C, J |
| VPS, Alloy, БД, Redis | Alloy 1.8.2, четыре экспортёра, YC remote write | Uptrace, Redis scrape, Docker metrics и устойчивый WAL | 1 vCPU, 1 963 MiB RAM и ограниченный диск | B, H–J |
| Cloud.ru, Beget, Centrifugo | Реестр четырёх видео Jobs, media metrics и health | Run-once telemetry, provider metrics и WS health | Два проекта Cloud.ru и точное состояние Beget требуют сверки | C, H, J |
| Yandex Monitoring и аналитика | Отдельный mobile sync. AppMetrica и Web Metrica | Телефонный интерфейс, parity alerts, контроль auto-crash | Авторизованные аккаунты и мобильная проверка | H–L |

## 1. Архитектурное решение

Uptrace Cloud хранит все постоянные диагностические данные. Production использует проект 9378. Staging и preview используют отдельный проект GAFUS Nonprod с разными атрибутами окружения. Development использует локальный sink. Маршрутизация определяется сервером по проверенному источнику и окружению, без DSN в клиентских сборках.

```text
Mobile JS и native bridge → Hono ingress → временный PostgreSQL spool → Worker → Uptrace
Expo Observe → Hono OTLP/JSON adapter → тот же spool / агрегатор метрик → Uptrace
Web / Admin / Trainer / Bull Board UI → same-origin Hono ingress → тот же spool
API / Worker / Bull Board server → приватный Alloy → Uptrace
Cloud.ru Jobs → подписанный Hono ingress → spool / Alloy → Uptrace
Exporters / Nginx / VPS / Redis / PostgreSQL / CDN → Alloy → Uptrace
Внешний watchdog → проверка доступности и свежести → независимый канал уведомления
```

Сохранить GAFUS владельцем JS-ошибок. Использовать Expo Observe для startup/OTA performance и доступных нативных отчётов в новых сборках, с отправкой только в GAFUS. Для iOS добавить PLCrashReporter в BSD-режиме и MetricKit hang/exit signals. Для Android использовать JVM handler Expo и собственный адаптер ApplicationExitInfo для ANR, LMK и tombstone. Для NDK до API 31 проверить Breakpad в тестовой сборке и разрешить только при корректном chaining, стеке и запуске. Выбранная схема переиспользует Hono, Worker, release registry и Alloy. Дополнительный постоянный observability-контейнер на VPS не нужен. Private symbol store хранит артефакты релизов. Спулы и WAL содержат временные данные доставки с TTL.

| Альтернатива | Причина отказа |
|---|---|
| Только Expo Observe | Неполное покрытие ANR/OOM, зависимость доставки от повторного запуска, несовпадение native symbols и отсутствие проверенной поддержки required Web/Worker контракта |
| Expo Observe и JS-очередь без нативных дополнений | Текстового стека Expo недостаточно для точной работы с UUID/Build ID и ряда причин завершения |
| Sentry SDK с Uptrace ingest | Документированы Sentry ingest и JS source maps. Поставка RN native envelopes, dSYM, minidumps, R8 и поведение offline не доказаны. Дополнительный протокол и конкуренция handlers увеличивают риск |
| AppTracer/Expo Cloud как постоянный запасной backend | Создаёт второе хранилище диагностики. Временная отправка допустима только на этапе паритета |
| Self-hosted Grafana/Loki/Tempo/ClickHouse | Увеличивает постоянные расходы RAM, диска и эксплуатации; существующего Alloy достаточно для сбора |

[Expo Observe SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/observe/), [Expo native errors](https://docs.expo.dev/eas/observe/errors/), [PLCrashReporter](https://github.com/microsoft/plcrashreporter), [Uptrace Sentry ingest](https://uptrace.dev/ingest/sentry).

## 2. Проверенный baseline на 13 ноября 2026

- Локально main, HEAD **0dcd18c13c8d567d543d1981b18d3caa52b16503**. В снимке Git 882 изменённых, 213 удалённых и 681 untracked path. Core 620, API 359, Mobile 151, Worker 86, Prisma 32, Docker 15, Web 8, админка и тренер по 7. Это счёт путей, включая параллельные работы, тесты и артефакты. Git из Command Line Tools позволил читать checkout после ошибки системной обёртки Xcode.
- На VPS по SSH подтверждены API, Worker, Web, trainer-panel, admin-panel, Bull Board, Nginx, Centrifugo, Postgres 15, Redis 7, Alloy, node/postgres/redis/blackbox exporters и YC sync. API/Worker из GHCR latest, OCI revision label не задан. Требуется связать digests образов с release manifest.
- На момент замера Alloy 1.8.2 занимал 68,67 MiB и 0,45% CPU, API около 147 MiB, Worker около 435 MiB, YC sync около 13 MiB. Всего 1 963 MiB RAM, 648 MiB available, 131/1 023 MiB swap, примерно 12 GiB свободно на разделе 30 GiB. Это один замер. У Alloy restart unless-stopped, bind /etc/alloy и отсутствие опубликованных портов.
- В production Alloy только YC remote write и пять scrape blocks: node, Postgres, six-service blackbox, Worker mail и media. В локальном Alloy также api_operations. Redis Exporter работает без отдельного scrape в проверенном production config. У API/Worker отсутствовали переменные OTEL, UPTRACE и GAFUS_TELEMETRY. У API/Worker/Bull Board TRACER_APP_TOKEN задан, TRACER_SERVER_ENABLED пуст. NODE_ENV=production сам разрешает отправку при токене по текущему коду. Доставка в AppTracer не проверена. В inspected контейнерах Alloy, Nginx, API, Worker, PostgreSQL и Redis json-file запущен без явных per-container log options; daemon defaults требуют отдельной проверки. [Config Alloy](../../ci-cd/docker/prometheus/config.alloy), [Compose](../../ci-cd/docker/docker-compose.prod.yml), [AppTracer server](../../packages/logger/src/tracerServer.ts#L24).
- Две попытки browser_tabs list через McpGo-Playwright завершились Session terminated. Вместо авторизованного UI прочитаны Viewer API, OpenAPI и документация. Cloud.ru control plane, Beget billing/API, AppTracer/Yandex history и конкретные Store binaries не подтверждены. Собраны факты по доступным источникам; выполнение сборок, отправок, тестовых крашей, миграций, изменений доступа и деплоя оставлено этапам реализации.

## 3. Uptrace Cloud и API

Организация 7251 по заданию, проект GAFUS Production 9378. Viewer token из файла 0600 использован только для GET. В семидневном UTC-окне /api/v1/tracing/9378/spans вернул 200 и две записи без продолжения: gafus.uptrace.smoke.api и gafus.uptrace.smoke.worker от 12 ноября. /api/v1/tracing/9378/groups с тем же окном — 200, пусто. /api/prometheus/9378/api/v1/query?query=up — 200, пустой вектор. /api/v1/metrics/9378/metrics возвращает 404. Подтверждена работа чтения. GET /internal/v1/spans/9378 и /internal/v1/spans/9378/groups с тем же Viewer тоже дали 200, соответственно две записи и пустую группировку. Internal API описан в OpenAPI, но его совместимость закреплять canary и не считать его стабильным public contract. Реальные сигналы production и standalone logs требуют проверки. [Проект](https://app.uptrace.dev/overview/9378), [OpenAPI](https://developers.uptrace.dev/openapi.yaml), [Prometheus API](https://uptrace.dev/features/grafana).

- Трассы: GET /api/v1/tracing/9378/spans с time_start/time_end RFC3339, limit и trace_id. При hasMore разбить окно и дедуплицировать traceId/spanId. Проверять parent/links. Группы: GET /api/v1/tracing/9378/groups, окно и параметры из OpenAPI. Для UQL выбрать документированную операцию list_spans (GET /internal/v1/spans/{project_id}) и закрепить её контракт. Приёмка включает одиночные ERROR без sampled trace и поиск по точной версии. Для просмотра в UI выбрать logs/errors и UQL where service_name = "gafus-api", ключи других полей взять из реальной записи.
- Метрики: GET /api/prometheus/9378/api/v1/query и query_range. Сравнить counters, histogram и gauge с исходным scrape. Проверить scopes production и Nonprod. Панели и оповещения настраивает отдельная роль, Viewer читает. Разделить ingest DSN и read token. Для DSN рассмотреть отдельные токены Alloy, Worker и CI.
- Скрипт scripts/observability/uptrace-read.mjs читает секрет из 0600-файла в память, фиксирует api.uptrace.dev, запрещает redirects, timeout 8 с, максимум два retry на 429/5xx с jitter и Retry-After. Окно 15 мин, limit 50, вывод разрешённых полей. Не печатать raw body или headers. Частоту запросов подтвердить по тарифу.
- Окончание 90-дневного токена по локальной инструкции — 10 февраля 2027. Начало замены к 11 января, уведомления D-30/14/7/3/1. Новый токен → scope и smoke → переключение secret mount → перекрытие 48 ч при поддержке → отзыв. DSN ротировать отдельно для Alloy и Worker с сохранением буфера. 401/403 отличать от outages и отсутствия событий.

## 4. Карта источников

| Источник | Существующая диагностика | Куда отправляется | Что теряется | Что потребуется для Uptrace | Риск |
|---|---|---|---|---|---|
| Mobile React и JS | Root boundary, ErrorUtils, reportClientError, очередь | AppTracer, условно Hono | До layout, rejection, fatal до записи | Early hook, native store, maps | Высокий |
| Expo Observe | Preview gate, OTLP JSON | Preview API, metrics 501 | Production, release fidelity | Явная dependency, adapter и Store builds | Высокий |
| iOS native/Widget | AppTracer plugin, AppDelegate, extensions | AppTracer по build config | Ранние падения, jetsam, watchdog и dSYM | PLCrashReporter, MetricKit, extension symbols | Высокий |
| Android native/headless | AppTracer plugin, Java/Kotlin/NDK | AppTracer по build config | ANR, LMK, tombstone, pre-init | Expo JVM, ExitInfo, NDK fallback | Высокий |
| OTA | Подписанный registry, rollout, /ota/telemetry и app hooks | GAFUS/Prisma, старые AppTracer maps | Точное падение до JS, этап recovery | Launch journal, annotations, private maps | Высокий |
| GPS/offline/фон | walkGpsTask, location/widget, sync | Logger/AppTracer по пути | Headless, retries, OS kill | Task outcomes и safe codes | Высокий, GPS |
| Видео/медиа | videoQualityTelemetry, HLS, CDN/fallback | Локально и по feature calls | Decode vs network, startup, fallback | RUM playback и safe aliases | Высокий |
| Чат, подписки, push | SDK/API catches, AppMetrica, Worker | AppTracer/аналитика/Worker | WS reconnect, receipt, registration | Outcome/attempt и safe codes | Высокий |
| Web, Admin, Trainer | Vite, shared clients и ErrorBoundary | Browser, аналитика | Early error/rejection/chunk/resources | Bootstrap, RUM, IDB queue | Высокий |
| Bull Board | Express, logger, health | stdout/AppTracer, probe | UI assets, exceptions, stale queues | Minimal browser bootstrap, server OTLP | Средний |
| Hono API | onError, HTTP/use-case spans, RED в дереве | stdout/AppTracer, optional OTLP | Production traces, trust, early errors | Reuse middleware, safe logs и DB spans | Высокий |
| Worker, очереди/outbox | Mail/media, health, retry/cron, Chat2 spans | stdout/AppTracer, YC, optional OTLP | Producer context и terminal state | Carrier, registry, DLQ metrics | Высокий |
| Cloud.ru Jobs, feed/gallery | Feed origin/server/worker, Gallery jobs/maintenance, четыре video Jobs | stdout, API/Worker metrics | Unknown ack, run-once flush и provider-side | Signed ingest, reconcile | Высокий |
| Centrifugo | Proxy, realtime/outbox и health | stdout, app metrics | Handshake/reconnect, payload risk | Private scrape, normalized WS diag | Средний |
| Платежи/NPD/финансы | YooKassa, App Store, renewal, receipt, Profit sync | stdout/AppTracer, бизнес-БД | Timeout, retry, backlog | Safe provider/outcome и alerts | Высокий |
| Mail/Push/Telegram | Очереди, mail metrics, WebPush | stdout/AppTracer, YC subset | Transport/auth/quota и terminal | Queue propagation и safe counters | Средний |
| Другие планировщики | Account/consent cleanup, consultations/SLA, exam, pet reminders, reengagement, ML/feed, media/Questions recovery | Worker, cron, Actions | Missing run и stuck jobs | Heartbeat, duration, outcome по kind | Средний |
| Nginx/Certbot/статика | stdout и probes, workflow renew | Docker, YC health | Edge 499/502/504, TLS expiry | Safe JSON и probes | Высокий |
| VPS/Docker | Node Exporter, Docker logs, backup textfile | YC, локально | cgroups, OOM, restarts | cAdvisor/host stats, safe system events | Средний |
| PostgreSQL | Exporter, Prisma errors и backup | YC, локально | Pool/lock/query latency | Метрики и безопасные driver spans | Высокий |
| Redis | Exporter запущен, app health | Локально, YC частично | Отдельный scrape, eviction, latency | Scrape и command enum | Средний |
| Blackbox/backup | Шесть внутренних probes, promtool rules, daily backup | YC, CI | Internet/TLS, telemetry silence, restore | Independent watchdog и parity | Высокий |
| Beget/CDN, S3 и fallback | DNS/CDN smoke и fallback policy | CI и app logs | Edge/origin split, vendor usage | Probes, safe aliases, vendor stats | Высокий |
| Аналитика | AppMetrica, Web Metrica | Yandex Analytics | Неясен автосбор крашей | Проверить defaults, сохранить продуктовые события | Средний |
| CI и maintenance | OTA, release, media, backup | GitHub logs | Release/digest, uptime telemetry | Receipt и smoke | Средний |

[API app](../../apps/api/src/app.ts#L175), [Worker](../../packages/worker/src/index.ts), [Queue exports](../../packages/queues/src/index.ts), [Jobs](../../infra/cloudru/production-job-inventory.mjs), [Mobile root](../../apps/mobile/app/_layout.tsx#L39), [AppMetrica](../../packages/analytics/src/appmetrica-mobile.ts).

На A сохранить inventory по фактическим runtime entrypoints. Для каждого runtime перечислить logger/catch/console/tracer/metrics по файлу и операции. Классифицировать expected/recovered/terminal. Сопоставить с образами, cron, workflows, нативными extensions и CDN domains. Два проекта Cloud.ru проверить существующим read-only inventory. Подтвердить четыре видео Jobs и retired photo Jobs. Beget сверить по production alias и безопасной vendor stats выборке. Coverage неподтверждённого runtime остаётся открытым до evidence.

## 5. Схема событий, privacy и защищённый ingress

Стандарт ресурсов: service.namespace=gafus, service.name=gafus-{mobile-ios,mobile-android,web,admin-panel,trainer-panel,bull-board,api,worker,nginx,centrifugo,feed-origin,feed-job,chat-video-job,gallery-worker,infra,alloy,canary}; deployment.environment.name=production|staging|preview|development; service.version=immutable native version/build, Web build ID или image release; gafus.release.sha=commit SHA. Для системных metrics сохранять Prometheus job/instance и environment, нормализовать alias на входе. Схема version=1 и registry enum на сервере. Стабильные event names: exception, native.crash, native.anr, native.exit, operation.failed, delivery.retry, ota.stage, release.deployed, probe.failed. severityNumber OTel 5/9/13/17/21; severityText DEBUG/INFO/WARN/ERROR/FATAL. Observed time серверный, occurred time проверяется отдельно, время исходной ошибки не затирается временем выгрузки.

Разрешить eventId случайный UUID, type, operation enum, error.code, error.type, безопасный message template, нормализованные frames, category, fatal, safe route template, result, duration, release/build/runtime/OTA id, OS major, architecture, provider alias и ограниченные счётчики. Trace/span IDs — собственные поля OTLP для проверенной корреляции. Если корреляция не установлена, поле отсутствует и указывается причина в outcome метрике. eventId — дедуп доставки, error.fingerprint — SHA256 версии схемы, класса, операции и 3–5 стабильных символизированных app frames без номеров строк. Для несимволизированных записей использовать module/build-id/relative address и явно помечать provisional fingerprint. Разные возникновения имеют разные eventId.

Запретить raw body, Authorization/Cookie, JWT, signed media URL, query/fragment, IP и user agent целиком, чаты и сообщения SDK, контакты, платёжные/receipt IDs, PII, pet data, точный GPS, SQL/text/params, Redis keys, prompt и ответ AI. URL превращать в известный route или provider alias, не применять regex вместо allowlist. Для диагностики сессий временный random launch ID или HMAC с ежесуточным ключом только в logs; никакого ID пользователя/устройства по умолчанию. Для crash frames сохранить разрешённый module, symbol и offset; запретить память, регистры, argv, arbitrary userInfo и абсолютные пути. Проверка на клиенте, Hono, Worker и Alloy. Logs body — название шаблона, stack ограничен 50 frames/8 KiB (native структурно до 64 KiB), attributes до 32, text codes до 128 bytes. Canary с синтетическими URL/JWT/GPS/SQL/chat fixtures должен исчезнуть во всех конечных сигналах и локальных логах.

### Ingress и изоляция

- Mobile существующие POST /api/v1/telemetry/mobile/session (2 KiB) и /mobile (256 KiB). Reuse short grant с release allowlist, hashed token, scope, max 50 events, per-grant/per-source/global budgets и idempotent event insert. Нормализовать частично успешный приём в подтверждённые event IDs. 201 grant, 2xx после commit, 400/413 permanent, 401 обновить grant один раз, 429 Retry-After, 503 retry. Отдельный DB pool/timeouts, no-store, default deny. Компрессия только после тестов декодирования, ограничивать разжатый размер.
- Web предлагаемые /api/v1/telemetry/web/session и /web за same-origin Nginx route для каждого фронта. Bind service/release к origin + build registry. Проверять Origin/Sec-Fetch-Site, token bucket, короткий nonce/grant без auth cookie forwarding; такой grant не доказывает подлинность публичного клиента. Для публичных endpoints abuse budget и отдельная квота от server/native. Для внутреннего UI оставить доступ через существующий auth и scope. Внешний CORS выключен для этих путей.
- Expo Observe отправляет на /api/v1/telemetry/observe/{expoProjectId}/v1/{logs,metrics}, native SDK без динамического grant. Сверять allowlisted Expo project, scope name/version, supported payload, release tuple и environment; production брать из серверного host/build registry. Treat IDs public, WAF + per-release/global reservation и минимальный schema. Записи не снимать с очереди SDK до DB commit. Для OTel metrics aggregate по bounded dimensions; подтвердить SDK semantics на 200/partial_success, 429, 503 и неверном payload. Preview endpoints оставить совместимыми.

- Jobs используют TLS и отдельную узкую HMAC identity по job class, отдельную от бизнес-HMAC. Подпись canonical method/path/body digest/timestamp/nonce, окно 2 мин и anti-replay TTL 5 мин, известный service/env/digest, allowlist типов. Ограничение 64 KiB. Бизнес-запись job state сохраняется независимо. Никакого Cloud DSN в короткоживущих контейнерах.
- Nginx выставляет peer metadata только из доверенной цепочки proxy. Перезаписывать или удалять клиентский CF-Connecting-IP/X-Forwarded-For, доверять только фактическим proxy ranges, лимит на body до API. Hono-метрики, Alloy OTLP и exporters закрыты приватной сетью; docker socket в приложениях запрещён. Для cAdvisor — ограниченные read-only mounts после ревью. Разделить права Dashboard admin, prod viewer, CI uploader и ingest. Секреты только server secret store, без runtime публичных env и развёрнутого compose config в CI.
- Spool diagnostics 7 дней pending, 24 ч безопасного DLQ, tombstone dedup до 7 дней, экспортированный payload сразу очищать. Исключить spool payload из архивов долгого хранения или обеспечить эквивалентную очистку/шифрование backup. Retention облака 28 дней как публичный ориентир, аккаунт подтвердить. По privacy incident остановить конкретный exporter, определить project/time/field, использовать доступное удаление или provider support, подтвердить результат и повторно проверить источники. Точные требования трансграничной передачи, DPA и доступа согласовать на B для фактического региона Cloud.

## 6. Mobile, SDK, доставка и полное покрытие крашей

Локальные версии: expo 57.0.33, react-native 0.86.3, expo-updates 57.0.28, expo-observe 57.0.28, транзитивный expo-app-metrics 57.0.24. Observe разрешается из root pnpm store, в apps/mobile/package.json прямой зависимости не найдено. GAFUS iOS deployment target в checked project 15.1 (Widget 16.2), Android minSdk 24. Фактический диапазон новых бинарников подтвердить CI и physical-device matrix; локальный config не доказывает Store artifact. [Mobile package](../../apps/mobile/package.json), [iOS project](../../apps/mobile/ios/Gafus.xcodeproj/project.pbxproj), [Android build](../../apps/mobile/android/build.gradle).

Установленный Observe: src/index.ts, module и reportCaughtError/ObserveErrorBoundary для JS. ios/Observability.swift, DispatchLoop.swift и DispatchUtils.swift, Android ObservabilityManager.kt, EventDispatcher.kt, DispatchUtils.kt — JSON logs/metrics, два независимых retry gate, base 60 с и cap 900 с при backoff без Retry-After. Native source в expo-app-metrics: ios/MetricKitSubscriber.swift, CrashReporting/CrashReport.swift и CrashReportSymbolicator.swift; Android crashreporting/JvmCrashHandler.kt, ExitInfoProvider.kt, CrashReport.kt; pending JVM file и локальная БД. iOS MetricsDatabase.sessionRetention 7 дней; Android MetricsDatabase.SECONDS_TO_REMOVE_OLD_METRICS также 7 дней. Проверить поведение при expiry, redelivery и перезапуске на реальном устройстве. Перед повторным запуском доставка зависит от OS/WorkManager, pending data и lifecycle. Отказ debug dispatch или installation sampling может отбросить накопленное. В src/types.ts и native ObserveModule версии 57.0.28 есть sampleRate, а errorSampleRate и errorHandlingEnabled при поиске в установленных исходниках не найдены. Закрепить этот контракт fixtures. Для native pilot держать sampling 1 и отбирать performance данные на шлюзе. Нативные network traces из актуального руководства относятся к SDK 58; для 57 использовать ручную OTel корреляцию.

[Preview gate](../../apps/mobile/scripts/observe-preview-config.cjs) устанавливает extra.eas.observe.endpointUrl, требует verified self-hosted preview и убирает withAppTracerNative из профиля. [Preview route](../../apps/api/src/routes/v1/mobile-observe-preview.ts) принимает logs, metrics 501. [Normalizer](../../apps/api/src/modules/mobile-telemetry/observe-normalizer.ts) ограничивает scope/version/release; нужно расширить для проверенной production сборки и проверить поля exception/native release. Expo SDK устанавливает глобальный JS hook при импорте согласно документации, поэтому разрешать единственный канонический владелец JS: GAFUS early bootstrap, отклонение JS exception records в Observe adapter. Если первый импорт всё равно регистрирует лишний hook, зафиксировать его порядок и оставить единственную цепочку вызовов; отключение через errorHandlingEnabled не закладывать для 57.0.28. Один crash handler на механизм. Никакого автоматического fallback на домен Expo. Проверить Info.plist/Android manifest, autolinking, network capture offline и deny неизвестного origin.

| Событие | iOS | Android | Фиксация, доставка, сохранность и символы |
|---|---|---|---|
| Обработанный JS | GAFUS reportClientError, iOS 15.1+ | Тот же, API 24+ | Запись сразу в bounded очередь; после commit переживает restart; Hermes map точного asset; catch на границе операции |
| Необработанный JS | Early ErrorUtils после RN runtime | Тот же | Сохраняет прежний handler, вызывает once. Ловит после init; ранний native bootstrap отдельно. Map JS по build/update |
| Fatal JS | Pending native store + ErrorUtils fatal flag | То же | Минимальная заранее выделенная запись перед прежним handler. На следующем запуске. Kill до write остаётся потерей; SDK/native дубль связывать с launch ID |
| Unhandled Promise | Runtime hook Hermes/RN, release test | То же | Проверить фактический rejection tracker на 0.86.3, не переопределять DevTools. Rejected then handled отменяется до 1 с. Safe type/stack, Hermes map |
| React render | Root/feature ErrorBoundary | То же | Stack + безопасный component frame; сохранить recovery UI и не дублировать global |
| ObjC/Swift crash | PLCrashReporter BSD, MetricKit iOS 15.1+; exceptionReason iOS 17+ | — | Pending report/OS payload после relaunch; signal/code, UUID, architecture, address; dSYM. Swift fatal часто сигнал, а не ObjC exception. До handler только доступный OS payload |
| Java/Kotlin crash | — | JVM handler Expo API 24+, ExitInfo API 30+ | Pending file, затем restart; stack и causes. R8 retrace по versionCode/variant; OEM/старый build может дать только reason |
| NDK/C++ crash | BSD signal collector и MetricKit | ExitInfo crash reason API 30+, native tombstone stream API 31+ при наличии, Breakpad pilot API 24–30 | На рестарте. Parse ограниченный protobuf, оставить signal/ABI/ELF Build ID/relative PC. ELF symbols. Нет stream — reason и статус missing. Не собирать memory dump целиком |
| Hang / ANR | MXHangDiagnostic iOS 14+ (приложение 15.1+); duration/call tree при наличии | ExitInfo API 30+, REASON_ANR и trace stream при наличии | Доставка после OS callback/launch. Recovered ANR и случаи без process death не гарантированы. Отдельный sampled main-loop lag metric, не маркировать его подтверждённым ANR |
| OOM / LMK | MXAppExitMetric iOS 14+, memory warning, безопасная метрика pressure | ExitInfo REASON_LOW_MEMORY API 30+ при supports, OEM может дать SIGKILL; JVM OutOfMemoryError через JVM collector | iOS агрегаты, без подтверждённого per-occurrence stack. Android при LMK обычно только reason, timestamp, optional PSS/RSS. SIGKILL без точной причины — unknown |
| Watchdog | MXAppExitMetric counters; hang diagnostic при наличии | ANR/ExitInfo и duration marker | Aggregate отдельно от событий. Last-launch marker может указать interrupted, но не подменяет OS attribution |
| Фоновая задача | Expo TaskManager/headless и native background hook | Аналогично, WorkManager/job lifecycle | Outcome и safe task ID, защита от двойного retry. OS kill до checkpoint может оставить только stale heartbeat |
| До запуска JS | Native handler, ранний launch journal | Application.onCreate ранний collector/ExitInfo | Native path работает без JS, upload на следующем успешном запуске; pre-main/до install зависит от ОС. No relaunch, uninstall и force-quit ограничивают доставку |
| Падение при старте | Native phase и first-render marker | То же | Correlation launch stage и версии. Crash loop может не успеть выгрузить; offline/recovery gate |
| Авария OTA | Expo Updates recovery + launch journal | То же | Точная версия bundle в момент запуска и классификация manifest/assets/verify/launch. Нет metadata — unknown, не приписывать следующему OTA |
| Декодер видео | expo-video/AVFoundation app-visible codes, native collector при падении | Media3/MediaCodec и native collector | Отдельно playback error vs app-process crash. Remote decoder/system process crash может дать только app-facing error. Не отправлять URI |

Настройки C/E/F: [global handler](../../apps/mobile/src/shared/lib/tracer/installGlobalJsErrorHandler.ts), [reportClientError](../../apps/mobile/src/shared/lib/tracer/reportClientError.ts), [queue](../../apps/mobile/src/shared/lib/telemetry/mobileTelemetryQueue.ts) сейчас 500 событий/8 MiB, 50/256 KiB batch, TTL 7 дней для ошибок, 1 день для остальных. Для fatal использовать dedicated native pending write с ограничением 2 MiB или 32 записи, atomic rename при безопасной точке. Android/iOS native reports сначала decode в безопасные frames и долговременно хранить только в пределах транспортного TTL, удалить после ingest ack. AppMetrica auto-crash проверить отдельно. Живые Store builds могут иметь старый AppTracer и endpoint, новые native builds выпускаются отдельным runtime.

Проверки выхода F: физический iOS release на min supported/актуальной, Android API 24/29, 30, 31 и актуальный OEM. Сравнить native capture timestamp, restart/offline/restart, trace metadata, status символизации и старое поведение RN/OS handlers. Correlation пары MetricKit/PLCrashReporter или JVM/ExitInfo по trusted build, launch ID, process, reason и узкому окну; при неоднозначности оставить primary и счётчик совпадения, не склеивать разные запуски. [Expo config](https://docs.expo.dev/eas/observe/configuration/), [Expo errors](https://docs.expo.dev/eas/observe/errors/), [MetricKit](https://developer.apple.com/documentation/metrickit), [Android ExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo).

## 7. Web, панели и RUM

Подключить общую browser-only реализацию в packages/error-handling/src с bootstrap до React. Entry: apps/web-vite/src/main.tsx, apps/admin-panel/src/admin-live/main.tsx, apps/trainer-panel/src/trainer-vite/live/main.tsx и соответствующий preview, apps/bull-board/bull-board.ts для same-origin UI. Обернуть root и критические feature boundaries общим компонентом с local recovery UI. Для Bull Board проверить безопасный статический entrypoint и CSP в текущем формате сборки. Service/buildId передаётся из immutable build manifest, commit SHA сохраняется отдельно.

| Событие | Захват и поведение |
|---|---|
| JS error и render | window error и существующий React ErrorBoundary, withSafeContext. WeakSet для одного Error object, fallback fingerprint/time для отдельно клонированных событий. Не дублировать boundary, global и operation catch |
| Rejection | window unhandledrejection, учитывать rejectionhandled; нормализовать non-Error values до безопасного кода |
| Chunks | vite:preloadError и rejected import, захватить исходный build/asset alias, однократное предложение перезагрузки после проверки deploy revision. При dirty form оставить сохранение/повтор. Никакого reload loop |
| CSS/изображения/скрипты | Capturing resource error, allowlisted resource type и origin alias. CORS opaque Script error пометить degraded, без догадок о stack |
| HTTP/forms | Инструментировать shared fetch/React Query client. Ожидаемые 4xx/отмена — outcome и rate, terminal network/5xx — error; не репортить тела и URL. Ошибки submit после retry получают domain code |
| WS | Centrifugo auth/connect/disconnect/reconnect/close classes и время до восстановления. Disconnect during pagehide — ожидаемое состояние. Не сохранять сообщения и токены |
| Media | HTMLMediaElement/video adapter, buffer/start/decode/autoplay/fallback. Код и CDN alias, без ссылок и заголовков |
| RUM | PerformanceObserver/Web Vitals, LCP/CLS/INP, navigation latency и API latency histogram. Начальный RUM sampling 10%, errors independent. Route templates из router, агрегаты по app/route group |

IndexedDB 100 событий/2 MiB на origin, errors 72 ч, perf 24 ч, flush по online/visibility/page start; lease/lock для вкладок, один inflight, fallback memory при private mode, TTL/LRU и счётчик dropped. Batch до 50/128 KiB. keepalive при pagehide только если bearer уже есть и body <32 KiB; durable запись остаётся до ack. Дедуп по eventId, batching stable, event creation time и build неизменны после reopen. В API allowlist сетевых операций, safe route, schema, 2xx ack. Тесты Chromium/WebKit/Firefox, CDN immutable hashes и два одновременных выпуска.

## 8. API, Worker, Cloud.ru и распределённая трасса

Переиспользовать [serverTelemetry](../../packages/logger/src/serverTelemetry.ts), [operation-observability](../../apps/api/src/lib/operation-observability.ts), [Hono onError](../../apps/api/src/middleware/error-handler.ts) и [Chat2 outbox Worker](../../packages/worker/src/chat2-outbox-worker.ts). Сейчас базовый SDK — OTLP/HTTP trace exporter, batch и ParentBased ratio default 0.1. API сохраняет correlation через AsyncLocalStorage и возвращает X-Trace-Id. На публичном входе текущее принятие клиентского trace ID требует усиления до включения. Outbox уже имеет traceId/operationId для части операций. Добавить resource attrs, один SDK bootstrap до runtime imports, SIGTERM bounded flush 5 с, Node fatal/rejection hooks без подавления штатного выхода и отдельную проверку init при отсутствии env.

- Public client генерирует W3C traceparent только для allowlist GAFUS API и только при отсутствии cross-origin redirect. Сервер валидирует version, фиксированный размер, lower hex и ненулевые IDs. Сбрасывает входящие tracestate, baggage, sampled decision и подставные request/correlation IDs. Для публичного запроса сервер создаёт доверенный root и сохраняет link на валидный remote context. API возвращает X-Trace-Id и request correlation ID, CORS expose только согласованных заголовков. Mobile/Web error log привязывать к trusted server trace после ответа. При сетевом отказе — client trace и operation.id, без заявления о server parent. Для строгого одного trace на защищённых клиентских операциях разрешить parent только из server-minted короткого grant с trace ID/nonce и per-source budget. Условия preflight и внешних редиректов тестировать.

- Internal API → Redis/BullMQ: добавить optional metadata telemetry={version:1,traceparent,operationId,enqueuedAt} вне domain payload, в packages/queues producers и outbox envelope. Только trusted internal context inject; не передавать baggage/tracestate, бизнес идентификаторы и user IDs. Старые jobs без поля работают с новым root. Транзакционный outbox хранит контекст вместе с событием, payload schema additive. Каждый retry имеет отдельный span/attempt. Короткая синхронная цепь — child, delayed/cron/large fan-out — новый trace с SpanLink и operation.id. Не перепривязывать retry к span предыдущей попытки. Внешней интеграции заголовок отправлять лишь по явному контракту и allowlist.
- HTTP spans: method + route template + status + duration; ранний rejection и onError должны иметь context. Use-case spans на бизнес-границах, manual DB/Redis spans вокруг известных операций или auto-instrumentation после выключения statement/query/Redis command args и двойных wrappers. Статусы expected decline, 4xx/abort, conflict, retry, timeout различаются. HTTP/DB pool/queue lag/duration metrics считают все операции. Никаких URL/path IDs, payload или statement params.
- Ошибка: один канонический OTLP log на терминальной границе с eventId, safe code и trace/span IDs, независимо от sampling. ERROR status и safe exception event только на sampled span. Родительские spans маркируют status без копии stack. Временный retry WARN и retry counter. Коррелировать ошибки через fingerprint, operation.id и traceId; ошибка при dropped trace остаётся доступна как log с correlation ID. Cloud alerts должны уметь читать эти standalone logs.
- Sampling: server 5% success traces, 10% Worker traces, приоритизация FATAL/ERROR logs без обычного sampling, metrics всегда. Доверенный Nonprod smoke force sampled через подписанный allowlisted source. Принудительная трассировка произвольным входящим флагом запрещена. Tail sampling на одном vCPU не вводить до доказанного запроса и профиля ресурсов. Алерты по unsampled counters/logs. [W3C Trace Context](https://www.w3.org/TR/trace-context/), [OTel logs correlation](https://uptrace.dev/opentelemetry/logs).
- Worker: реестр каждого BullMQ/cron/outbox handler, queue state, schedule cadence, expected duration, retry classification, DLQ, terminal outcome и ограниченный heartbeat. Добавить операционные логи в push/mail/Telegram, YooKassa/App Store/NPD, media/Cloud.ru/Beget, account cleanup, GPS sync и reengagement. Результат успешной бизнес-операции независим от export.

- Jobs run-once: start/finish/fail и duration, operation.id/trace link из диспетчера, flush максимум 3 с, итоговый receipt сверяет Worker. Через provider API/dispatcher heartbeat замечать отсутствие start/finish, timeout, image pull failure, canceled/OOM. Не переносить секреты/входной объект в лог. Обновлять четыре видео Jobs по immutable digest и отдельному workflow; feed/gallery origin/maintenance покрыть по inventory, retired photo jobs не запускать. [Job registry](../../infra/cloudru/production-job-inventory.mjs), [feed entry](../../apps/feed-cloud/src/chat2-job-entry.ts), [gallery job](../../apps/gallery-cloud/src/job.ts).

## 9. Единая политика логирования и долговечность

| Уровень | Примеры | Локально | Uptrace / лимит и поведение при сбое |
|---|---|---|---|
| DEBUG | Детали стадии, timings при расследовании | Opt-in allowlist до 2 ч и 20 MiB на сервис | Выключен по умолчанию, временная квота Nonprod |
| INFO | Release, startup, clean recovery, summary | Ротация 10 MiB × 3 на контейнер как старт | Только релиз/heartbeat/бизнес-независимый summary. Прочий INFO в метрики или 1% при наличии квоты |
| WARN | Recoverable timeout, retry, degraded source | Та же ротация | Первый/последний, rollup count, до 10 одинаковых/min на source/fingerprint. 24 ч максимум для доставки |
| ERROR | Terminal operation, API 500, failed job | Safe JSON и приоритетный spool | 100% целевой приём обнаруженных, без sampling; 7 дней retry/TTL, при физическом overflow считать потери |
| FATAL | Process/native crash, boot fatal | Pending record или safe emergency line | Высший приоритет, резерв ёмкости; отдельный алерт при drop, 7 дней TTL |

Расширить UnifiedLogger одной безопасной schema. Node first-party apps пишут safe JSON в отдельный bounded rolling stream, Alloy читает только его. ERROR/FATAL выделить append-only priority файлом/локальной durable очередью; mobile/browser canonical logs поступают через Worker spool и не перепечатываются для повторного Alloy ingest. Default stdout и Docker logs остаются bounded локальной диагностикой. Для Nginx safe access log (method, status, upstream_status, latency, route family, safe trace ID); raw error log остаётся локальным, экспорт только parsed templates и counters. Для PostgreSQL/Redis/Centrifugo экспортировать нормализованные known codes без raw query/payload. Для OS/Docker events — краткие transitions restart/oom/disk pressure. Парсер изолирует bad records, считает discarded, не логирует rejected raw text. Не давать Alloy Docker socket для чтения всего stdout.

Spool: lease CAS/locking и backoff с jitter, отдельный резерв FATAL 20% ёмкости, startup 512 MiB total DB payload cap на VPS плюс table bloat budget, batch/reservation по bytes. Прямой Worker→Uptrace для клиентских ERROR/FATAL позволяет подтвердить HTTP/OTLP ответ. Сохранить single-record mode на старте для partial success, конкурентность 2, timeout до 5 с и capped throughput; измерить устойчивую скорость. Если производительность недостаточна, перейти к небольшим batches только с поддержкой идентификации отклонённых записей, иначе revert на одиночный export с bounded concurrency. После export очистить payload, хранить idempotency marker в TTL. Для timeout после принятия доставлять повторно с тем же ID; Uptrace dedup по этому атрибуту не подтверждён, UI/алерты считать distinct, проверить паритет counters. Идемпотентный commit GAFUS и отложенный ack не дают exactly-once внешнего экспорта. [Worker exporter](../../packages/worker/src/mobile-telemetry-export.ts), [Worker lease](../../packages/worker/src/mobile-telemetry-spool-worker.ts), [Spool migration](../../packages/prisma/migrations/20261113010000_mobile_telemetry_spool_v1/migration.sql).

## 10. Системные метрики, Yandex и Alloy

| Группа | Метрики и начальный интервал | Labels и сокращения |
|---|---|---|
| VPS | CPU modes, RAM/available, swap, OOM, disk free/inodes/IO и network errors/bytes, 60 с | host alias, mode и disk/mount/NIC allowlist; исключить pseudo mounts/loopback |
| Docker | CPU, working set, memory limit, restart/OOM and network, 60 с | Стабильный compose service. Исключить ID, image digest и ephemeral cgroups. cAdvisor resource test |
| PostgreSQL | pg_up, connections by state, commits/rollbacks, locks/deadlocks, DB size, pool timeout, backup age 60 с | DB alias, lock class; исключить raw queries, per-table/index по умолчанию |
| Redis | redis_up, RSS, used/max memory, evictions, blocked clients, hits/misses, connection errors 60 с | Stable instance alias; без ключей/клиентов; ограничить db label |
| HTTP и queues | requests, 5xx, latency histogram, pending/leased/oldest/DLQ, runtime and schedules 30–60 с | service/route template/method/status class; queue kind/attempt band, фиксированные buckets |
| Пользовательские операции | media startup/fallback/decode, GPS sync, login, payment/restore, WS reconnect, OTA stage 60 с | platform/operation/outcome/provider/major release; точный SHA/OTA ID в logs |
| Cloud.ru/Beget | Job ack/run status, dispatch duration, S3 latency/errors, CDN edge/origin latency/cache/status, availability 60–300 с | Project/job/provider alias и bounded status. Provider ingress/egress quota считывать read-only после проверки vendor API |
| Availability | Существующие 6 internal endpoints, Centrifugo/Feed/Gallery по наличию, API/Web/CDN public TLS 30–60 с | Stable target alias. Никаких URL/query в instance при export |
| Collector | receiver accepted/refused, exporter sent/failed, WAL backlog/age/drop, spool pending/expired, bytes, heartbeat 60 с | source/signal/outcome, без correlation ID; independent watchdog |
| Бэкап | last success timestamp, duration, last verified restore age, 60–300 с | backup kind и environment, без пути и credentials |

Переиспользовать prometheus.scrape/relabel и открыть отдельный Uptrace remote_write 1.0 на https://api.uptrace.dev/api/v1/prometheus/write с серверным uptrace-dsn. Alloy продолжает YC ветку для parity, метрики Uptrace получают свой allowlist. OTLP для traces и logs; OTLP metrics для агрегатов приложений, которые не scrape-ятся, с отдельным allowlist. Один signal producer на каждую серию, не зеркалировать одни counters через OTLP и scrape. Проверить приём cumulative counters, histograms, reset, stale marker, query_range, отсутствие exemplars у remote_write. [Uptrace Prometheus](https://uptrace.dev/ingest/prometheus).

### Профиль Alloy и конфигурация

На v1.8.2 подтверждено наличие otelcol.receiver.otlp, otelcol.exporter.otlphttp и cAdvisor по tagged source. otelcol.storage.file отсутствует в регистрации этой версии. Сначала validated base на v1.8.2 для traces + Prometheus WAL и ограниченной локальной файловой очереди логов. Кандидат на B — Alloy 1.21.3. Оба компонента, storage.file и filelog, зарегистрированы в исходниках тега. Закрепить OCI digest после тестов совместимости, проверить stability.level, WAL migration и memory budget. RC 1.22 в production не использовать. [Релиз 1.21.3](https://github.com/grafana/alloy/releases/tag/v1.21.3), [компоненты тега](https://github.com/grafana/alloy/blob/v1.21.3/internal/component/all/all.go). Переход Alloy отдельным canary; при провале использовать v1.8.2 с постоянным storage.path для Prometheus и отдельным управляемым Safe JSON spool для ошибок до успешного upgrade. Приоритетные server error files подтверждать через reader/export counters и shadow receipts. Чтение с позиции, переживающей restart, само по себе не гарантирует cloud ack: проверить backpressure и сбой между чтением и disk queue. Предельные настройки — 180 MiB hard mem limit для Alloy, memory_limiter 128 MiB/32 MiB spike, 0.25 CPU sustained и 512 MiB filesystem quota для WAL/queues при наличии измеренного запаса. Собирать семь суток baseline и 30 мин нагрузки. FAIL при OOM, устойчивом росте очереди, host available <300 MiB, p95 API +5% или p95 scrape lag >2 intervals.

Пример wiring для будущей ветки. Валидировать тем же образом, что будет в production. GAFUS_UPTRACE_INGEST_DSN доступен только exporter. Разместить receiver в приватной сети Compose без ports. Добавить filter/transform перед batch и две очереди с разными пределами для обычных и приоритетных сигналов. Файл состояния и WAL должны переживать recreate. Для storage/filelog синтаксис и stability проверяются по новой закреплённой версии, поэтому они вынесены из базового фрагмента.

```alloy
otelcol.receiver.otlp "gafus" {
  http {
    endpoint = "0.0.0.0:4318"
  }
  output {
    traces = [otelcol.processor.memory_limiter.gafus.input]
    logs   = [otelcol.processor.memory_limiter.gafus.input]
  }
}
otelcol.processor.memory_limiter "gafus" {
  check_interval = "1s"
  limit = "128MiB"

spike_limit = "32MiB"
  output {
    traces = [otelcol.processor.batch.gafus.input]
    logs   = [otelcol.processor.batch.gafus.input]
  }
}
otelcol.processor.batch "gafus" {
  timeout = "2s"
  send_batch_size = 256
  send_batch_max_size = 512
  output {
    traces = [otelcol.exporter.otlphttp.uptrace.input]
    logs   = [otelcol.exporter.otlphttp.uptrace.input]
  }
}
otelcol.exporter.otlphttp "uptrace" {
  client {
    endpoint = "https://api.uptrace.dev"
    headers = {"uptrace-dsn" = sys.env("GAFUS_UPTRACE_INGEST_DSN")}
  }
}
prometheus.remote_write "uptrace" {
  endpoint {
    url = "https://api.uptrace.dev/api/v1/prometheus/write"
    headers = {"uptrace-dsn" = sys.env("GAFUS_UPTRACE_INGEST_DSN")}
    queue_config {
      max_shards = 2
      capacity = 5000
      max_samples_per_send = 1000
      batch_send_deadline = "15s"
      retry_on_http_429 = true
    }
  }
  external_labels = {environment = "production", cluster = "gafus"}
}
```

В реализации вставить allowlist processor до batch. В remote_write направить scrape только через relabel. Queue для traces ограничить 128 batches и 15 мин retry, для приоритетных logs измерить файл/queue до 7 дней в пределах дисковой квоты. Если штатный storage не держит 7 дней, сохранить bounded safe files с rotation/replay и измеряемым RPO. При выходе за лимит сбрасывать сначала traces/INFO, экспортировать counters потерь независимо. Совместимость Alloy проверить через container validate, synthetic sink и controlled recreate. Для Docker cAdvisor проверить разрешения, v2 cgroup и лимит CPU; при выходе за бюджет использовать ограниченный systemd collector с docker stats на хосте, публикующий только агрегированные textfile метрики, без доступа контейнера к socket. [Alloy v1.8.2](https://github.com/grafana/alloy/blob/v1.8.2/internal/component/all/all.go), [OTLP/HTTP exporter](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.exporter.otlphttp/), [storage.file](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.storage.file/), [filelog](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.receiver.filelog/).

### Паритет мобильного Yandex Monitoring

[sync script](../../scripts/sync-metrics-to-yandex-native.py) читает YC Prometheus и пишет восемь native metric aliases: gafus_web_up, gafus_api_up, gafus_worker_up, gafus_bull_board_up, gafus_postgres_up, gafus_cpu_percent, gafus_ram_percent, gafus_disk_free_percent. В Uptrace собрать мобильную панель с этими восемью карточками, Redis, fresh timestamp и ссылками на Active Incidents. Формулы: probe_success для каждого service, pg_up, 100 × (1 − avg(rate(cpu idle[5m]))), 100 × (1 − MemAvailable/MemTotal), 100 × free/total корневого диска. Сравнить все карточки и поведение no-data 14 дней. Проверить secure login/MFA, уведомление и deep link с iOS/Android. Если встроенный мобильный UI не проходит приёмку, дать закрытую компактную on-call страницу в существующей админке: серверный Viewer, фиксированные PromQL templates, cache in-memory 30–60 с и явный stale indicator. Никакого нового хранилища. Сохранить доступ к облачной консоли для функций управления инфраструктурой. Yandex sync отключать только после проверки мобильного workflow дежурного.

## 11. Source maps, нативные symbols и OTA

Единый release manifest связывает project/environment/service, commit SHA, deploy ID, image digest, version/buildNumber/versionCode, bundle ID/applicationId, platform/ABI, Expo SDK, RN/Hermes versions, runtimeVersion, native fingerprint, OTA channel/update ID, embedded flag, asset key/SHA256, symbol refs, UUID и ELF Build ID. Подпись существующим релизным контуром, immutable key и idempotent upload до активации. Registry сверяет, что бинарный и OTA manifests совместимы. Workflows публикуют release markers с timestamp, old/new version, cohort и CI run ID. QA сохраняет evidence JSON без secret.

| Артефакт | Сборка и публикация | Символизация и проверка |
|---|---|---|
| Web public/admin/trainer | Vite build.sourcemap=hidden. Сохранить все .map в private S3 с source manifests до CDN, удалить из публичного dist и не публиковать SourceMap header. Учитывать exact asset URL path/origin, content hash, SHA, service.version | Worker resolver по verified build/asset alias, offline source-map lookup. Canary minified frame должен вернуть точный file:line:column. Старые карты держать 180 дней или весь поддерживаемый срок старых вкладок плюс 28 дней |
| Web vendor maps | Uptrace документирует upload /api/v1/sourcemaps по DSN, matching minified URL/service/version и Sentry debug IDs. На Nonprod проверить native Web span flow telemetry.sdk.language=webjs и source maps; опубликованные пределы 200/project и 64 MB/map | Основной Worker resolver сохраняет один log и покрывает браузеры/старые чанки. Vendor upload допускается для совместимого Web error span после подтверждения и учёта числа карт. Копии одного stack из обоих путей не отправлять |
| Embedded Hermes | Из iOS Xcode archive и Android release Gradle взять composed Metro+Hermes map для реально включённого JS bytecode; verify sha, build no, runtime и ABI | Закрепить соответствующий Metro symbolicate/обработчик v3 map, fixture с реальным iOS/Android release и известной строкой |
| OTA Hermes | Снять map из того же npx expo export, что создал подписанный bundle, связать OTA update ID, bundle SHA, runtimeVersion и rollout | Проверить embedded, новый OTA, старый OTA и rollback; mismatch → explicit missing, не подбирать ближайший release |
| iOS dSYM | Из .xcarchive сохранить dSYM для app, extension и нужных frameworks; xcrun dwarfdump --uuid сверяет binaries и UUID/arch | PLCrashReporter/MetricKit frames + image load/offset, xcrun atos на macOS QA, автоматический resolver через проверенный DWARF/LLVM tool по относительному адресу; check tool parity с atos |
| Android R8 | Хранить mapping.txt exact versionCode/variant, отдельно release with minify enabled | Retrace от того же R8 toolchain, assert known obfuscated stack. Build без R8 → identity source |
| Android native | Хранить unstripped .so или debug symbols по ABI/ELF Build ID из release AAB, сопоставить загруженный split | llvm-readelf -n для ID, llvm-symbolizer для PC, ndk-stack для отладки tombstone. Вендорские .so могут оставаться без line info |

В VPS использовать bounded symbolication job в существующем Worker с private S3, process isolation, низкой конкурентностью, timeout 2 с, проверкой хэша и path traversal, cache 128 MiB. Для iOS доказать точность Linux DWARF resolver по atos fixtures. Если для конкретного Mach-O точность не подтверждена, использовать закрытый macOS runner для подготовки compact address→symbol index при сборке. Публиковать индекс с тем же UUID. Live raw crash uploads на внешний macOS сервис не нужны. Указывать symbolization.status=resolved|partial|missing|mismatch и coverage known app frames. Для backlog отсутствующих карт — отложенный retry до 15 мин, затем один безопасный fallback log; последующая нормализация как связанный diagnostic event только по запросу. Очередь не держит PII. Private artifacts — шифрование, минимальные IAM, удержание минимум 180 дней и срок поддержки сборки плюс 28 дней, что длиннее. [Private symbols helper](../../apps/mobile/scripts/prepare-sdk57-private-symbols.mjs), [Uptrace source maps](https://uptrace.dev/features/sourcemaps), [Hermes](https://docs.expo.dev/guides/using-hermes/), [Apple symbols](https://developer.apple.com/documentation/xcode/adding-identifiable-symbol-names-to-a-crash-report), [NDK stack](https://developer.android.com/ndk/guides/ndk-stack).

OTA-only: безопасные JS hooks и транспорт поверх уже имеющихся нативных возможностей, JS maps, release metadata и feature flags с backcompat. Store build: нативный Observe dependency и endpoint, crash libraries, startup/early marker, runtime change, privacy manifests, удаление AppTracer native. Не менять native fingerprint для старого runtime. Использовать текущий signed self-hosted OTA registry и approved preview workflow; EAS-hosted commands годятся только для legacy profile. На F/J провалить fixture без native module с graceful fallback. Rollback через прежний совместимый signed update или embedded, если состояние устройства совместимо; при необратимой клиентской миграции fix-forward. Stage logs manifest→asset→verify→apply→first-render→rollback; версия crash берётся из launch journal упавшего запуска. Server/Worker release привязан к image digest, Web — к exact deployment manifest, CDN keeps hashed assets. [OTA preview workflow](../../.github/workflows/gafus-self-hosted-ota-preview.yml), [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/).

## 12. Квоты, тариф и модель расхода

Тариф аккаунта не подтверждён из-за недоступной UI сессии. Исходный ориентир — 50 GB и 200 млн datapoints. Публичный прайс Uptrace Cloud на момент исследования указывает 50 GB, 5 000 timeseries/month, типовые 28 дней, overage с billing и ставки от $0.075/GB и $0.025/млн datapoints. 5 000 серий при интервале 60 с дают 201.6 млн точек за 28 дней и 216 млн за 30, поэтому лимиты различаются. Проверить оба счётчика, объём сжатия/биллинг и действительное поведение без карты/платёжного плана. Результат публичного FAQ об overage не переносить автоматически на организацию 7251. Планирование — по 50 GB, 200 млн и 5 000 как отдельным потолкам до уточнения. [Прайс Uptrace](https://uptrace.dev/pricing).

Оценка ниже модельная, до замера реального использования. 30 дней, десятичные GB. Один ERROR Mobile/Web 1.8 KB, native 6 KB, span 0.9 KB, структурированный log 0.95 KB. API 5% × 6 spans/request, Worker 10% × 4 spans/job. Метрики 1 datapoint/min на активную серию, включая buckets. Metrics raw estimate 80 bytes/sample, реальное кодирование и модель начисления могут отличаться; их GB показаны отдельно от log/trace GB.

| Категория | Низкий GB/сут | Обычный GB/сут | Всплеск GB/сут | Вход модели за сутки |
|---|---:|---:|---:|---|
| Mobile errors | 0.00018 | 0.0018 | 0.018 | 100 / 1 000 / 10 000 |
| Native crashes | 0.000018 | 0.00018 | 0.0018 | 3 / 30 / 300 |
| Browser errors | 0.000144 | 0.00144 | 0.0144 | 80 / 800 / 8 000 |
| API traces | 0.0108 | 0.0675 | 0.54 | 40k / 250k / 2M запросов |
| Worker traces | 0.00144 | 0.0144 | 0.108 | 4k / 40k / 300k jobs |
| Logs | 0.0057 | 0.038 | 0.3325 | 6k / 40k / 350k, без клиентских строк выше |
| **Logs + traces** | **0.0183** | **0.1233** | **1.0147** | **0.548 / 3.700 / 30.441 GB за 30 дней** |
| Прикладные/infra metrics | 0.0576 | 0.20736 | 0.5184 | 500 / 1 800 / 4 500 серий |
| Docker metrics | 0.009216 | 0.0288 | 0.09216 | 80 / 250 / 800 серий |
| **Metrics datapoints** | **0.8352 млн** | **2.952 млн** | **7.632 млн** | **25.056 / 88.56 / 228.96 млн за 30 дней** |
| **Metrics GB raw equivalent** | **0.0668** | **0.2362** | **0.6106** | **2.00 / 7.09 / 18.32 GB за 30 дней** |

Верхний сценарий превышает 200 млн примерно на 28.96 млн и 5 000 на 300 серий. По опубликованной стартовой ставке эквивалент overage точек ~$0.72/мес, если оплачивается только превышение. Если оплачивается весь объём метрик — ~$5.72/мес. При 100 GB billable logs/traces после 50 GB free по $0.075/GB — ~$3.75/мес, или ~$7.50 при оплате всех 100 GB. Эти варианты исключают возможные minimum fee, retention add-on, налог и особенности договора. Платёжный вариант для старта — usage-based plan после подтверждения коммерческих условий; отдельный долгий retention не требуется до измерения реального объёма. Например, 100 GB archive + 5 000 active series добавляют ориентировочно $2/мес по публичной ставке. Если аккаунт имеет жёсткий cap, сокращать noisy series и INFO до его достижения, либо согласовать платный лимит до production.

Log storm: 500 повторов/с × 2 KB = 3.6 GB/ч, 86.4 GB/сут, больше 50 GB за ~14 ч даже без остального трафика. Сначала убрать INFO/DEBUG, затем sampling обычных spans до 1%, нормализовать repetition на источнике. При исчерпании приоритетного буфера разрешить ограниченную свёртку повторов одного fingerprint в 1-min bucket с occurrence_count, first/last, exemplars и счётчиком suppressed. Сохранять уникальные FATAL первыми. Порог 60% forecast предупредительный, 75% — ограничить labels/необязательные логи, 90% — page и аварийный режим, 100% — отделить billing overage от hard reject. За неделю shadow traffic сверить фактические ingest usage и модель по каждому сигналу, затем пересчитать ежемесячно и после крупного релиза. Жёсткий бесплатный бюджет и полная доставка каждого события при storm одновременно недостижимы.

## 13. Отказы, очереди и восстановление

| Отказ | Буфер и повтор | Потери, обнаружение и восстановление |
|---|---|---|
| Uptrace недоступен/timeout | Circuit breaker после 5 retryable failures, half-open через 30 с. Spool/WAL, 2.5 с→15 мин jitter и Retry-After | Потеря при cap/TTL. Экспортер age/drop и внешний missing-heartbeat. Восстановить egress, drain FATAL→ERROR→остальное, ограничить скорость |
| Интернет Mobile отсутствует | 500/8 MiB, 7d errors/1d прочее; native pending до 7d. Retry foreground/online и безопасный background | Kill до persist, отсутствие relaunch, TTL/uninstall. Отправить счётчик loss при следующем запуске |
| Browser offline/private | IndexedDB 100/2 MiB, 72 ч errors, иначе memory. Wake on online/visibility | Browser purge и незаписанный pagehide. Показать lost/dropped on next session без user ID |
| App crash / launch loop | Native pending file или OS payload; latest checkpoint. Перезапуск приложения | До установки handler или без relaunch не гарантировано. Проверить Store diagnostics агрегаты при расследовании |
| Worker/API restart | Lease CAS, таймаут lease 120 с, PENDING reload. API отвечает success после DB commit | Повтор при timeout ack, dedup ID. Отдельный watchdog export_lag. SIGTERM flush bounded |
| Docker/VPS reboot | Persistent volume/WAL и PG, restart unless-stopped | Проверить mount ownership и restart sequence. RAM queues теряют незаписанный хвост. Восстановить без очистки volumes |
| PostgreSQL недоступен | Ingress 503, клиенты сохраняют. No business impact. Durable server error file локально | До 7 дней, overflow учитывается. Restore согласно backup runbook, миграции additive, затем drain |
| Redis недоступен | Business circuit policy, queue retry; telemetry fallback с локальными лимитами или 503 для анонимного ingress | Один sink с ограниченной записью, никаких небезопасных обходов rate limit. Health + terminal error |
| Partial success OTLP | Анализ rejectedLogRecords и warning-only. Single-event export либо exact rejection IDs | Полный batch retry после явного partial запрещён. Unknown accept count отмечать отдельно; dead code и bounded retry для transient |
| Повторная доставка | Stable eventId, transaction unique, CAS lease и at-least-once external | Unknown ack может дублировать. Uptrace distinct/rollup, контроль duplicates |
| Переполнение | INFO и traces drop сначала; FATAL reserve, 7d/512 MiB DB cap, 512 MiB Alloy cap | Drop metrics по причине, emergency alerts; восстановление, если исходная очередь/буфер пережили отказ |
| Неверный DSN | Остановить конкретный exporter на 401/403, оставить очередь, retry только после подтверждённой смены секрета | Prioritize alerts; повторить canary, проверить project. Запретить auto-delete DLQ на auth failure |
| Истёк Viewer token | Влияет на чтение, exporter DSN независим. D-30/14/7/3/1 и canary GET | Новый token/scope, обновление Reader, корректный ротационный audit |
| Новый Uptrace контракт | Compatibility canary и JSON schema для traces/logs/metrics, status/error categories | Заморозить rollout, вернуть pin/настройки, сохранить backlog; provider support |
| Quota exhausted | Drop low priority, aggregate повторения при cap, retry только на retryable status | Budget alert, retention/overage decision, remeasure. Никакой бесконечной retry 4xx |

## 14. Дашборды, запросы и on-call

Задать глобальные фильтры environment, service, time, route group; для logs/spans — exact release/OTA/trace, для time series — platform/provider и ограниченные release cohorts. Запросы ниже — проектируемые названия GAFUS и проверенные Prometheus expressions. После первого ingest закрепить actual name/labels, выбрать aliases и хранить definitions versioned.

| Панель | Основные запросы и фильтры |
|---|---|
| 1. GAFUS overview | min by(service)(probe_success), error ratio, p95 HTTP, worker oldest, canary freshness и release annotations |
| 2. Mobile iOS | rate(gafus_mobile_operations_total[5m]) по outcome, native crash logs, sessions, startup/first render, iOS major и build |
| 3. Mobile Android | Crash/ANR/LMK reasons, Android API band и ABI, startup, release и app-only stack coverage |
| 4. Web и панели | Browser errors по service/category/version, chunk failures, p75 LCP/INP и CLS, 5xx/network, WS reconnect |
| 5. API | rate(gafus_http_requests_total[5m]) по status class, histogram_quantile(0.95, sum by(le,route)(rate(gafus_http_duration_seconds_bucket[5m]))), DB/Redis timeout, spans |
| 6. Worker | max by(queue)(gafus_queue_oldest_age_seconds), pending/lease/DLQ, retries и successful job durations |
| 7. PostgreSQL / Redis | pg_up, redis_up, lock/deadlock, connections utilization, evictions и memory ratio |
| 8. VPS / Docker | CPU non-idle, MemAvailable, swap, root disk/inodes, container working set, OOM/restarts |
| 9. Ошибки по версиям | Search exception/operation.failed с группировкой fingerprint/service_version, release SHA и OTA ID. Сравнить выпуск с предыдущим по session denominator |
| 10. Native crashes | Crash/anr/exit source, reason, signal, confidence, symbolization.status, first occurrence, baseline/новый build |
| 11. Операции пользователя | p95 login/payment/GPS sync, media start/rebuffer, WS connect и success ratios по operation и platform |
| 12. Media / CDN / Cloud.ru | probe_success по alias, rate(gafus_media_errors_total[5m]), queue age, runtime, unknown ack, S3 latency, cache status и origin failover |

Crash rate — доля наблюдаемых запусков с crash среди наблюдаемых launch sessions. Считать по dedup launch, показывать задержку delivery и видимый denominator. OS aggregate counts показывать отдельно. Никаких сравнений «crash-free» без покрытия и доверительного порога.

| Алерт | Порог и окно | Severity и ключ |
|---|---|---|
| API/Web unavailable | 3 неуспешные пробы за 3 мин, внешняя и внутренняя по возможности | Critical service+env |
| Worker down/silent | Health fail 2 мин либо нет heartbeat 5 мин | Critical worker+env |
| Новый fatal/native crash | Новый fingerprint в rollout либо 3 native за 10 мин | Warn первое; critical если active canary/boot loop |
| Crash rate | >1% или >2× baseline при >=200 наблюдаемых сессиях за 30 мин | Critical platform+cohort |
| API 5xx/latency | 5xx >2% при ≥100 запросах/5 мин или p95 >1 с 10 мин | Warn, critical >5% 5 мин/ p95 >2 с 10 мин |
| PostgreSQL/Redis | pg_up/redis_up=0 2 мин, pool >85% 10 мин, evictions sustained | Critical down, warn saturation |
| Queue/DLQ | oldest >5 мин 10 мин, DLQ delta >0 5 мин, отдельные SLA для mail и media | Warn/critical при >15 мин для critical queue |
| Cloud.ru/CDN | Unknown ack 3/10 мин, >5% terminal failures при 20 jobs, 3 CDN probe fail | Critical provider+kind, warn degraded |
| Video/GPS/auth/payments | Fail ratio >5%, 20+ за 10 мин; payment/auth >2× baseline | Warn operation; critical sustained 20 мин |
| VPS RAM/disk | available <300 MiB 10 мин, disk <15%/inode <15% 10 мин, critical <8%/OOM | Warn/critical host |
| Backup/TLS | Last backup >26 ч, verified restore age >35 дней, TLS <14d | Warn, critical backup >48 ч или TLS <3d |
| Quota/credential | Forecast 60/75/90%, token D-30/14/7/3/1, sudden 401/403 | Warn/Critical project+signal |
| Telemetry lost | No heartbeat >5 мин, oldest priority >5 мин, rejected/dropped ERROR/FATAL >0 | Critical source+signal; внешний контроль Uptrace |

Uptrace документирует email, Slack, Telegram, Teams, Mattermost, PagerDuty, Opsgenie, Alertmanager и webhook. Выбрать Telegram для дежурного и email или существующий paging backend для эскалации. Подтвердить фактический entitlement, credentials, recovery и routing на Nonprod. Группировка по env/service/fingerprint, suppression downstream при host/DB outage, notify first/aggregate 5 мин, cooldown 30 мин, recovery после 3 здоровых измерений. P1 эскалировать через 10 мин без ack; собственный channel relay допустим только как доставка. Текст — код, service, dashboard link, без stack/PII. Внешний watchdog на отдельной площадке проверяет public API/Web, freshness canary и Viewer health каждые 2 мин. Обращения к API ограничить договорным rate. Хранит только последнее состояние и дедуп уведомлений с TTL 24 ч, без потока телеметрии. Проверить dual-failure и recovery, не зависеть от VPS/Uptrace одновременно. [Uptrace alerting](https://uptrace.dev/features/alerting).

## 15. Этапы выполнения и файловая матрица

Порядок A → B → C → D/E/F → G → H → I → J → K → L → M. G начинается до rollout D/E/F, поскольку карты и symbols обязательны для первого release canary. H можно вести после B параллельно с C–G с отдельным владельцем Alloy. Статусы ниже — будущие критерии. Любой незакрытый обязательный критерий этапа останавливает переход зависимого этапа. Контрольные профили QA и условия доступа задать на A.

### A. Baseline и evidence

- Цель и зависимости. Зафиксировать baseline до любых изменений. Выписать HEAD, SHA/immutable image IDs, runtime matrix и current source/destination inventory.
- Файлы. Этот план, package.json, pnpm-lock.yaml, ci-cd/docker/docker-compose.prod.yml, ci-cd/docker/prometheus/config.alloy, .github/workflows, infra/cloudru/production-job-inventory.mjs. Закрытый evidence manifest вне public artifacts.
- Команды. git --no-optional-locks status --porcelain=v1 -b, git rev-parse HEAD, docker ps, docker stats --no-stream, docker inspect по whitelist, существующий Cloud.ru read-only inventory и безопасный Uptrace GET. Зафиксировать seven-day QPS/log volume/series, owner ACL, Billing/retention, графики/алерты Yandex, mobile Store artifacts и history exports.
- PASS. Для каждого deployment составлен source→sink→owner mapping, есть digest и rollback target, seven-day baseline или явная отметка периода без данных. Секреты отсутствуют. Риск — дрейф грязной ветки и неавторизованные интерфейсы. Откат не нужен, A read-only. Gate для B — состояние доступа и baseline подтверждены; локальный дизайн может начаться до доступности Cloud UI.

### B. Uptrace, ingress и Alloy

- Цель. Отделить Prod/Nonprod и надёжно доставить OTLP canaries. Изменить config.alloy и docker-compose.prod.yml, Nginx ingress includes, ci-cd/scripts, scripts/observability/uptrace-read.mjs. Создать Nonprod project, service roles и secret mounts будущим этапом с соответствующими правами.
- Настройка. Alloy private OTLP, limits, persisted storage, relabel, dry-run filter; Hono security schema и rate limit, legacy disabled by default. Использовать separate endpoint/credentials. В staging inject internal OTLP logs/traces/metrics и malformed payload, проверить безопасный 4xx/2xx и долговечность.
- Команды. docker compose -f ci-cd/docker/docker-compose.prod.yml config --quiet; alloy validate на том же digest; node scripts/observability/uptrace-read.mjs; synthetic fixture runner против local sink и Nonprod. Эти команды относятся к будущей реализации.

- PASS. Каждый из трёх сигналов найден в ожидаемом проекте; секреты/ports недоступны; invalid payload rejected; buffering survives recreate. Риск — несовместимость Alloy или outage egress. Откат: отключить ветку Uptrace, вернуть config/digest, оставить YC и WAL, не удалять данные. Gate C–H — schema и ingest готовы.

### C. API, Worker, очереди, Jobs

- Цель. Доставлять HTTP/use-case/queue traces и все terminal errors. Файлы packages/logger/src/{serverTelemetry,UnifiedLogger,tracerServer}.ts, apps/api/src/{index,app,lib/operation-observability,middleware/error-handler}.ts, packages/queues/src/*, packages/worker/src/{index,health-server,chat2-outbox-worker,cron-scheduler,cloudru-media-dispatcher}.ts, feed/gallery/Bull Board entrypoints. Для durable outbox — additive schema и migration Prisma, существующие consumer wrappers.
- Команды. pnpm --filter @gafus/api test, pnpm --filter @gafus/worker test, pnpm check:core-boundaries, адресные real-PG/Redis QA из scripts/qa и node --test scripts/qa/otel-local-collector.test.mjs. Проверить mixed-version producers/consumers и 5xx без sampled trace.
- PASS. API→Queue→Worker→dependency spans связаны. Error log существует при ratio 0. Lag, retry и DLQ счётчики совпадают, нет regression business outcome, p95 delta <5% в сопоставимой нагрузке. Риск — duplicate reporters и обход trust. Откат flags отдельно, legacy AppTracer сохраняется, additive columns не откатывать удалением. Gate D/E — correlation API/collector contract зафиксирован.

### D. Web и внутренние панели

- Цель. Один браузерный collector для всех четырёх поверхностей. Файлы apps/web-vite/src/main.tsx, apps/admin-panel/src/admin-live/main.tsx, apps/trainer-panel/src/trainer-vite/live/main.tsx и preview, apps/bull-board/bull-board.ts, packages/error-handling/src/react/ErrorBoundary.tsx и новый browser-only transport, packages/core-client. Изменить Vite configs и соответствующие Nginx routes/CSP.
- Команды. pnpm test:web, pnpm --filter @gafus/admin-panel test, pnpm --filter @gafus/trainer-panel test, pnpm --filter @gafus/bull-board build. Сборка и Playwright matrix двух deploy revisions и offline flow.
- PASS. Render/async/chunk/network/resource/WS/video errors появляются ровно одним каноническим событием в каждом service; устаревшая вкладка остаётся работоспособной, secret scan чистый. Риск — reload loop/PII. Откат browser feature gate и предыдущий image, сохранить hashed chunks и maps. Gate J — G и эти tests PASS.

### E. Mobile JS

- Цель. Закончить delivery JS до массовой Store migration. Файлы apps/mobile/app/_layout.tsx, src/shared/lib/tracer и telemetry, apps/api/src/routes/v1/mobile-telemetry.ts, apps/api/src/modules/mobile-telemetry, packages/types/src/contracts/mobileTelemetry.ts, Prisma schema/migrations и packages/worker/src/mobile-telemetry-{export,spool-worker}.ts.
- Команды. pnpm test:mobile, pnpm test:api, адресные ingest.realpg.test.ts и mobile-telemetry-export.test.ts, device offline suite. Проверить app older runtime и invalid/replay/grant exhaustion. Доработать retry/partial, caps и очистку spool.
- PASS. Handled/render/rejection/fatal видимы в Nonprod, offline ack после relaunch, старые app paths проходят, drop metrics измеримы. Риск — AsyncStorage size, app startup overhead и double write. Откат ingress/producer отдельно, сохранить AppTracer и data TTL, mobile OTA rollback только для совместимого runtime. Gate F/G — JS contract стабилен.

### F. Native Mobile

- Цель. iOS PLCrashReporter BSD + MetricKit, Android Expo JVM + ExitInfo, bounded Breakpad experiment. Файлы app.config.js, app.json, apps/mobile/package.json, pnpm-lock.yaml, scripts/observe-preview-config.cjs, новый native diagnostics config plugin и native sources, apps/api/src/routes/v1/mobile-observe-preview.ts и observe-normalizer/repository. Для managed prebuild generated files не править отдельно от source plugin. Добавить CI gates privacy, autolink и binary endpoint.
- Команды. Изолированная QA сборка через существующие EAS profiles sdk57-testflight и sdk57-android-internal в apps/mobile/eas.json и gafus-sdk57-qa.yml, npx expo config --type public с фильтром чувствительных полей и проверка app bundle manifest. Команды prebuild выполнять только в специально разрешённом build runner. Real crashes в диагностическом flavor без debugger.
- PASS. iOS/Android native captures до JS, offline relaunch, known symbol frames. ANR/OOM classified по матрице и evidence класса. Эксперимент Breakpad FAIL — оставить API-specific documented gap и OS fallback, ограничить cohort/не удалять полезный legacy capture. Риск handler конфликт и store rejection. Откат остановкой rollout и предыдущей Store-линейкой либо hotfix build; OTA не меняет native collector. Gate J — F и G PASS.

### G. Карты и symbols

- Цель. Один достоверный release manifest до rollout. Файлы apps/mobile/scripts/prepare-sdk57-private-symbols.mjs, export-self-hosted-ota.mjs, self-hosted-ota-artifact.mjs, packages/mobile-ota-server, Vite configs, новый Worker symbol resolver и .github/workflows/gafus-{sdk57-qa,self-hosted-ota-preview}.yml, production release workflows.

- Команды. Проверка private manifests тестами текущего helper, xcrun dwarfdump --uuid, xcrun atos, llvm-readelf -n, llvm-symbolizer, R8 retrace, Metro symbolicate, synthetic maps lookups. Запрет publication .map и secrets в public dist.
- PASS. Known frames совпадают в двух последовательных builds и OTA rollback, wrong UUID/hash явно отклонён, PII/секретов в payload нет. Риск несовпадение архива и artifact. Откат resolver flag, safe unresolved frames, stop rollout если карты отсутствуют. Gate J — pass for every client release.

### H. Метрики и мобильный parity

- Цель. Расширить sources и сохранить YC до сравнения. Файлы config.alloy, docker-compose.prod.yml, ci-cd/docker/blackbox, prometheus/gafus-alerts.yml и promtool tests, worker health/metrics, node textfile backup, Centrifugo config, Beget/Cloud.ru readonly adapters. Отдельно проверить cAdvisor и ограничение scopes.
- Команды. alloy validate, promtool test rules ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml из рабочего каталога проекта, node scripts/observability/uptrace-read.mjs с PromQL, compose canary/staging reboot. Compare counters/rates/labels и восемь мобильных карточек.
- PASS. 14 дней overlap, доступность и latest freshness эквивалентны, counters/rates в пределах ±2% на выровненных окнах, все alert sources читаются. При probe disagreement разобрать probe target/window до зачёта. Риск noisy labels и CPU. Откат Uptrace ветки и cAdvisor, YC остаётся. Gate I/L — parity evidence.

### I. Дашборды, уведомления и внешний контроль

- Цель. Закрыть 12 панелей и paging. Файлы versioned definitions в ci-cd/observability/uptrace, новый внешний watchdog и runbook в этом же репозитории, scripts/observability/uptrace-read.mjs. Один канал Telegram плюс независимая доставка критических уведомлений.
- Команды. Импорт через подтверждённый API/YAML или проверенный UI; тестовые события и recovery в Nonprod; Viewer probes при смене token. Никаких реальных пользовательских alerts.
- PASS. Alert→page→ack→recovery на реальных каналах, проверка с двух телефонов, отсутствие alert storm, независимое обнаружение одновременного VPS/Uptrace failure. Риск entitlement/доставка. Откат новый channel config и watchdog, сохранить legacy alerts. Gate J/L — всё проверено.

### J. Production-like и production canary

- Цель. Перенести проверенный pipeline по одной группе без изменения бизнес-логики. Файлы production-deploy-reusable.yml, production-job-release-reusable.yml, compose, OTA rollout profiles, scripts/qa/observability-* и будущий telemetry-smoke.mjs.

- Команды. Smoke в isolated staging, полный pnpm typecheck и pnpm test плюс исходный набор контрольных регрессий проекта, затем approved deploy workflow, staging restart/reboot. Production synthetic smoke только безопасные непадающие тестовые paths и проверка пассивных событий.
- PASS. Матрица ниже, сохранены legacy сигналы, budget/load/no-data и rollback drill. Риск mixed versions, old clients и registry conflict. Откат на предыдущие digests/config, отключить источник по flags, сохранить spools. Gate K/L — 14 дней соответствия и сохранённый evidence package.

### K. История и retention

- Цель. Сохранить расследуемость существенных инцидентов и baseline. Снять метаданные дат/retain/export rights AppTracer и Yandex, составить approved export manifest. Настроить ограниченный one-shot sanitize для агрегатов, release/incident summaries.
- Команды. Provider read-only export, затем локальная проверка counts/coverage/hash, sandbox import 10 synthetic safe records с оригинальным timestamp, тест retention и duplicate ID.
- PASS. История доступна по архивной ссылке/экспорту, принимается решение по каждой группе. Риск import billing, unsupported backdated timestamps и PII. Откат удалить импорт только в test project и оставить legacy history read-only. Gate L — история и требования retention закрыты.

### L. Отключение старых источников

- Цель. Прекратить AppTracer, YC remote_write и YC sync после всех gates. Файлы apps/mobile/plugins/withAppTracerNative.js, tracer upload scripts, packages/logger/src/tracerServer.ts, Compose/env wiring, config.alloy, scripts/sync-metrics-to-yandex-native.py, .github/workflows, secrets store.
- Команды. Отключить per-source flags и сравнить counts, затем удалить providers по таблице ниже. Ротация/отзыв только после rollback window. Контроль legacy builds и бизнес-аналитики.
- PASS. 14 дней parity до отключения и 7 дней после, нет значимых orphan sources, Yandex business analytics/infra preserved, legacy history available. Риск older builds продолжают слать или теряют crashes. Откат прежние flags/Compose и credentials до отзыва. После revoke для отката выдать новые серверные ключи и оценить совместимость old client SDK.

### M. Финальная регрессия

- Цель. Повторить acceptance после удаления, закрепить бюджеты, ownership и recovery. Файлы test matrices, pinned release manifest, versioned dashboards и on-call runbook.
- Команды. Полный pnpm test и pnpm typecheck, smoke Mobile/Web/CI, provider-specific checks и тест restart/reboot/outage в staging. Проверить публичные bundles, rollout coverage и Viewer GET.

- PASS. Все финальные критерии ниже. Риск regressions после cleanup. Откат последней затронутой группы и повтор её gates, затем снова полный финальный проход.

## 16. Параллельная разработка и CI/CD

| Группа и владелец | Основные пути | Пересечение и порядок |
|---|---|---|
| Platform / SRE | ci-cd/docker/{docker-compose.prod.yml,prometheus/config.alloy,blackbox}, ci-cd/nginx, ci-cd/scripts, production-deploy-reusable.yml, infrastructure-jobs.yml | Один редактор Compose, Alloy и deploy. Сверять live config и локальный diff. Pin digest и тесты до merge |
| API / data | apps/api/src/lib и routes, packages/types/src/contracts/mobileTelemetry.ts, packages/prisma/schema.prisma и additive migration | В API и Prisma сотни активных путей. Собрать совместимый контракт после интеграции соседних миграций, один владелец schema |
| Worker / queues | packages/worker/src, packages/queues/src, packages/logger/src, apps/{feed-cloud,gallery-cloud,bull-board}, infra/cloudru | Logger contract до producers/consumers. Смешанные версии и все роли Cloud.ru Jobs |
| Web | apps/web-vite, apps/admin-panel/src/admin-live, apps/trainer-panel/src/trainer-vite, packages/error-handling и core-client | Независимый browser package после schema freeze; не вводить server runtime dependencies в browser |
| Mobile / release | apps/mobile/{app,src,plugins,native,scripts,app.config.js,app.json,package.json}, packages/mobile-ota-server, pnpm-lock.yaml, SDK57/OTA workflows | Согласовать параллельные StoreKit, OTA, splash/widget/Android startup. Один редактор lockfile и native config. JS и native slices по ownership |
| Acceptance / operations | scripts/qa/observability-*, scripts/observability, ci-cd/observability/uptrace | Сводный evidence, операционные владельцы, без редактирования продуктовых пакетов |

До реализации обновить status/diff и утвердить интегрированный baseline с владельцами исходных изменений. Не захватывать чужие untracked artifacts и не замещать shared files полным файлом. Начать с contract slices. Для Prisma и lockfile назначить владельца и последовательный handoff. Сохранять active checkout, новый worktree только при реальной изоляции dependency install/native build или независимом checkout runner. После каждой логической группы запускать адресные тесты. Полный прогон на J, перед L при изменениях и после M, плюс интегрированные сценарии восстановления. Использовать existing scripts/qa/observability-agent2-local-gates.sh, observability-otel-overhead.mjs, observability-promtool-rules.sh, observability-real-multi-instance-isolated.sh, observability-restore-rpo-rto.sh после проверки, что они работают с безопасной изолированной конфигурацией.

### Pipeline

1. PR. Schema fixtures для client/Jobs, retry/status/backoff matrix, trace-context injection tests, allowlist snapshots, dirty source verification. Docker compose config --quiet без распечатки env, alloy validate по digest со временными фиктивными секретами. Проверить сборку без env и негативный scanner на DSN/URL signing material, Expo native metadata и карты в публичном bundle. Сохранять только безопасные результаты.
2. Build. OCI org.opencontainers.image.revision, service.version и attested release manifest. Для Vite, Hermes, dSYM, R8 и ELF — upload/verify private artifacts до promotion. В CI сверить paths, content hashes и точный runtimeVersion. Release pipeline должен прерываться при несовпадении.
3. Staging. Deploy exact digest, проверить 3 OTLP signals, controlled recreate без удаления volumes, reboot rehearsal, before/after p95 и old/new clients. Использовать telemetry-smoke.mjs с canary traceId, максимальным deadline 180 с и status per source. Проверить cross-project isolation.
4. Production. GitHub Environment production, masked scoped secrets, approved workflow. .github/workflows/production-deploy-reusable.yml уже recreates Alloy/exporters/YC sync. Добавить readiness/smoke конкретной версии после recreate и проверку preserved WAL/state. API/Worker bootstrap при failed telemetry remains healthy. Release blocker для неправильного project, secret leakage и полного пропадания сигналов; бизнес rollback определяется причиной.
5. Cloud.ru release. .github/workflows/production-job-release-reusable.yml и infrastructure-jobs.yml, separate approval и registry auth, 4 Job receipt checks. Smoke не должен переактивировать retired Jobs.
6. OTA/Store. SDK57 QA workflow и self-hosted OTA preview, binary allowlist, native privacy declarations, cohort flags, подтверждённые manifest signatures и maps. Publication только после acceptance предыдущего этапа.
7. После deploy. Три production canaries — traces/logs/metrics; проверить receipt, freshness, expected services и отсутствие dup. Durable verification из CI с коротким timeout. Внешняя проверка переживает outage CI, VPS и Uptrace. Secrets injected из secret store, в YAML ссылки на secret names, без echo значений и shell tracing.

### Примеры команд для исполнителя

```bash
pnpm check:core-boundaries
pnpm --filter @gafus/api test
pnpm --filter @gafus/worker test
pnpm test:web
pnpm test:mobile
pnpm --filter @gafus/admin-panel test
pnpm --filter @gafus/trainer-panel test
node --test scripts/qa/otel-local-collector.test.mjs
docker compose -f ci-cd/docker/docker-compose.prod.yml config --quiet

promtool test rules ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml
```

Alloy validate запускать в CI контейнером из точно закреплённого образа, mount ci-cd/docker/prometheus read-only, env fixture, аргумент validate /etc/alloy/config.alloy и тот же stability.level, что в runtime. В запущенном Alloy 1.8.2 help показывает run и fmt без validate. Для этой версии использовать short isolated startup/health с synthetic sink. Для новой версии проверить validate и stability.level до переключения. Mobile QA инструменты запускаются только на тестовом build runner и устройствах. Reader и smoke scripts — deliverable реализации, предусмотреть exit 0 лишь после проверки ожидаемой записи, 2 для auth/scope, 3 для timeout/no-data, 4 для schema mismatch.

## 17. Тестовая матрица

Все тесты с отказами и падениями — в Nonprod, на тестовых устройствах, без реальных аккаунтов и PII. Каждая строка сохраняет suite version, build/digest, timestamp, тестовый case ID и read-only receipt. Нет receipt или trace в окне — FAIL. Для OS best-effort допускается документированный no-data только после контрольного получения OS reason/aggregate либо подтверждения отсутствия механизма на конкретном API, с отдельно проверенным алертом по поддержанному классу.

| ID | Сценарий | Критерий PASS |
|---|---|---|
| M01 | Handled JS, React render, unhandled JS | На iOS/Android по одному event на occurrence, type/route/version и читаемые frames |
| M02 | Fatal JS, rejection, rejectionhandled | Fatal переживает relaunch после записи; unhandled даёт событие, handled-later гасится по правилу |
| M03 | iOS native ObjC/Swift/segfault, до JS | Реальный release crash без debugger, signal, trusted build/UUID, после relaunch одно событие и known frame |
| M04 | Android JVM и NDK crash | JVM stack/retrace и NDK ABI/build ID/known frame где API даёт stream, reason-only маркирован на остальных |
| M05 | Android ANR, LMK/OOM и iOS hang/exit | Подтверждённые системные reason/aggregate раздельно, full stack только при наличии; no false attribution на force-quit |
| M06 | Background GPS/push/task | Safe task outcome при отказе и задержке. Exact coordinates/contacts отсутствуют |
| M07 | Offline crash и повтор после reboot | Очередь сохраняется, 429/backoff, доставка после сети и relaunch, eventId unchanged |
| M08 | OTA asset/verification/first-run fail и rollback | Упавший update ID, runtime, channel; embedded/rollback correct; old native build survives |
| M09 | Dedup AppTracer/Observe/native/system + privacy | Канонический один event, повторы count видимы, separate occurrences не сливаются |
| M10 | Video decoder error/crash | Safe decoder code и media provider alias, реальный process crash классифицирован отдельно |
| W01 | React render, rejection и resource error | Public/Admin/Trainer/Bull Board UI с правильным service, fallback и safe route |
| W02 | Chunk error, CDN, старая вкладка | Два deploy revisions, original map и no reload loop. Dirty form переживает failure |
| W03 | Network/API failure, WS reconnect, video load | Status/network types, safe trace correlation и offline retry; payload отсутствует |
| W04 | Source maps и unknown asset | Точный file:line:col, wrong hash → missing/mismatch, public map не доступна |
| B01 | API 500, DB timeout, Redis down | Terminal error найден с sampling=0, не содержит raw query/key. Service продолжается |
| B02 | Worker failure, retry, DLQ и external provider timeout | Attempts separate, один terminal event, scheduled loss detected, no leaked payload |
| B03 | API→Queue→Worker→External, старые envelopes | Parent/link корректен, старый job выполняется. Traceparent invalid/spoofed не управляет sampler |
| B04 | Log safety/partial/unknown ack | Privacy fixtures чистые, known reject в DLQ, mixed/ambiguous response обработан по политике |
| I01 | Docker restart и VPS reboot | Сохранённые spools/WAL восстанавливаются, no dead health, smoke всех сигналов |
| I02 | Low RAM/disk full | App remains healthy, quota enforced, lower priority drops, P1 и loss counters |
| I03 | Prometheus scrape failure | Up vs down vs no-data различимы, alert/recovery в заданных окнах |
| I04 | Uptrace outage и timeout | Circuit opens, внешнее уведомление, recovery drain без нагрузки выше лимита |
| I05 | DSN invalid/Viewer expiry | Ingest/read failures различены, rekey через canary, data retry |
| I06 | Quota exhaustion и storm | Приоритет FATAL, rate/cardinality guards и понятная оценка drops/overage |
| I07 | YC mobile parity и alert delivery | Все 8 карточек и свежесть с iOS/Android, page и recovery, запуск с дежурной учёткой |
| I08 | Cloud.ru, CDN, S3, Centrifugo, backup | Четыре Jobs и все provider health paths по inventory, delayed ack, edge fallback, freshness и restore |
| E01 | Mobile→API→Queue→Worker→Uptrace | Test grant и операция создают безопасную ошибку, связанные spans, logs, version, exact OTA ID и readable stack, реальный alert и Viewer query |
| E02 | Web→API→Queue→Worker→Uptrace | То же по Web deploy SHA и hashed asset, отдельно на public/admin/trainer; Bull Board UI/Node smoke |
| E03 | Deploy regression и privacy | Новый digest, старые клиенты, Viewer scope, отсутствие DSN/PII, сохранены analytics и rollback |

## 18. Production rollout, откат и decommission

1. Подготовить rollback manifest. Сохранить предыдущие OCI digests, конфиги Alloy/Nginx и secret references, cloud alert exports, текущий signed OTA manifest и список активных Store builds. Выполнить rehearsal на изолированном staging с теми же пределами ресурсов. Убедиться, что старый API/Worker читает прежние поля в presence новых additive migrations.
2. Включить серверный canary в Production только после J staging. Последовательно Alloy + probes, API/Worker safe signals, Cloud.ru one job per role, Web по app, Mobile JS по совместимому runtime, затем native Store builds. Для Web canary использовать отдельный routing cohort или release channel. Для self-hosted OTA начальные когорты 1%→5%→25%→50%→100%, минимум 24 ч/step или заранее установленный минимальный denominator. Android Store — staged rollout по возможностям канала. iOS — TestFlight canary и штатный App Store phased release 1/2/5/10/20/50/100% автообновлений; ручные загрузки могут получить версию сразу. [App Store phased release](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/) Для server toggle по источникам минимум 24 ч наблюдения на каждой логической группе. Для native crash latency учитывать relaunch и OS delay.
3. Stop gate. За пределами p95 +5%, аварийного p95 scrape lag, RAM <300 MiB, priority backlog >5 мин, ошибок auth, неправильного project, PII или нового crash fingerprint, влияющего на запуск, остановить продвижение. Сохранить evidence. Source gate выключается отдельно от всего приложения. Backlog не удалять. Если причина в версии, вернуть pinned digest/config либо signed compatible OTA. Store rollback через halt rollout и hotfix build с предыдущим исправным native кодом и новым допустимым номером версии. Уже установленные бинарники обычно не откатываются автоматически. Перед возвратом OTA проверить изменения local state.
4. Подтвердить 14 дней параллельного сбора для эквивалентных signals. Для mobile native пилот сравнивать одинаковые release cohorts и фактические системные diagnostics. Когда невозможно безопасно иметь два crash handlers в одном бинарнике, использовать отдельные сравнимые Store/TestFlight/internal cohorts, один writer на механизм. Следить за counts, stack quality, missing classes, delivery latency и дубликатами. Параллельная отправка только allowlisted сигналов с лимитами и без удвоения одного Uptrace event.
5. Отключать старый путь по одному источнику, сначала flags/disable sends, затем runtime wiring и CI. Держать rollback window 7 дней с метриками. Retire/revoke после подписи владельца группы. Контрольной точкой считать успешный тест с реальным дежурным и новый deploy/reboot после удаления.

| Система | Данные и паритет | Отключение/удаление | Секреты и откат |
|---|---|---|---|
| AppTracer Mobile JS | JS/errors/stacks/release. M01–M02, E01, две версии и offline, 14d comparable cohort | Переключить canonical reporter; удалить tracerUpload/mobileJsTracer vendor wiring и AppTracer map upload из release path после покрытия. Публичный reportClientError оставить как интерфейс | Разделить client ingest token и build uploader. Отзывать после проверки старых устройств и карты rollback |
| AppTracer native | iOS/Android crashes и исторические symbols. M03–M05 и coverage class/OS. Разница подтверждённых возможностей разрешается до отключения | Убрать withAppTracerNative в новом Store build после cohort PASS. Удалить Pods/Gradle deps/config hooks по мере выхода старых builds | Installed legacy binaries могут продолжать отправлять. Отзыв токена только после cutoff, явного принятия покрытия legacy и проверки server controls |
| AppTracer server | API/Worker/Bull Board errors, возможные другие LoggerFactory producers. Проверка terminal error при sampling=0, transport timeout и day compare | Сначала явный feature flag, потому что пустой TRACER_SERVER_ENABLED допускает production auto-enable. Удалить tracerServer.ts wiring после поиска всех consumers, env refs и workflow secrets | Серверный token после 7d window. При rollback вернуть старый backend/flag и временно действующий token |
| Yandex Monitoring | Remote write, PromQL/cloud alerts, history. 14d parity, real page/recovery и eight-card mobile view | Выключить YC ветку и native metrics sync раздельно. Удалить prometheus.remote_write.yc, yc_allowlist, Compose yandex-metrics-sync и script из deploy, затем legacy alert configs | Узкий YC monitoring writer revoke только после проверки общих IAM consumers. Rollback восстановить YAML, sync и прежнюю alert routing |
| AppMetrica | Product analytics, возможный auto-crash SDK | Сохранить activate/capture и consent. Проверить настройки версии AppMetrica SDK; выключить только diagnostics при доказанном auto-crash и Uptrace native parity | Analytics keys/конфиг сохраняются. Rollback только соответствующим native config |
| Yandex Metrica и прочие analytics | Продуктовые/рекламные события, параметры consent и воронки | Сохранить adapters. Сверить business event counts и consent на 2 релизах | Не отзывать analytics access |
| Yandex cloud services/Storage/CDN/fallback | Инфраструктурные функции, возможно active fallback | Сохранить прикладные интеграции. Перенести только экспорт health/latency/technical signals | Не отзывать общие workload keys, подтвердить scopes до cleanup |
| Локальные логи, Store diagnostics, GitHub Actions | Short operational buffer и provider diagnostics, релизы и артефакты | Сохранить bounded rotation и обязательную платформенную диагностику. Прекратить лишнюю облачную отправку и дублирующие дашборды | Отдельные локальные права и retention. Не использовать историю как второй живой cloud sink |

История. По умолчанию оставить AppTracer и YC историю read-only до естественного retention/cutoff, отключив активную отправку после L. Сохранить только подтверждённые incident summaries, release markers, 7/30d агрегаты и соответствие fingerprint/версия. Массовый raw import не требуется. Для истории с требованиями расследования проверить права экспорта, юридический срок, отсутствие PII, timestamps, Uptrace acceptance и расходы. После approval импортировать выбранные safe summaries как historical=true с original timestamp/coverage, или оставить закрытый конечный архив без непрерывного пополнения, если Cloud не принимает старые даты. Повторный импорт idempotent по manifest hash, original IDs salted/allowlisted. Алерты игнорируют backfill. Проверить доступ к архиву через действующий Viewer/owner после отключения источника.

## 19. Финальная приёмка и незакрытые проверки

| Критерий | PASS | FAIL |
|---|---|---|
| Все runtime источники | Source manifest сверяется с deployed binaries/Jobs, в Uptrace есть heartbeat и occurrence или проверенный synthetic marker по каждому service | Нет runtime, подтверждён только source code |
| Mobile JS | M01–M02, M07 и E01 на iOS/Android, exact build/OTA, safe stack | Пропуск класса, fatal loss после гарантированного commit или неверная версия |
| Native iOS/Android | Реальные M03–M04, readable app frames, отдельный cold/offline evidence, coverage по OS min/modern | Только SDK или имитация, необъяснимый reason-only там, где ОС отдала стек |
| ANR, OOM, watchdog | M05, system-confirmed причины, visibility и ограничения API, отдельные агрегаты и unknown | Смешение signal/kill и подтверждённой причины, потеря доступного trace |
| Web, Admin, Trainer, Bull Board | W01–W04, два Web releases и ошибки old tab, verified source maps | Ошибки видны только в одном фронте или с неверной картой |
| API/Worker/Jobs и трассы | B01–B04, E01/E02, verified parent/link и unsampled error visibility через Viewer | Пропал unsampled ERROR, context или operation ID |
| Логи и privacy | Structured schema, bounded writes, secret/PII fixtures и client bundle scans | Raw payload, DSN, query, GPS, SQL args, токены или PII в конечной записи |
| Metrics и системные источники | H и I03/I08, 14d parity, DB/Redis/CDN/Cloud.ru metrics/health | YC signals отсутствуют без принятой полноценной замены |
| Release и символизация | G и M08, known Web/Hermes/NDK/R8/iOS frames, exact hashes, OTA rollback | Wrong map/UUID, непроверенная карта, ошибка версии |
| Панели и оповещения | 12 панелей, on-call mobile workflow, фактический page/recovery, независимый watchdog | Панель пустая или уведомление не доставлено |
| Отказоустойчивость | I01–I06 и post-deploy smoke, measured p95/RAM/disk, loss accounting, recoverable backlog | Телеметрия ломает бизнес, пропадает после reboot или нарушает лимит |
| Экономика | Аккаунт проверен, model calibrated, alerts 60/75/90%, billing decision и пределы согласованы | Quota/retention неизвестны перед production, growth unbounded |
| Legacy и аналитика | AppTracer/YC безопасно выключены, важные legacy capabilities заменены, продуктовые события работают | Ранний revoke, активный второй observability sink или потеря analytics |
| Откат и доступ | Tested rollback, Viewer read по сервисам, логам, трассам/метрикам, expiry monitoring | Нет on-call доступа, rollback не проверен |
| Заключительный regression | M и полный утверждённый набор регрессий, зафиксированные результаты на production-like и безопасные production smoke | Успех основан только на local tests/CI без ingest evidence |

Точные эксперименты с открытыми решениями:

- **Cloud account (A/B).** Открыть Billing/Usage/Retention и Members/Projects после восстановления авторизованной Chrome сессии. Зафиксировать цифры, overage/free behavior, поддерживаемые alert channels и наличие Viewer доступа к budget без screenshot секретов. На Nonprod отработать mock 429 и проверить документированное реальное поведение через support/plan, не исчерпывать production quota.
- **Read-only API (B/I).** Создать безопасные Nonprod log без trace, native log, trace, group, counter и histogram. Сопоставить UI, stable spans/groups, documented advanced query и Prometheus range. Если standalone logs доступны только в UI, проверить поддерживаемый read API/MCP со scoped role. Если прямого поддерживаемого пути нет, совместимый error span нужен как каноническая запись для данного класса, с проверкой алертов и без второго копирования stack. Если доступ всё равно отсутствует, финальный критерий не закрыт.

- **Expo SDK (F).** Сопоставить payload 57.0.28 с fixtures, exact Expo project path, supported config keys, iOS/Android retention, retry/timestamps, offline and restart. Проверить default egress и guard. Бинарник допускается к rollout только при подтверждённой доставке исключительно в GAFUS. SDK57 metrics 501 заменять только на реальную обработку и ack.
- **Native coverage (F/G).** Физические release builds с разными OS, intentional QA exceptions и low memory/watchdog/ANR classes, kill before JS, offline→relaunch, no debugger. Сравнить stack/UUID/ELF и Apple/Android system records. Test Breakpad в isolated build на API 24–30, memory privacy/handler chaining. Для неизвестных причин установить precise support boundary, сохранить полезный legacy channel до решения по этим устройствам.
- **Symbols (G).** Два выпуска каждого Web, iOS/Android embedded и OTA; намеренно подменить map/UUID. Проверить native resolver against atos/retrace/llvm. Uptrace Web sourcemap upload и Sentry compatibility — необязательные только при PASS основного resolver.
- **Infrastructure parity (H/J).** Проверить stage Alloy validate, hard disk/RAM limits и recreate WAL. Реальный read-only inventory Cloud.ru двух проектов, Beget edge aliases/тарифные счётчики, Redis scrape, Centrifugo private metrics. Настроить source health для необслуживаемого provider API. На 14d overlap выгрузить comparison reports без PII.
- **Legacy/analytics (K/L).** Установить фактическую delivery AppTracer по клиентским версиям и серверам, retention/export rights, AppMetrica RN auto-crash настройки и parity product events. Сравнить Yandex app on-call flow на обоих телефонах. Получить подтверждение, что legacy builds либо покрыты, либо out-of-support с принятым cutoff. Без этого отключение не прошло.

## 20. Официальные источники

- Uptrace. [OpenAPI](https://developers.uptrace.dev/openapi.yaml), [Cloud pricing](https://uptrace.dev/pricing), [OTLP getting started](https://uptrace.dev/get), [Logs](https://uptrace.dev/opentelemetry/logs), [Prometheus ingest](https://uptrace.dev/ingest/prometheus), [Prometheus query](https://uptrace.dev/features/grafana), [Span query](https://uptrace.dev/features/traces/querying-spans), [Source maps](https://uptrace.dev/features/sourcemaps), [Sentry SDK](https://uptrace.dev/ingest/sentry), [Alerts](https://uptrace.dev/features/alerting).

- Expo. [SDK 57 Observe](https://docs.expo.dev/versions/v57.0.0/sdk/observe/), [Observe configuration](https://docs.expo.dev/eas/observe/configuration/), [Native error reporting](https://docs.expo.dev/eas/observe/errors/), [Store declarations](https://docs.expo.dev/eas/observe/reference/store-privacy-declarations/), [Hermes](https://docs.expo.dev/guides/using-hermes/), [Expo Updates recovery](https://docs.expo.dev/eas-update/error-recovery/).
- Apple и Android. [MetricKit](https://developer.apple.com/documentation/metrickit), [Apple symbolication](https://developer.apple.com/documentation/xcode/adding-identifiable-symbol-names-to-a-crash-report), [PLCrashReporter](https://github.com/microsoft/plcrashreporter), [Android ApplicationExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo), [NDK stack](https://developer.android.com/ndk/guides/ndk-stack), [R8 Retrace](https://developer.android.com/tools/retrace).
- Alloy и OTel. [Alloy v1.8.2 source](https://github.com/grafana/alloy/blob/v1.8.2/internal/component/all/all.go), [Alloy private access](https://grafana.com/docs/alloy/latest/access_permissions/), [OTLP exporter](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.exporter.otlphttp/), [Persistent queues](https://opentelemetry.io/docs/collector/resiliency/), [OTLP spec](https://opentelemetry.io/docs/specs/otlp/), [Trace Context](https://www.w3.org/TR/trace-context/).

## 21. Фиксация результатов и контракты для начала реализации

Production RepoDigests, снятые read-only в пределах данного снимка. Использовать для сравнения, перед выкладкой обновить и проверить соответствие конфигурации.

| Сервис | sha256 RepoDigest |
|---|---|
| API | f8f6781fa4d931a3d3359a4aee8d3828218aa99d83b259a522fd56544828a705 |
| Worker | 5c34acc8aacadc2340df01c9a11a1d9c512eca12d4b21aad45e6bbbe6bd1bd23 |
| Web | 29c794e2ac1ce95ebcb1eab01421fab836f3d832791b289dfb5569873744e265 |
| Trainer | cae542eccfa48a0dda629dce158eb70afa431caa7052cabe25e219c01f281b58 |
| Admin | f12465c83e3c902cb8d4bc7f49cca4d4e6c6e24d08e716b5d94ca4e67a3f9e6f |
| Bull Board | f3271d5d4b6095685c373fe66e557976beabfa6e067930c4f5cc94d1b23422a6 |

Дополнительная проверка исходников. Поиск по 2 245 JS/TS-файлам в исходных каталогах apps и packages, с исключением обычных test/build/generated directories, нашёл catch в 728 файлах и logger/console в 199. Это file-level inventory поверх regexp, не исчерпывающий список runtime handlers. Повторить с символами import/alias и разрешением package exports на A. Проверка Beget service GET из Worker для feed/gallery не вернула доступный ответ. Live provider-side metrics остаются открыты. Production Worker содержит имена Cloud.ru credentials, но это не подтверждает scopes, состояние четырёх Jobs или право использовать/выпускать токены. На A получить read-only inventory с выделенной разрешённой учёткой. Существующий infra/cloudru/production-job-release.mjs --plan показывает targets локально, --preflight/--verify требуют настроенного workflow и доступа к IAM; не обходить guard подстановкой ложного release SHA. [Beget GET helper](../../infra/cloudru/beget-cdn-readonly-diagnostic.mjs), [Cloud.ru release](../../infra/cloudru/production-job-release.mjs).

Существующий Yandex monitoring toolchain шире одного sync: scripts/deploy-general-dashboard.py, import-dashboards-to-yandex.sh, normalize-yandex-monitoring-dashboard.py, apply-yc-monitoring-importer-patch.py и yandex-monitoring-proto-json.py. Некоторые инструменты записывают/заменяют панели; их только инвентаризировать до L. Daily backup сейчас вызывает ci-cd/scripts/backup-to-yandex.sh. Этот бизнес-критичный backup отдельно от Yandex Monitoring; в Uptrace переносится метрика freshness/restore. [Yandex dashboard](../../scripts/deploy-general-dashboard.py), [Daily backup](../../.github/workflows/daily-backup.yml).

AppMetrica adapter вызывает activate с одним apiKey. Android SDK документирует включённый по умолчанию crash reporting и отдельный native crash switch. iOS SDK описывает настройки autoCrashTracking и probablyUnhandledCrashReporting. Для RN wrapper выяснить exact flags и wiring из установленного SDK до смены. Если wrapper не покрывает оба флага, выключать их на нативном уровне в новой Store сборке, сохраняя product activation. [AppMetrica Android](https://appmetrica.yandex.com/docs/en/sdk/android/analytics/android-operations.html), [AppMetrica iOS](https://appmetrica.yandex.com/docs/en/sdk/ios/analytics/migration-io-5-0-0).

Практические проверки C/E перед включением:

- В текущем startCorrelatedSpan sampling зависит от первых цифр входящего trace ID. Клиент может выбирать это значение. Для public root создать собственный ID или серверный независимый sampling gate. Для internal child применять доверенный active parent; передача нового spanId через случайную подстановку для traceId без parent создаёт dangling parent, такой случай перевести в root с link. Сравнить children в UI и API.
- Не менять формат MobileTelemetryEventV1 для старых клиентов. Текущий sanitizer заменяет JS URI на bundle:line:col и держит до 50 frames, поэтому для Web с несколькими чанками и native UUID/Build ID нужен отдельный structured frame schema с asset/module ID, а не обход sanitize. Обратная совместимость через версии event envelope и additive migration.
- Сейчас Worker выбирает 20 строк последовательно раз в 15 с, lease 120 с и in-process draining. Верхняя граница при одном проходе за тик — 115 200/сут, при сетевых timeouts заметно меньше. Измерить sustained rate, implement bounded concurrency и хранить priority. Cleanup запускать независимо от успешности exporter ticks. Тест с выключенным exporter доказывает TTL purge. Разделить expired pending, expired exported и DLQ, чтобы отличать потерю от очистки.
- Режимы уже в дереве. GAFUS_TELEMETRY_INGEST_ENABLED, GAFUS_TELEMETRY_EXPORT_ENABLED, GAFUS_TELEMETRY_ENVIRONMENT и GAFUS_TELEMETRY_PRODUCTION_APPROVED остаются независимыми. EXPO_PUBLIC_TELEMETRY_ENABLED — client bool, не секрет. Старый Observe preview gate использует GAFUS_OBSERVE_EXPERIMENT_INGEST_ENABLED и project ID. Для staging добавить поддерживаемый env через обновлённую schema, до этого staging test profile использует preview. На каждом deploy проверить наличие флагов без значений секретов.

- Выполнение E01/E02. Создать Nonprod-only synthetic route с dedicated grant, request id и short TTL. Клиент создаёт operation.id, route ставит тестовый job в выделенную очередь, Worker зовёт локальный fake dependency, получает заранее выбранный safe failure и пишет один terminal event. Клиент получает safe diagnostic failure и пишет свой канонический error. Критерии — связь по trace/link и operation ID, точный release, readable frames, alert receipt, Viewer lookup и отсутствие побочных бизнес-операций. Повторить с sampling=0 для standalone error visibility. Отключить тестовый route в production, production smoke использует безвредные canary records.
