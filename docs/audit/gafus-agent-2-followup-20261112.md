# Агент 2 — итог продолжения, 12 ноября 2026

Родительский коммит `751a435ec`, worktree `/Users/asmtv1/Desktop/gafus-agent2-observability`, ветка `agent2/observability-20261111`. Команды выполнялись на Mac в отдельных приватных портах и каталогах, без production, Cloud.ru, Beget и пользовательских данных. Факты подтверждает версионируемый обезличенный `gafus-agent-2-observability-local-receipt-20261112.json`; полные сырые JSON/JSONL находятся в локальном каталоге `artifacts/a2-obs-*` (не в Git).

## Базовая нагрузка, топология, метрики

- Два **реальных** Hono API (56244/56245), два **реальных** Chat2 Worker (56246/56247), отдельные PostgreSQL на 56241, Redis на 56242, Centrifugo на 56243 и локальный поисковый OTLP-приёмник на 56248. Все адреса `127.0.0.1`, полный Prisma schema, синтетическая комната/Outbox, подтверждённые pending и DLQ. В каждый проход стенд создаётся с нуля и удаляется.
- Для сравнения `GET /ready`: до и после восстановления PostgreSQL одинаковые **три заранее заданных окна по 12 секунд**, 2 сек разогрев перед каждым; 30 запросов/с в норме, трёхкратный burst, concurrency 28. Медиану p95 считаем по трём запускам, все сырые измерения сохраняем, ошибки и потери генератора запрещены, порог p95 **+20%**. Это сравнение того **же кода до/после восстановления**, не релизных версий.

| Параметр | До отказа | После восстановления |
| --- | ---: | ---: |
| RPS | 45 | 45 |
| Ошибки / drops | 0% / 0% | 0% / 0% |
| p50, мс | 5,66 | 4,82 |
| p95, мс | 7,63 | 7,02 |
| p99, мс | 12,67 | 12,27 |

**p95: −7,99%, PASS**. Все p95 окон до: `[8.75,6.35,7.63]`, после: `[6.7,7.02,7.69]`. Первый единичный короткий прогон обнаружил +22,8% и был честно признан FAIL. Вместо повышения порога добавлен воспроизводимый трёхоконный компаратор `scripts/qa/observability-load-median.mjs` и 3 отрицательных/позитивных unit-теста. Это *readiness-профиль*: нагрузка на Chat/ACL и 360p/Cloud остаётся PENDING.

## Шаг 4, приёмка 16 — наблюдаемость

- Реальная цепочка **HTTP → Application → PostgreSQL Outbox → два Worker → Centrifugo → новый HTTP callback**: **6 связанных spans** доступны по сохранённому `operationId` в изолированном поисковом OTLP HTTP sink. У callback новый `traceId`, идентификатор операции тот же. `scripts/qa/observability-local-trace-sink.mjs` сохраняет только ограниченные safe поля, работает во временном каталоге, не претендует на Jaeger/Tempo в staging. Настоящий Cloud Job, callback 360p, исторические журналы и развёрнутое searchable storage **PENDING**.
- Подключено реальное ожидание Prisma connection pool: `prisma_client_queries_wait_histogram_ms` → корректные cumulative bucket `db_pool_wait_seconds` + `db_pool_wait_metrics_fresh`, строго отдельно от `db_query_duration_seconds`. Нужна генерация `PrismaClient` с `previewFeatures=["metrics"]`. Сбор выполняется только при валидном секретном Bearer на `/internal/metrics`, timeout 400 мс, отказ метрики не срывает HTTP. Тестировано на реальной одноразовой PostgreSQL; unit проверяет PII-free labels, корректные секунды и негативные случаи. Контекстные интеграционные файлы `apps/api/src/app.ts` и Compose принадлежат агенту 1 — **не коммитить их здесь**.
- Отказ коллектора не ломает пользовательскую операцию, JSON error diagnostic не выводит токены, SQL, cookie, тело чатов. Ротация и срок хранения production-логов и overhead при равном профиле **PENDING**.

## Шаг 5, приёмка 17 — метрики и оповещения

- Alloy allowlist расширен на `db_pool_wait_seconds_(bucket|sum|count)` и `db_pool_wait_metrics_fresh`. Grafana Storage/Dependencies: **10 панелей** вместо 8, включая pool-wait p95 и свежесть чтения; остальные три исходных представления API, Media/Chat, Operations сохранены. Работали настоящие два API metrics endpoints с проверкой аутентификации и два Worker counters. Никаких `userId/messageId/requestId/operationId` в Prometheus labels.
- Существующий Prometheus имеет **25 правил**. Ранее `promtool` проверил исходные fixtures; реальный локальный Prometheus → Alertmanager → webhook доставил пары **firing + resolved** для stuck 360p и Chat2 DLQ (квитанция `artifacts/a2-obs-alert-delivery-summary.json`). Расширены отдельные Promtool fixtures до **12 групп** (итого 20 с основными) на API 5xx малой/большой выборки, p95, Workers no-success, retry storm, lost worker metric, PG/Redis/HTTP failure и восстановление. Новые YAML и статический контракт проходят, но новый `promtool test rules` **PENDING**: GitHub release-assets и Homebrew GHCR возвращают `curl 35 / connection reset by peer`. Не выдавать YAML parse за promtool PASS. Исполняемый runner `bash scripts/qa/observability-promtool-rules.sh` готов; после устранения сетевого блокера проверить его и локальную доставку, а затем рабочий тестовый recipient на одобренном staging.

## Шаг 8 — PostgreSQL/Redis outage и полный restore

- Реальные API при остановке одноразовой PG и Redis переходили в **503 readiness**, после восстановления оба API и оба Worker стали ready без перезапуска процессов — PASS.
- Реальная авария PG с запуском **нового** PostgreSQL data-dir и `pg_restore`: сохранённые pending и DLQ восстановлены; post-backup подтверждённая запись ожидаемо отсутствует, ранее подтверждённая запись присутствует. Worker после восстановления опубликовал и ACK-нул pending через Centrifugo — PASS.
- **Локальный RTO = 2906 мс** (с момента аварии до ready двух API и двух Workers), наблюдаемый интервал RPO **355 мс** между восстановленной и сознательно утерянной подтверждёнными записями, одна синтетическая post-backup запись утеряна, обработка восстановленного pending **2080 мс**. Это не production RPO/RTO. Воспроизводит `scripts/qa/observability-real-multi-instance-isolated.sh`: отдельный PG в UTC (важно для timestamp Prisma), точные порты 56241–56248, валидация data-dir, удаление только тестовых процессов. После PASS утечек слушателей не обнаружено.

## Регрессия, ограничения и координация

| Проверка | Результат |
| --- | --- |
| Групповой `A2_OBS_WITH_DB_RESTORE=1 bash scripts/qa/observability-agent2-local-gates.sh` | **12/12 PASS** после добавления micro overhead, logging и staging preflight, job `19dbdd315b7bdd4f55d73a32f99fa74f52b63f96afe7bb13`, exit 0 |
| Реальный стенд `bash scripts/qa/observability-real-multi-instance-isolated.sh` | PASS, job `32689c036d5e96d1dec89967eb51488f10fdc589bf944c5b` (exit 0), все 6 окон |
| `observability-load-median.test.mjs` | 3/3 PASS |
| `otel-local-collector.test.mjs` | 5/5 PASS |
| `health-monitoring.contract.test.mjs` | 7/7 PASS |
| API и Worker typecheck на локальном snapshot с overlay | PASS |
| Workspace typecheck | Ранее 75/75 PASS, повторить на совмещённом кандидате |
| Общая регрессия 33 этапа, Web/Mobile/Admin/Trainer, 18 сценариев | PENDING на совмещённом кандидате; соседний `a1-arch-final-20261112c`: 27 PASS, затем **Web FAIL** в *двух разных* тестах: `PrincipalIsolation.test.tsx` (textarea ещё не смонтирован) и `VkConsentWeb.test.tsx` (ещё виден fallback «Загружаем страницу…»); нельзя принять весь прогон. Отдельный адресный `VkConsentWeb.test.tsx` **1/1 PASS**, job `d0d8831208fd82cb84f98154e0ea48e68aeeb68a4d4b8485`; выдаёт предупреждения React `act`/Suspense, вероятна зависимость от асинхронного рендера/нагрузки. Точный ремонт Web-тестов — зона агента 1, поэтому здесь они не изменены |
| Общая 5-phase chaos | Агент 1 отдельно фиксировал 5/5 PASS на своём снимке, наши stand/restore не заменяют совместную матрицу |
| Расширенные промтул-фикстуры и реальный канал | PENDING: скачивание promtool недоступно; стендовый endpoint и тестовый recipient ещё не разрешены |
| Реальный Cloud.ru Job 360p / Beget CDN / callback / поиск в исторических журналах | PENDING: выделенный Cloud тестовый Job/хранилище, callback, OTLP backend и помощь агента 3 |
| Canary 10→25→50→100%, old/new schema и rollback | PENDING: два собранных релиза и согласованный изолированный стенд; runbook в исходном отчёте |

**Строка 16 из 18:** LOCAL PASS / EXTERNAL PENDING. **Строка 17 из 18:** LOCAL PASS / EXTERNAL PENDING. Остальные строки 1–15, 18 ведут агенты 1/3; неподтверждённое нельзя переводить в PASS.

**Для интеграции:** агент 1 сохраняет middleware `operationMetricsMiddleware`, protected `/internal/metrics`, `API_METRICS_KEY`, OTLP env в compose и одну общую финальную регрессию после исправления VK Consent. Агент 3 сохраняет Chat2 fencing, Worker attempts, persisted `operationId/traceId`, реальные Cloud jobId/attempt/callback; не дублировать его инфраструктуру. В нашем коммите — только отдельный generator-hunk Prisma metrics; остальные изменения `schema.prisma`, `apps/api/src/app.ts`, `packages/worker/src/chat2-outbox-worker.ts`, `ci-cd/docker/docker-compose.prod.yml` — наложения от параллельной интеграции, их не включать. После слияния повторить 33-stage, 5-chaos и две строки приёмки на **едином** SHA.

**Итог:** локальная реализация воспроизводима, но общий план нельзя честно назвать завершённым до внешних Gate 16/17, облачного видео/ACL и staging release/rollback. Production не затрагивался.

## Дополнение: воспроизводимость метрик и накладных расходов (12.11, продолжение)

- Повторный прогон с одними и теми же тремя окнами выявил на разделяемом Mac **+47,37% p95**, несмотря на 0% HTTP-ошибок; предыдущее измерение было −7,99%. Поэтому **не объявляем baseline/candidate производительность стабильно принятой**, пока не запущено A/B старого и нового кода на отдельном стенде при одинаковом CPU/RAM, dataset и сетевом профиле. Измерение локального readiness до/после аварии не эквивалентно релизному A/B. Компаратор не подменён подбором «хорошего» окна: отрицательный результат зафиксирован в отчёте; его старые raw-окна были перезаписаны до исправления архивации. Теперь каждый следующий прогон предварительно копирует предыдущие полные JSON/JSONL и квитанции в `artifacts/a2-obs-history/`.
- Новый полный local run `fb9a0461e7a0d1d971fcb6be83643b877a022f03eac27fb6` и `99033100ad6b9d93a3ab513c7b7b3f241a978a33e8c2d2f0` отделяют функциональные gates от регрессионного порога p95. Последний **exit 0**: p95 **9,52→11,09 мс, +16,49%** на трёх заранее заданных окнах, обе API выдержали тест без ошибок. Но ранний FAIL показывает необходимость независимой реплики для финальной приёмки.
- **Реальный restart Worker** в рамках `99033100...` проверяет последовательность: одну реплику остановили; вторая обработала outbox (счётчик доставок был **1**); затем её остановили, убедились, что `/metrics` исчез, запустили снова и проверили **сброс до 0**, доставку новой записи и рост обратно до **1**; обе реплики снова ready. Источник отсутствует во время остановки, но Prometheus `up`/Alertmanager `firing/resolved` для него **PENDING**, поскольку соответствующая внешняя утилита недоступна. Квитанция: `artifacts/a2-obs-worker-metric-restart.json`.
- Локальный OTel **микробенчмарк** (не HTTP/SQL): 3 заранее чередуемых независимых процесса с семплированием 0/1, 80 warmup + 1000 операций на окно, реальные два вложенных spans и локальный HTTP sink. Два локальных измерения медианного p95 синтетического span/async scope: **0,003→0,024 мс** (разница +0,021 мс) и **0,005→0,042 мс** (разница +0,037 мс); относительный рост 700–740% при очень малых исходных значениях; в каждом прогоне по **6480 spans** доставлено. Это накладные расходы только библиотечного пути, нельзя переносить процент на производительность Hono/Prisma или прод. Скрипт `node scripts/qa/observability-otel-overhead.mjs`, квитанция `artifacts/a2-obs-otel-overhead.json`.

## Логи: ограничение хранения без изменения production

Подготовлен отдельный, **не подключённый автоматически** overlay `ci-cd/docker/docker-compose.observability-logs.yml` для 18 сервисов. Драйвер `local`, сжатие и жёсткие лимиты: API и Worker максимум `20m × 5` каждый; остальные — `5m × 3`. Максимальное хранимое тело до сжатия не более **440 MiB** на все сервисы (не включая Docker metadata); временной срок **в днях не гарантирован**, он зависит от потока записей. Контракт `ci-cd/docker/observability-log-rotation.contract.test.mjs` — 3/3 PASS, также проверен `docker compose config --quiet` на **синтетическом минимальном base Compose без production secrets**, exit 0. Для настоящего rollout нужен review и подключение overlay к *согласованному* Docker Compose командой `-f` **в тестовом окружении**; существующий prod compose не менялся. Срок хранения на реальном окружении и работа ротации в живом Docker: PENDING.

## Staging gate: строгое отсутствие автоматических внешних действий

`node scripts/qa/observability-staging-preflight.mjs docs/audit/gafus-agent-2-staging-evidence-template.json` (пока **PENDING / exit 2**) либо проверка настоящего evidence manifest после выдачи изолированного стенда — **только чтение и проверка деклараций**, никаких API-вызовов, SSH, Cloud Job, переключения флагов или уведомлений. Требует подтверждённые `staging` и тестовый recipient, отдельную PostgreSQL/Redis/Cloud Job/объектное хранилище, безопасные `.test`/`.internal`/localhost endpoints, разные SHA-256 digests старой и новой версии API/Worker, expand-only миграции со старым кодом, подтверждённый backup, canary 10→25→50→100%, rollback приложения+флага с сохранением outbox/DLQ, настоящий Cloud 360p, OTLP search и исторические записи, firing/resolved, общий набор 18/33/5 тестов и staged RPO/RTO. **5/5 отрицательных и позитивных unit-тестов PASS**. Результат `READY_FOR_INDEPENDENT_VERIFICATION` — лишь полнота *заявлений*, не подтверждение истинности: обязателен независимый просмотр исходных квитанций.

Требуемые внешние условия остаются: отдельный Cloud.ru **test Job 360p**, staging Beget CDN, callback receiver и тестовая object storage, реальная поисковая OTLP инсталляция с историей, тестовый Alertmanager recipient, свежий backup и доступ к одноразовому PG/Redis, два имиджа с digest и изолированный канареечный маршрут. **Ничего из этого на production не запускалось.** Для локального повтора: `A2_OBS_WITH_DB_RESTORE=1 A2_OBS_WITH_OTEL_BENCH=1 bash scripts/qa/observability-agent2-local-gates.sh`; для тяжёлого стенда дополнительно `A2_OBS_WITH_REAL_MULTI=1`; для настоящего promtool после доступности бинарника `A2_OBS_WITH_PROMTOOL=1`.


## Последние адресные архитектурные проверки

На текущем агентском worktree (включая временные overlay от соседних агентов) завершён `pnpm check:core-boundaries && node scripts/check-workspace-graph.mjs && node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs`: **14/14 тестов boundary, 46 проектов и 0 циклов, 6/6 контрактов release/workspace PASS**, job `db0c7129c881a354d9e6fe6ee1dcb76644f9346d30a8650b` exit 0. Эти адресные результаты не подменяют 33-этапный общий regression.

Старый общий Web FAIL воспроизводился в чанке по **двум разным файлам** (`PrincipalIsolation.test.tsx` — textarea не появился к моменту проверки; `VkConsentWeb.test.tsx` — ещё показывался Suspense fallback). Адресный `VkConsentWeb.test.tsx` **1/1 PASS**, но с React `act`/Suspense warnings, job `d0d8831208fd82cb84f98154e0ea48e68a4d4b8485`; следовательно проблему зависимости от асинхронного рендера/нагрузки считать **неисправленной**, пока не пройдёт полный чанк на совмещённом SHA.

После дополнительного повторения все локальные `A2` gates **12/12 PASS** (включая isolated database restore, logging, staging preflight, OTLP microbenchmark). Для extended Promtool/Alertmanager и всех внешних staging сценариев остаётся строгий PENDING. Последний commit перед этой припиской: `fbd89d62a`; полный итог только после независимого объединённого приёмочного прогона.
