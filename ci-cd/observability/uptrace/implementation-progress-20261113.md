# GAFUS → Uptrace Cloud: реализация, checkpoint 13.11.2026

**ОБНОВЛЕНИЕ:** Cloud Nonprod реальные сигналы + полный Hono→PostgreSQL→Worker→Uptrace E2E проверены. Финальный актуальный раздел — внизу. Исторические ограничения ниже относятся к предыдущему checkpoint.


Источник: `docs/audit/gafus-uptrace-cloud-migration-plan-20261113.md`.
Рабочая папка: `/Users/asmtv1/Desktop/gafus-refactor`.
Начальный HEAD: `0dcd18c13c8d567d543d1981b18d3caa52b16503`.
В рабочем дереве сотни чужих изменённых/untracked путей — не выполнять
`git clean`, `git reset`, `git checkout`, массовый коммит или merge.
Не путать **локальную реализацию кода** с **подтверждённым production ingest**.

## Доставленная локальная реализация

1. Развязка API/Worker от прямых Prisma зависимостей в диагностике.
   Все пять операций grant/ingest, preview Observe, spool CAS/lease/ACK,
   TTL/DLQ, metrics находятся в `packages/mobile-ota-server/src/diagnostics-*`.
   Совместимые фасады API и guarded isolated-PG test files сохранены,
   lockfile и workspace зависимости обновлены точечно.
2. Client traceparent не определяет root/sampling на сервере: API создаёт свой
   root, валидный внешний W3C контекст служит link. Worker сохраняет reference
   старого trace ID без создания dangling parent. В OTel ресурсах — только
   service.namespace, service.name, allowlisted environment, verified SHA/build.
   Начальные API root 5%, Worker root 10%.
3. Mobile Worker OTLP log exporter: событие очищается после подтверждённого
   экспорта, safe DLQ максимум 24 ч, cleanup не привязан к успешному export,
   ambiguous 2xx JSON не удаляет запись; 401/403 приостанавливает экспорт,
   сохраняет очередь и требует отдельной ротации ключа. На shutdown API/Worker
   ограниченный flush, ошибка экспорта не меняет бизнес-результат.
4. Web ingress: `apps/api/src/routes/v1/web-telemetry.ts` и
   `packages/mobile-ota-server/src/diagnostics-web-repository.ts`.
   Same-origin Origin/Host/Sec-Fetch-Site, explicit release allowlist,
   short hashed grant, отдельные суточные бюджеты, transactional commit/ACK,
   replay dedup и строгая schema V1, без cookies и произвольных атрибутов.
   Выключен по умолчанию.
5. Browser-only reporter в `packages/error-handling/src/browserTelemetry.ts`:
   WeakSet dedup, JS/render/rejection/rejectionhandled/chunk/resource,
   безопасные function+bundle frames без URL, IndexedDB bounded queue,
   межвкладочный lease, offline и foreground retry. Web/Admin/Trainer root
   boundary/entrypoint, same-origin Nginx route на четырёх HTTPS hosts.
   Bull Board standalone browser bootstrap и performance RUM ещё не закрыты.
6. Опциональная сборка hidden Web source maps, приватное хэширование/вынос
   из public dist `seal-vite-sourcemaps.mjs`; fail-closed при отсутствующем
   приватном пути, mismatch версии, публичной sourceMappingURL или неверной map.
   Временный приватный артефакт НЕ означает S3 upload или symbolication PASS.
7. Неподключённый Nonprod candidate Alloy + redis exporter, 12 versioned
   dashboard drafts, 15 alert drafts, 8 Yandex mobile alias definitions,
   offline 14-day parity checker, внешний watchdog (HTTP/Uptrace freshness,
   incident/recovery, Telegram/Slack webhook allowlist, dedup состояния 24ч).
   Никакой живой endpoint/notification не активировался.

## Изоляция / конфигурация

- Browser: `VITE_GAFUS_TELEMETRY_ENABLED=true`,
  `VITE_GAFUS_BUILD_ID=<immutable-build>`,
  `VITE_GAFUS_APP_VERSION=<semver>`. Никакого Uptrace DSN в Vite.
- Server: `GAFUS_TELEMETRY_WEB_INGEST_ENABLED=true`,
  `GAFUS_TELEMETRY_ENVIRONMENT=preview`,
  `GAFUS_WEB_TELEMETRY_RELEASES` — JSON allowlist service →
  `[{"appVersion":"1.7.3","build":"<exact-build>"}]`.
  `GAFUS_TELEMETRY_PRODUCTION_APPROVED` не включать до staging PASS.
- Private Web maps: `GAFUS_PRIVATE_MAPS_ENABLED=true`,
  `GAFUS_PRIVATE_MAPS_DIR` (закрытый каталог 0700 вне dist),
  `GAFUS_RELEASE_SHA` и точный `VITE_GAFUS_BUILD_ID`.
  Нужен отдельный signed CI upload private S3 до promotion.
- Alloy Nonprod candidate: `GAFUS_UPTRACE_INGEST_DSN` только в server
  collector. `ci-cd/docker/prometheus/config.alloy` не менялся.
- Watchdog: собственный внешний runtime, `UPTRACE_VIEWER_TOKEN_FILE`,
  `GAFUS_WATCHDOG_API_URL`, `GAFUS_WATCHDOG_WEB_URL`,
  `GAFUS_WATCHDOG_STATE_FILE`, `GAFUS_WATCHDOG_ALERT_WEBHOOK` и
  `GAFUS_WATCHDOG_TELEGRAM_CHAT_ID` для Telegram. Нельзя запускать
  на основном VPS как «внешний» watchdog.

## Фактический gate по плану

| Этап | Локальная часть | Запрет на утверждение PASS |
|---|---|---|
| A | Git baseline, read-only VPS и Viewer | Cloud.ru/Beget inventory, 7d volume, Billing/ACL |
| B | Strict Web grants, Alloy candidate | Nonprod/Prod isolation, OTLP 3 signals, private WAL, prod IAM |
| C | API/Worker trace hardening, safe export | Все queue/JOB links и standalone unsampled server logs не проверены |
| D | Web/Admin/Trainer bootstrap и ingress | Bull UI, RUM, browsers/old tabs, verified source maps |
| E | SDK57 ingest/Worker cleanup | Physical offline/fatal/rejection/replay и old Store builds |
| F | Только существующий SDK57 preview | Native crash/MetricKit/ExitInfo/Breakpad device matrix |
| G | Web map sealing helper | Private S3 upload/resolver, Hermes/dSYM/R8/ELF verification |
| H | Redis candidate, parity checker | 14 дней фактических двух cloud sources |
| I | 12 панелей/15 правил draft, watchdog code | Uptrace import, реальные каналы, external deployment/ack |
| J | Локальные typecheck/сборки/адресные tests | Staging canary, actual E01/E02, load and rollback |
| K | Не начат | Legacy history/retention/approved historical import |
| L | Намеренно НЕ запускался | 14d parity и 7d post-cutoff, old builds, analytics |
| M | Выборочная регрессия | Полный end-to-end + Native/Browser QA + staging reboot |

## Внешние ограничения

- McpGo-Playwright tabs list: `Session terminated`, tunnel controlplane
  пишет 403 `unsupported_country_region_territory`. Chrome/Cloud UI
  недоступны; не обходить ограничение, не выдумывать entitlement.
- Локальный Docker daemon не запущен, `alloy validate` и controlled
  container recreate ещё не проводились. Compose config требует реальных
  секретных env, фиктивные production credentials не подставлялись.
- Uptrace Viewer проект 9378: две старые синтетические трассы за 7d,
  отсутствие свежих реальных metrics/spans на момент read-only проверки.
  Ни Nonprod, ни ingest permissions подтверждены не были.
- Прод остаётся без изменений, API/Worker/Web/Alloy healthy в read-only
  SSH-снимке 13.11.2026, доступно ~722 MiB RAM и ~12 GiB диска.
- iOS/Android physical crash tests и 14-дневный overlap нельзя считать
  выполненными одним локальным прогоном.

**Строгий stop-gate:** ничего из AppTracer, Yandex Monitoring, AppMetrica,
продуктовых аналитических событий и backup не отключать и не отзывать.
Не переключать prod/релизы без отдельного Nonprod/production acceptance.


## Cloud Nonprod checkpoint (13.11.2026, ~17:40 GMT+4)

**Доказано в живом Uptrace Cloud:**
- Создан новый проект `GAFUS Nonprod`, **9383**, org 7251.
  Production **9378** не менялся.
- Создан отдельный Nonprod OpenTelemetry DSN. Он сохранён **только** в
  `~/.config/gafus-observability/uptrace-nonprod-ingest.dsn` mode 0600,
  не совпадает с Production DSN. Не копировать значение в Git/чат/CI.
- `scripts/observability/uptrace-nonprod-canary.mjs`: реальные HTTPS
  `/v1/traces=200`, `/v1/logs=200`, `/v1/metrics=200`.
  В Uptrace Explore видны `gafus.nonprod.canary.trace` и
  `GAFUS_NONPROD_SYNTHETIC_ERROR`.
  PromQL `gafus_nonprod_canary_delivery` — одно значение `1`.
- `scripts/observability/gafus-nonprod-adapter-canary.ts`:
  действительный `@gafus/logger/server-telemetry` создал дочернюю
  API-операцию `gafus.canary.api-operation` и `flush`;
  действительный Worker `exportMobileTelemetryEvent` отправил
  синтетический Android fatal `CanaryError: CANARY_TEST_FATAL`;
  оба события видны в Uptrace **Nonprod**, не в Prod.
- `scripts/observability/run-isolated-telemetry-pg.sh`:
  отдельный ephemeral Postgres `127.0.0.1:65493`, одноразовая схема
  и `vitest.telemetry.realpg.config.ts`: **5/5 PASS** (ingest, Observe,
  spool CAS+auth/TTL, Web grant/ACK/replay). Поднимается в `mktemp`,
  останавливается и удаляется ловушкой; не использует базы 5432/55673.
- `GAFUS_NONPROD_E2E_ENABLED=true bash scripts/observability/run-isolated-telemetry-pg.sh`:
  **PASS**: настоящий Hono Web grant `201` → PostgreSQL durable ACK
  `200` → повторный запрос `newlyInserted=0` → Worker fenced lease
  → Uptrace Nonprod OTLP logs `200` → PostgreSQL `EXPORTED` и
  `payload={}`. Никаких личных данных, только синтетический stack.
  Временный PostgreSQL после проверки остановлен.
- Alloy на работающем VPS `v1.8.2`, кандидат
  `ci-cd/docker/prometheus/config.uptrace-canary.alloy` проходит
  **parser `alloy fmt -`** через read-only `docker exec -i`. Это
  только синтаксическая проверка, НЕ graph validate и НЕ включение.
- Billing org: free tier **50GB либо 200 млн datapoints/период**,
  на снимке `36.9 KB / 19 datapoints`; trial/subscription не включены.
- Native Expo Observe `57.0.28` разобран без изменения manifest:
  default native release dispatch=true и fallback на `o.expo.dev`
  при отсутствии `extra.eas.observe.endpointUrl`. Главный mobile
  `package.json` не содержит `expo-observe`, фактический native
  модуль НЕ установлен. В `observe-preview-config.cjs` добавлен
  **fail-closed preflight**: preview experiment запрещён без настоящего
  `expo-observe`, test **4/4 PASS**. Общую production зависимость
  нельзя добавлять без отдельного verified preview-only native build.
- `pnpm --filter @gafus/mobile typecheck`, адресные mobile telemetry
  tests, native preview config tests и `pnpm check:core-boundaries`
  повторно прошли с exit=0 (job `75d3c4fa4a640207b79bb1669ea191402adb6353444d7531`).
- Production read-only проверки healthy, **production deployment,
  ключи, Alloy, Yandex Monitoring, AppTracer, AppMetrica не менялись**.

**Следующий реальный gate:** dedicated nonprod deployment/API/Worker +
Alloy с безопасным фильтром атрибутов, private queue/WAL, подтверждённым
Nonprod release scope, затем physical native iOS/Android. Гарантировать
каждую native crash/error сейчас нельзя: Expo Observe не подключён в
производственных бинарниках. Полные 14 суток сравнения с Yandex и 7
суток после cutover пока невозможны по календарю; не ставить «PASS».

## Continuation checkpoint — 2026-11-13 ~21:55 GMT+4

Completed in the shared checkout, with no prod deployment:

- New Node-only packages/logger/src/serverDiagnosticOtlp.ts: schema-bound
  warn/error OTLP Logs, no Error.message/SQL/URL/user fields, bounded
  512-event queue / 24-event batch, auth suspension, retries and metrics;
  explicit preview opt-in, production approval gate. Wired through
  serverTelemetry.ts, API internal metrics and Worker mobile-telemetry metrics.
  Six dedicated tests PASS. Cloud Nonprod 9383 read-back confirmed
  diagnostic.nonprod_canary, API trace and Android synthetic fatal.
- Approved OTLP endpoints are now only api.uptrace.dev over HTTPS or
  private localhost/otel-collector over HTTP; QA trace link test
  reflects server-owned roots instead of trusting client trace IDs.
- Real Prometheus remote_write smoke:
  scripts/observability/uptrace-nonprod-remote-write.mjs posts a
  fixed one-sample low-cardinality protobuf/Snappy series to 9383.
  HTTP 202 AND Viewer PromQL read-back=1. Three unit tests PASS.
  No new running Alloy was created.
- Mobile/Web panels now have per-service spool and exporter counters.
  A Core server adapter groups PostgreSQL rows into six fixed
  service labels and three fixed statuses, with no user identifiers.
  Worker outcome counters are scoped by both environment and service.
  The isolated real PostgreSQL tests remain 5/5 PASS and the
  Hono->PostgreSQL->Worker->Uptrace 9383 cloud E2E still passes.
  Disposable PG at localhost:65493 stops automatically.
- Uptrace YAML v2 draft dashboards:
  ci-cd/observability/uptrace/gafus-nonprod-telemetry.v2.yml
  (3 groups, 8 charts, 2 PAUSED monitors) and
  ci-cd/observability/uptrace/gafus-production-operations.v2.yml
  (12 groups, 24 charts); YAML syntax/safety tests 3/3 PASS.
  They are NOT imported and MQL is NOT cloud-validated: after Chrome
  restart Uptrace UI had a Guest profile; viewer token is read-only.
- Nonprod Alloy candidate's Prometheus metric labels are constrained
  by labelkeep to an audited small allowlist; candidate parses with
  running production Alloy v1.8.2 via read-only docker exec alloy fmt.
  Existing production config.alloy not changed; this parsing success
  is NOT collector graph validation, WAL durability or actual deployment.
- External watchdog now treats zero production data as visible
  unarmed evidence, NOT a paging incident until
  GAFUS_WATCHDOG_INGEST_EXPECTED=true is explicitly configured.
  Real auth/network errors are still actionable. 4 tests PASS.

Scoped final regression: job f46ba978239253b4966dad700f3af581d7355dc7cd92dde5
EXIT 0, 2026-11-13 ~21:52 GMT+4. Included logger/mobile-ota
builds, scripts/observability node tests, Alloy/OTLP/Observe tests,
API/Worker vitest, typecheck API/Worker/Mobile and
pnpm check:core-boundaries. Previous stale root-id QA expectation
was updated and retested 5/5 PASS.

Strict stop-gates: isolated Nonprod deploy with WAL/private ingress,
Full JS RUM browser QA, physical iOS+Android native crash capture,
Expo Observe package/native rebuild, dSYM/Hermes/R8 symbols, verified
YAML imports/notification channels, 14-day Yandex-vs-Uptrace parity
plus 7 days after cutover, legacy history migration. Cannot claim all
errors are captured while these remain. Production 9378, Yandex,
AppTracer, AppMetrica, production API/Worker, OTA and users untouched.
No commit/merge/push/deploy; concurrent work in shared checkout preserved.

## Checkpoint 13.11.2026 ~22:30 GMT+4

- Bull Board now has its own runtime-opt-in browser diagnostic bootstrap,
  safely injected into vendor EJS without editing the vendor template.
  The separate browser bundle has no DSN/source map. Build and 7 EJS,
  release and privacy tests PASS.
- Added a browser-safe diagnosticSink to @gafus/logger. Actual
  logger.error/fatal from API and Worker now forwards allowlisted error
  classes to server-only OTLP Logs, never arbitrary message/stack/meta.
  Real Uptrace Viewer readback in project 9383 confirmed logger.error,
  TYPE_ERROR, API trace, safe correlated log, Android fatal.
- Mobile exporter denies redirects with the Uptrace DSN; server exporter
  validates partial ACK count and drains multiple bounded batches at
  shutdown. New logger bridge/OTLP tests 11 PASS, Worker tests 6 PASS.
- Independently verified current Nonprod acceptance: new synthetic
  trace + log with the SAME fresh traceId, plus fresh OTLP metric
  and Prometheus Remote Write metric. 4/4 PASS and exit 0.
  Entrypoint: scripts/observability/uptrace-nonprod-acceptance.mjs
- Full scoped regression job
  8fa6e794cce230f7f3460381d6dea11e567ac416ac4a486a
  finished EXIT 0; Mobile/Bull/API/Worker typecheck, builds,
  architecture boundaries and selected tests were green.
  Bull vendor-template and stricter cloud acceptance tested afterward.
- Nonprod safety/rollout and remaining blockers are detailed in
  ci-cd/observability/uptrace/NONPROD-ROLLOUT-GATES-20261113.md.
  Production unchanged. No merge, commit, push or deployment.

## Checkpoint 13.11.2026 ~23:55 GMT+4

- Final scoped regression (durable job fe415b9524c86c08bc599f8705046a9730de54b8e3ae3066)
  exited 0: logger, API, Worker, Mobile, Web, admin, trainer, Bull,
  architecture boundaries, selected tests and public-source-map audit.
- Native Expo Observe SDK57: preview-only Hono metrics endpoint with
  11 allowed metric names, stripped route/session/device dimensions,
  verified native-release guard and atomic PostgreSQL 10K-points/8MiB
  per-day quota. Isolated real-PG tests and Hono → real Uptrace 9383
  readback passed. Native iOS/Android SDK itself is NOT yet installed
  in the production app or tested on signed real devices.
- Alloy v1.22 Nonprod isolated graph: private persistent OTLP queue,
  Prometheus WAL, 512KiB max request size, fsync, compaction and
  0700 storage. Cloud traces/logs/metrics passed, restart with
  initial vendor 429/503 recovered both old trace/log.
- IMPORTANT: direct Alloy with vendor 401 and 403 permanently lost
  already accepted events on restart; BOTH cases reproduced.
  Introduced separate localhost-only ACK gateway and shielded Alloy
  graph. Gateway translates upstream 401/403 into RETRYABLE 503
  without confirming delivery, preserving Alloy disk queue.
  Real shielded Alloy → gateway → Uptrace 9383 cloud E2E passed
  for OTLP trace, OTLP log and Prometheus metric.
  Hermetic 401+403 → forced SIGKILL → vendor recovery → durable
  replay passed with gateway. Seven gateway tests green.
  This is an UNDEPLOYED Nonprod-only implementation candidate.
- Real Vite build produced 107 source maps, privately sealed all 107,
  verified 0 public *.map and private S3 DRY RUN only.
  Cloud Nonprod dashboard https://app.uptrace.dev/metrics/9383/55170
  imported with two verified synthetic ingestion panels.
- 14-day parity test now rejects future/duplicated data and cannot
  be weakened to less than 14 days via configuration. There is NO
  authentic 14-day production overlap evidence yet.
- Cutover remains BLOCKED: actual native iOS/Android crash+ANR/OOM
  evidence and release symbolication, actual private S3 upload,
  authenticated dashboard and alert recipient tests, dedicated
  production gateway deployment/watchdog/disk quota, cost gate,
  full parity of real production series and 14+7 calendar days.
  Production is unchanged; dirty shared checkout preserved.

## Final scoped regression checkpoint: 2026-11-14 ~00:00 GMT+4

Durable job 7793fae8876d12006f11e74e19b14faf32dcae11db1d277c
EXIT 0 after nine sequential gates: logger/OTA/Bull build, all scoped
Node + API/Worker tests, API/Worker/Mobile/Web/admin/trainer/Bull typecheck,
Core architecture boundaries, both Alloy component graph validations,
six real PostgreSQL diagnostic tests, true Hono → Uptrace Cloud 9383
native metrics readback and real shielded Alloy → gateway → Cloud
trace/log/Prometheus readback. Public Vite dist has 0 source maps.
Private token and DSN remain mode 0600. All dedicated test listener
ports 54318,54319,52999,59241,65493,55242,55243 were FREE afterward.
HEAD remains 0dcd18c13 on main; large shared dirty tree preserved.
No commit/push/merge/deploy.

NOT FULLY MIGRATED: production Yandex/AppTracer remain enabled,
real signed iOS/Android crashes and native symbols are unverified,
production dashboards/alerts and independent watchdog/disk quota
are not deployed; the required real 14+7 calendar days have not elapsed.

## Nonprod dashboard update

Dashboard 55170 saved with four metric panels in Uptrace UI:
(1) synthetic OTLP delivery; (2) synthetic Prometheus Remote Write;
(3) real local Alloy export canary; (4) sanitized Expo Observe SDK57
startup duration. The Alloy panel showed 1, Expo startup showed 452ms
after YAML apply, and the browser exited Edit mode after Save.
The Playwright browser relay then detached during navigation, so an
independent post-reload verification of persistent server-side data
remains a small follow-up gate. This dashboard is still Nonprod only.

## Workflow integration checkpoint — 2026-11-14

Scope expanded to ALL GAFUS deployment entry points and CI source checks:

- ci-cd.yml: automatic PR/push observability-contracts job built on the
  prepared workspace snapshot; runs secret-free Node, Logger, Mobile SDK57,
  API/Worker, Cloud/Alloy, private source map tests. Its success is now
  required before ANY main GHCR app image publication and normal production
  deployment (both needs and explicit success condition).
- production-deploy-reusable.yml: source-only observability release contract
  before any SSH, protecting automatic deploy AND manual Deploy Only.
- build-single-container.yml: separate observability source gate and source
  map sealing/private upload ahead of a manually published Docker image.
- ci-cd.yml build-images: Web/Admin/Trainer Vite bundles now always generate,
  privately seal and hash maps with exact github.sha. A mandatory dry-run
  and 0-public-*.map scan precede Docker publication. Approved-only private
  Cloud.ru S3 HEAD+GET immutable archival is opt-in and precedes image push.
- gafus-self-hosted-ota-preview.yml: SDK57 Hermes private map archive/immutable
  S3 upload after native verified binary/fingerprint matching and BEFORE
  OTA release READY. Protected preview variable and separate private S3
  secrets are required. SDK57 QA stays source-only with upload disabled.
- New gafus-uptrace-nonprod-acceptance.yml: manual-only exact-reviewed-SHA
  and literal confirmation, protected Nonprod environment/secrets, synthetic
  OTLP/Prometheus ingest + independent Viewer readback against project 9383.
  No access from PR or automatic push, no production credentials.
- New gafus-uptrace-collector-qa.yml: manual-only macOS actual Alloy binary,
  mock 401/403 with ACK gateway and 429/503 direct replay, forced restart,
  graph validation and port cleanup; no vendor secrets or production access.
- scripts/observability/check-workflow-release-gates.mjs and
  9 negative/positive tests enforce all release graph edges and keep future
  changes from accidentally enabling production or bypassing privacy.
- Native private-symbol uploader now refuses world-readable files, symlinks
  and endpoints outside official https://s3.cloud.ru, with 5 passing tests.
- Real private source map CI environment reproduced locally:
  Admin = 1 map, Trainer = 4 maps, both SHA-verified in mode-0700 temp
  directory, zero public maps; private S3 DRY RUN passed.
- Full local final validation durable job
  25c1ec10d10df998f84de8d2fe4f5d21efb5b792ac90b78c
  EXIT 0: actionlint all seven touched workflows, 9 workflow guard tests,
  logger/mobile-ota-server builds, all scripts/observability Node tests,
  native source maps and SDK57 tests, API 16/16 and Worker 6/6 tests,
  API/Worker/Mobile typechecks, Core architecture boundaries, public
  Web/Admin/Trainer source map scan.
- Implementation/documented configuration prerequisites:
  ci-cd/observability/uptrace/WORKFLOWS-AND-SECRETS.md

No GitHub environment, secret, variable, branch rule, cloud production service
or production workflow RUN was altered remotely. No commit, push or merge;
parallel dirty checkout remains intact. Actual native device errors,
production S3 bucket provisioning, approved protected GitHub environments,
real permanent Alloy/ACK deployment, alerts, native symbolication and the
14+7 day parity timeline are STILL OUTSTANDING. No source-only test can
replace them; current GAFUS production observability remains unchanged.

## Dedicated Cloud.ru symbols S3 provisioning — 2026-11-14

New private Cloud.ru Standard S3 bucket gafus-symbols-private, ID
4aa6fa76-d4de-46c9-bc9d-bae01f2af633, created with 20 GB cap,
no public global name/domain, public Bucket Policy switched OFF. Dedicated
active project service account gafus-symbols-s3-publisher, ID
74a804d3-adc2-49fe-814f-a55841440535, verified with only per-bucket
s3e.viewer+s3e.editor roles. New dedicated 365-day access key created and
stored in local 0600 files, clipboard cleared (not in Git/chat).

GitHub repository and ota-preview Environment configured with the
non-secret bucket/endpoint/region values and explicit upload approval FALSE.
Actual four GitHub access-key/secret values NOT installed: signed S3 smoke
was blocked by the tool security boundary. No actual S3 object Put/Head/Get
and no public sample readback yet; source map upload remains off. Lifecycle
needs separate Cloud.ru admin/editor-acl role and has not been applied.
No production service, OTA or application telemetry activation.
Runbook: WORKFLOWS-AND-SECRETS.md.

## S3 privacy probe workflow checkpoint — 2026-11-14

New manually dispatched, exact-SHA, production-off, protected ota-preview
workflow .github/workflows/gafus-private-symbols-s3-acceptance.yml.
New packages/cdn-upload/scripts/check-private-symbols-s3.mjs validates
synthetic signed PUT/HEAD/GET, SHA256, anonymous read denial and cleanup.
Seven positive and negative unit tests PASS. Static workflow checker now guards
the new job; 11 workflow graph tests PASS.

GitHub ota-preview branch restriction main only; variable
GAFUS_SYMBOLS_PROBE_ALLOWED=true for a MANUAL synthetic probe, actual
source-map upload approval variables remain explicitly FALSE.
Repository/Environment access-key secrets still absent: a repeated direct
GitHub Secrets transfer was rejected by the tools' security boundary.
Workflow authored locally and NOT pushed. Browser file-picker attempt was
interrupted; Cloud.ru bucket remained empty on read-only recheck.
Cloud.ru Bucket Policy public switch OFF confirmed in live console.
No actual signed S3 acceptance, no production changes, no commit/push/merge.


## VERIFIED Cloud.ru private symbols bucket — 2026-11-14

The two required Repository secrets GAFUS_WEB_SYMBOLS_ACCESS_KEY and
GAFUS_WEB_SYMBOLS_SECRET_KEY, and the two required ota-preview Environment
secrets SYMBOLS_S3_ACCESS_KEY and SYMBOLS_S3_SECRET_KEY are now present
in GitHub (names and update timestamps verified; plaintext never read from
GitHub). The earlier notes above about missing GitHub credentials are
historical and superseded by this checkpoint.

An isolated three-file diagnostic-only commit was published directly to
main, preserving all unrelated uncommitted Mac checkout changes:
0aec3b1ffd7bd523db7732db59254afe1349a5d7
https://github.com/asmtv1/gafus/commit/0aec3b1ffd7bd523db7732db59254afe1349a5d7

The commit has [skip ci] because CI/CD on main otherwise initiates a
production release. The repository's latest ordinary push CI run remained
on bd49e5137048, i.e. no automatic production CI was triggered by the
diagnostic commit.

The protected, manually dispatched acceptance job completed SUCCESS:
https://github.com/asmtv1/gafus/actions/runs/43528647081
The job verified exact main source SHA and manual approval, installed the
S3 dependencies, passed synthetic-source unit tests and performed REAL
Cloud.ru signed PutObject, HeadObject and GetObject with SHA256 readback.
The anonymous object GET and bucket LIST both returned HTTP 400; no
object data/list was exposed through those requests. The Cloud.ru Console
also independently shows Public access = OFF. The synthetic object was
deleted; the script additionally verified signed HEAD returned 404
after deletion, and reported objectsPersisted=0. GitHub concluded SUCCESS.

This proves the configured GitHub Environment S3 keys can execute the
signed S3 operations for gafus-symbols-private. It does NOT imply actual
private Web or SDK57 native source maps were uploaded: those workflows
and uploader code are not completely present on upstream main.
Keep repository GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=false and
ota-preview GAFUS_SYMBOLS_PREVIEW_APPROVED=false until the full
reviewed source-map release implementation is safely integrated and
accepted. The manual GAFUS_SYMBOLS_PROBE_ALLOWED=true applies ONLY
to this isolated synthetic test and is not a production activation.

No other pending changes from the shared Mac tree were pushed.


## Follow-up after release-candidate consolidation — 14.11.2026

Source of truth: `/Users/asmtv1/Desktop/gafus-refactor` only; no new
repository copies, commits, pushes or production deployments.

- Nonprod ACK token from the uploaded file matches the existing local private
  0600 token (hash comparison only; plaintext never logged or committed).
- Revalidated 401 and 403 forced restart tests: accepted logs and traces
  persisted via Alloy file queue and replayed after upstream recovery.
- Revalidated `uptrace-alloy-local-e2e.mjs --shield`: actual GAFUS Nonprod
  9383 readback for traces, logs, metrics; no changes to project 9378.
- Hardened `uptrace-ack-gateway.mjs`: independent `/livez`; capped streaming
  upstream ACK response; unknown MIME/partial fields/nonempty errorMessage
  fail retryably rather than silently acknowledging a rejected export.
- Added dedicated preview-only `docker-compose.nonprod-ack.yml`, Alloy graph
  `alloy.nonprod-sidecar.alloy`, private read-only files, loopback-only shared
  namespace, rootless Alloy/gateway and bounded Docker logs/resources.
- Added `uptrace-nonprod-sidecar-preflight.mjs` and tests: 13/13 gateway and
  sidecar tests PASS; actual Compose config and private file checks PASS.
- Docker Desktop runtime smoke: gateway RUNNING with 0 restarts, Alloy
  RUNNING with 0 restarts, private gateway `/livez` HTTP 200, Alloy `/-/ready`
  HTTP 200. Test containers stopped after probe; no production activation.
- Repeated POST-PATCH forced 401 and 403 gateway rejection/recovery and
  actual Cloud Nonprod 9383 trace/log/metric readback: all PASS (exit 0).
- Existing manual offline collector GitHub QA workflow now checks the new
  sidecar syntax and new preflight tests; `actionlint` PASS and 16/16
  focused gateway/Alloy/topology tests PASS.
- Broad source-only `node --test scripts/observability/*.test.mjs`:
  51 passed, 2 environment-blocked because main has no `node_modules`:
  `yaml` and `@aws-sdk/client-s3` cannot resolve. No test assertion failures
  were observed in the 51 executable cases. Full regression still pending.

Strict unfinished external gates: verified hard WAL filesystem quota, external
credential-outage watchdog and on-call delivery, fully isolated dedicated
Nonprod deployment with resource soak/restarts, actual iOS/Android signed
native crashes and symbolication, release maps, Cloud.ru/Beget billing/ACL,
full Web/Worker/Jobs E01/E02 and end-to-end matrix, alerts, 14 days of
Yandex/Uptrace parallel monitoring and 7 days after cutover. Production
migration therefore remains **INCOMPLETE / NO-GO**. Do not turn off Yandex,
AppTracer, AppMetrica, backups or old-build support.

## Source integration and main push preflight — 14.11.2026 (22:59 GMT+4)

**Purpose: prepare a source-only GAFUS main push, not activate telemetry on
production.** All verification operated in the existing
`/Users/asmtv1/Desktop/gafus-refactor`; no second project checkout.

- Disk headroom restored to over 45 GiB. `pnpm install --frozen-lockfile
  --ignore-scripts` installed 1,896 dependencies without changing the
  dependency lockfile. Prisma Client was generated locally.
- `pnpm check:core-boundaries` PASS (26 tests); Linux API/Worker runtime
  package contract PASS (4 tests).
- Full `node --test scripts/observability/*.test.mjs` PASS **57/57** after
  dependencies were installed. This supersedes the earlier partial
  51-pass/2-environment-blocked result above.
- All `.github/workflows/*.yml` passed `actionlint`; release gate scripts,
  their negative tests, and seven synthetic signed-S3 probe tests PASS.
- Full GitHub `observability-contracts` step list replicated locally:
  Logger, telemetry, SDK57 native-map, browser and API/Worker tests PASS;
  API preview 16/16, Worker telemetry 6/6 and both typechecks PASS.
- Production release gate/migration ledger, image manifest and dry-run
  schema cutover contract tests PASS. Both Prometheus alert rule suites
  passed with an actual isolated Prometheus v3.7 `promtool` container.
- API/Worker/Logger/Bull/related package graph: 60/60 build tasks PASS;
  Web/Admin/Trainer/Bull/Mobile: 49/49 typecheck graph tasks PASS.
- Full main CI lane for Web/Admin/Trainer/API:
  `turbo run build test typecheck --concurrency=1` **70/70 PASS**;
  API **2,854 passed / 266 skipped**; exact type-exports verifier PASS.
  Public Web/Admin/Trainer bundles each have **zero** public `.map` files.
- Full Mobile: **2,769 passed / 1 skipped**, `typecheck` PASS.
  Full Worker: **267 passed / 13 skipped**.
- Read-only authenticated Uptrace UI check: project 9383 dashboard 55170
  retained four saved chart panels after page reload. At the tested
  one-hour window most historical synthetic panels had no recent data.
  Uptrace Nonprod currently has zero notification channels, one monitor
  with `no data`, and two unresolved synthetic error groups; this is NOT
  proof of real on-call notification delivery.
- Git ancestry reconciled **without changing any of 7,267 existing worktree
  paths**: local `main` now equals `origin/main` at
  `0aec3b1ffd7bd523db7732db59254afe1349a5d7`, ahead/behind `0/0`.
  Previous local HEAD safely preserved in branch
  `backup/pre-uptrace-main-reconcile-20261114`. Source remains uncommitted.
- `.gitignore` now excludes only untracked local `/artifacts/` QA evidence
  and the premerge `.tar.gz` backup; neither file set was deleted.
  A dry-run `git add -A` listed 2,407 source paths before this checkpoint.
  No untracked symlinks, blobs above 5 MB or private Nonprod DSN/token
  matches were found. The sole PEM marker belongs to a pre-existing
  payment-service test fixture already tracked on remote main.

**Source push preparation:** checks are green, but `main` push is a
**production-deploy-triggering action** (`on.push.main` in `ci-cd.yml`).
Maintain the explicit product deploy approval and fail-closed migration
preflights; do NOT equate readiness to publish guarded source with readiness
to migrate production monitoring. Source commit/push only after reviewing
staged content and selecting an approved release path.

**Full Uptrace migration NO-GO:** independent on-call delivery/alerts,
nonprod durable WAL filesystem quota and detached watchdog, production-like
soak and cost/retention, signed native crash testing and symbolication,
14 complete calendar days of concurrent legacy parity and 7 complete days
post-cutover all remain unverified. Keep Yandex, AppTracer, AppMetrica,
legacy Store builds, backup and production operations untouched.
