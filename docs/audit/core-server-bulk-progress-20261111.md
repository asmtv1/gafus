# Core → server: журнал крупнопакетного переноса (11.11.2026)

Цель: ликвидировать обратные Core → server зависимости, не разрезая атомарные
транзакции, ACL, платежи, каскады удаления и идемпотентность. Источник истины
для счётчика: `node scripts/check-core-server-facades.mjs` и замороженный ratchet.

## Согласованная стратегия проверки

- Собирать изменения по доменным контурам. После пачки: сборка и типизация
  затронутых пакетов + адресные unit/HTTP/contract/concurrency tests.
- Полную длительную регрессию выполнять после заметного объёма работ, а не
  после двух файлов. До полностью зелёных этапов baseline не переписывать.
- Защищённые реальные PG-тесты запускать только в disposable БД при явном
  opt-in. Не подставлять продовую БД, S3, очереди или платёжный провайдер.

## Подтверждённый промежуточный результат

Замороженный текущий ratchet: 77; фактически 59 осталось, 18 устранено,
0 новых рёбер. Историческая инвентаризация от 142: 83 устранено, 59 осталось.

Группы переноса текущей серии:

1. Регистрация и согласия: атомарная запись через identity-write-server,
   перевод совместимых контуров партнёра и финансовой сверки в сервисы/Worker.
2. Очистка Pet Media: SQL в pets-server, фоновый worker в Worker;
   изолированные тесты fencing, роллбэка, конкурентной обработки.
3. Exam / Consultation Push: доставка компонуется на server-boundary,
   retired Core Notifications; exam Core facade полностью снят.
4. Account Storage Cleanup: обработка в Worker, с защитой владельца,
   подтверждением удаления Stream/CDN, CAS и retry.
5. Offline read/download: из Core в course-read-server; Mutation Journal
   и экспериментальный video.position v3 сознательно не мигрировали без AG4.
6. Training reminders: keyless CRUD в notifications-server,
   AG4 keyed-receipt review остаётся изолированным.
7. Trainer Course Versioned Delete: ввод SQL-порта через API композицию,
   Core сохраняет version/ACL/cache/pub policy.
8. Subscription finance: операции NPD, административные права выдачи подписки,
   отчёты и расходные операции в subscription-finance-server,
   API подключается напрямую.

Проверки после последней группы: Core, API, Worker, Web, Mobile, Trainer Panel,
Admin Panel — типизация затронутых контуров PASS; `pnpm check:core-boundaries`
PASS; `node scripts/check-workspace-graph.mjs` PASS; server runtime exports
PASS; targeted suites financial administration 22, API 66, finance-server 25
PASS. 7 PostgreSQL-тестов прибыли и 6 других финансовых real-PG suites
пропущены, так как безопасное изолированное окружение не активировано.
Последний **полный workspace typecheck** с 62 остаточными рёбрами — PASS;
после переноса 3 финансовых рёбер выполнена типизация Core/API/Worker/Web/
Mobile/Admin/Trainer по затронутому графу, но полный typecheck повторно
пока не запускался. Полный тестовый regression suite не запускался.

Не был изменён ratchet baseline. Git push, commit и production не выполнялись.

## Не решено (следующая крупная группа)

По текущей инвентаризации самая сложная часть: identity-write-server (16),
course-progress-server (13), gafus-server (9), консультации (4),
course-read-server (4), entitlements-server (3), pets-server (3),
subscription-read-server (2) и пять одноимпортных контуров. Для них нужен
port/composition extraction с сохранением публичного API, а не перестановка
импортов без проверки транзакций. Для платёжных и auth writes нужны реальные
изолированные PostgreSQL и конкурентные rollback/replay проверки до baseline.

## Продолжение 11.11.2026

В начале серии сканер показывал 59 фактических зависимостей Core от
серверных адаптеров. После серии осталось **55**. Исторически устранено
**87 из 142**, новых исключений нет. Прямых импортов Prisma из Core нет.
Граф workspace содержит 69 проектов и 0 циклов.

- Каталог консультаций и расписание используют порты Core. Hono связывает
  их с существующими PostgreSQL-адаптерами. Изменение расписания и
  перестроение слотов по-прежнему проходят в одной транзакции.
- Команды вопросов связываются с наградами в questions-server. Условие
  прикрепления фото выполняется в questions-write-server рядом с
  проверками владельца и подтверждённой задачи загрузки.
- Чтение предложения подписки получает данные через порт, привязанный
  к идентификатору аутентифицированного владельца. Существующий
  GET-контракт и отдельная POST-инициализация Apple-токена сохранены.
- Контракты чтения и отправки экзамена перенесены в общий пакет типов.
  Проверка границ разрешает Application импортировать эти типы и
  закрепляет вызовы экзаменационного сервиса в серверной композиции.
- Общий обработчик ошибок записывает `operationId` с `requestId`
  и `traceId`. HTTP и OpenTelemetry используют одну проверку
  `traceparent`; входящий заголовок с нулевым ID родительского span
  не используется для корреляции.

### Изолированная приёмка

- PostgreSQL: каталог и расписание консультаций, включая смену роли,
  конкурирующие обновления и откат перестроения слотов. Модерация
  вопросов — 17 тестов, транзакционный outbox удаления фото — 5.
- PostgreSQL: чтение подписки без записи, 12 конкурирующих POST
  инициализации Apple-токена с одним результатом, разделение владельцев.
- PostgreSQL: очистка аккаунта и медиа — 5 тестов с текущей схемой MP4.
  Напоминания — защита владельца, общий лимит для запросов с ключом и
  без ключа, повтор и конкурирующее создание. Партнёрские записи — 4
  теста, включая защиту при конкурирующих выплатах.
- Chat2 с Hono, PostgreSQL, Redis, Worker и Centrifugo — 6 тестов.
  Проверены авторизация, доставка через WebSocket, повтор HTTP,
  восстановление после потери связи с брокером и соответствие
  `operationId` в заголовке HTTP и событии outbox.
- Аварийная матрица — 5/5. Отдельные процессы Worker, потерянное
  подтверждение, истечение аренды, DLQ и восстановление PostgreSQL.
  Квитанции в
  `~/Library/Logs/gafus-refactor-regression/architecture-20261111-catalog/chaos-results.tsv`.
- Prometheus и Alertmanager доставили алерты о зависшем 360p и DLQ
  на локальный HTTP-приёмник. Проверено 20 правил Prometheus.
  Локальный тест OTLP подтвердил передачу связанного дерева spans.

### Открытые проверки

Отдельный интеграционный прогон старых сценариев медиа на PostgreSQL
завершился с 16 ошибками. Среди них тесты Gallery с ожиданиями старого
server-side publish и устаревший тестовый формат видео для очистки
аккаунта. Формат видео исправлен и отдельный прогон очистки зелёный.
Оставшиеся ошибки общего медиа-прогона требуют проверки на действующих
клиентских путях загрузки и публикации.

В Cloud.ru чтение списка приложений через подключение не прошло
аутентификацию. Изолированный стенд для реальных запусков 360p и
проверки callback не подтверждён. Приёмка Beget CDN с отказами 403/404,
поиск трассы в развёрнутом коллекторе, нагрузка с несколькими инстансами,
восстановление и откат на стенде остаются открыты. Production, Cloud.ru
Jobs и исходный `gafus1` не менялись. Оценка 9–9,5/10 пока не подтверждена.


## Приёмка пакета v24 — baseline 41 (12.11.2026)

- Замороженный переход: 77 → 41 обратных Core → server связей; 36 удалено, 0 добавлено. Историческая инвентаризация: 142 → 41, то есть 101 историческая связь устранена. Проверка `node scripts/check-core-server-facades.mjs` зелёная; workspace-граф: 69 проектов, циклов нет.
- Внешняя композиция daily-course перенесена в API, подробный прогресс — в `course-progress-server`, бронирования и слоты консультаций — в `consultation-server`. Порты не меняют бизнес-семантику в подтверждённых локальных тестах.
- Приёмка архитектуры, мониторинга, runtime и сборки: PASS; полная пересборка 61/61 без кэша. Core: PASS; полный API: 2739 тестов PASS, 266 условных skip. Все 20 дополнительных сервисных `test` gates: PASS, включая Worker, consultations, subscriptions, identity, pets и media.
- Web: 33/33 пакета, все 303 исходных тестовых файла учтены: 3144 PASS, 6 skip. Mobile: 2742 PASS, 1 skip. Панель тренера и админка: PASS, админка 242 теста PASS. Общая монорепозиторная типизация: 123/123 задач PASS (90 Turbo-cache). `git diff --check`, без существующего исключённого компрессорного патча: PASS.
- Исходный единый регрессионный процесс `core-server-bulk-v24` был прерван `SIGTERM` с временными ошибками `EPERM` после успешных 6 начальных gates. API, оставшиеся сервисы, Web, Mobile, панели, типизация и whitespace **повторены отдельными подтверждёнными вызовами и все прошли**; это составная полная локальная приёмка, не один непрерывный запуск. Результат не включает изолированные PostgreSQL/Redis/Cloud.ru/Beget внешние gate, они не симулировались.
- Результаты: `~/Library/Logs/gafus-refactor-regression/core-server-bulk-v24/` и `.../core-server-bulk-v24-web-chunks/`, отдельные job receipts в McpGo. Ни коммита, ни push, ни production deploy не выполнялось.


## AG1 review-only receipt-port: обновление реестра 12.11.2026

- После верифицированного baseline **41** и ранее переданного `payment-composition`
  (40) перенесено создание и чтение idempotency receipt для AG1 review-only
  через `createReminderCreateReviewUseCase(ports)`; Core больше не импортирует
  `@gafus/identity-write-server/reminder-review-rows` из этого исходника.
- Адаптер `withAG1ReminderCreateTx` остаётся единственным владельцем
  owner-advisory-lock и одной транзакции для `Reminder` + receipt.
  Review-Hono маршрут не смонтирован в production.
- Результат AST ratchet: **39 remaining / 2 resolved / 0 new**
  относительно текущего frozen 41; исторически **103 из 142** устранены.
- Core 11/11; API route/architecture 91/91; Core и API TS/сборка,
  `pnpm check:core-boundaries` — PASS. Полный 33-stage regression и
  реальные AG4 PG-миграции для этой новой пачки не подтверждены.
- Манифест и точные SHA-256 в
  `docs/audit/gafus-agent-1-to-agent-2-reminder-review-ports-20261112.json`.
- Никакого merge/commit/push/deploy или изменения baseline этим этапом нет.


## A1 feature-flags и subscription access — 37 remaining (12.11.2026)

- Две отдельные группы, после AG1 review-only: **39 → 38 → 37**.
  В frozen ratchet 41: **4 resolved / 0 new**; historical 142: **105 retired**.
- Feature flags: Core теперь чистый порт без `feature-flags-server`, API
  composition устанавливается до route-импортов; дефолтные значения, review
  profile, OTA и значения IOS promo/payment сохраняются через серверное чтение.
  Дубликаты классов `MobileReleaseControlConflictError`/
  `RetiredRewardedAdsReadOnlyError` устранены общими конструкторами `@gafus/types`.
- Subscription access: Core read-only статус/права передаются через порт,
  `subscription-read-server` по-прежнему выполняет owner-scoped SQL/роль/период,
  пакет Core не имеет runtime-dependency на него; без API composition
  платное право **не выдаётся** (fail closed).
- Адресные Core 19 + 35, API 194 + 186, Core subscription test rewiring 51:
  все PASS; full Core 2056 PASS, full API 2741 PASS в первом интеграционном
  прогоне. После переноса общих классов ошибок повторный общий прогон
  зафиксировать отдельно, не подменять baseline предыдущими тестами.
- `pnpm check:core-boundaries`, lockfile --offline --frozen-lockfile,
  TypeScript Core/API/Worker, workspace graph: PASS.
- Чеклист и SHA-256: `docs/audit/gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.md`.
  Не выполнять merge, commit, push или deploy без отдельной координации A2/A3.


## A1 rewarded settings port — 36 remaining (12.11.2026)

- После frozen 41 и предыдущих 4 resolved (37 remaining) перенесён
  `@gafus/gafus-server/rewarded-settings` из Core через `RewardedSettingsPorts`:
  теперь **36 remaining, 5 resolved, 0 new**; historical **106/142** retired.
- Подключение: `apps/api/src/modules/rewarded-credits/composition/install-core-settings.ts`
  на старте `apps/api/src/app.ts`, строго до импорта маршрутов. `Core`
  сохраняет нормализацию, ограничения dailyLimit и production placement,
  оригинальные публичные сообщения ошибок, контекст iOS флагов и передачу
  actorId в SQL; серверная `gafus-server/rewarded-settings` запись не менялась.
- Негативные тесты добавлены: незарегистрированный порт fail closed,
  запрещено переключение на другой адаптер, ошибочные лимиты/placement
  не приводят к записи, копирование актёра и нормализация строки.
- Core 2062 PASS / 136 skip; API 2742 PASS / 266 skip; соответствующие
  TypeScript/архитектурные/графовые проверки PASS. Не считать этим
  подтверждённой приёмку полного 33-stage regression, 5-stage chaos,
  PostgreSQL и других A2/A3 потоков.
- Манифест A1→A2:
  `docs/audit/gafus-agent-1-to-agent-2-rewarded-settings-port-20261112.md`.
  Merge, commit, push, deploy не выполнялись; frozen baseline JSON не изменён.


## A1 Course.version port — 35 remaining (12.11.2026)

- От frozen 41: **6 resolved, 0 new**, исторически **107/142** retired.
  Из предыдущего confirmed 36 устранена одна Core →
  `@gafus/course-progress-server/course-version-rows` зависимость.
- Core Course.version read/name-CAS/logo оставлены policy-only;
  `CourseVersionRowsPort` регистрирует три server SQL операции на старте
  API, до Hono routes. Публичные `CourseVersionResult` и
  `CourseLogoVersionResult` сохраняют прежние статусы; UNKNOWN
  не превращается в retry и не запускает Redis/cache publication.
- Тесты: 18/18 Core порт+CAS, 1/1 API композиция, полные Core
  **2066 PASS / 136 skip**, API **2743 PASS / 266 skip**.
  TS Core/API/Worker/Persistence, сборка Core, workspace DAG,
  `pnpm check:core-boundaries`: PASS.
- PG trigger/owner-CAS для full schema — отдельная guarded opt-in
  приёмка, не выполнена. 33-stage regression / 5-stage chaos
  на общем A1/A2/A3 кандидате ещё не выполнялись.
- Манифест A1→A2:
  `docs/audit/gafus-agent-1-to-agent-2-course-version-port-20261112.md`.
  Глобальные изменения чужих агентов не сбрасывать. Нет merge/push.


## A1 registration-context port — 34 remaining (12.11.2026)

- После Course.version 35 → **34** обратных импортов. Frozen 41:
  **7 resolved, 0 new**; historical 142: **108 retired**.
- Core не импортирует `identity-write-server/registration-context-reads`;
  `RegistrationContextPorts` инжектирует единую SQL transaction
  и owner-scoped read/completion/nonce обращения через API composition.
  Прозрачность VK state, purpose REGISTER, promo selection, публичные
  результаты и ошибки неизменны. Fail-closed при отсутствии порта.
- Новый Test Core 4/4; API composition 1/1; полный Core
  **2070 PASS / 136 skipped**, API **2744 PASS / 266 skipped**;
  build Core, TS Core/API/Worker/Persistence, graph,
  `pnpm check:core-boundaries`: PASS.
- Не проводились реальные VK OAuth, PostgreSQL транзакционная
  и owner-authority приемка; полный 33-stage/5-stage regression
  выполняется только на совместной кандидатской интеграции.
- Передача A2: `docs/audit/gafus-agent-1-to-agent-2-registration-context-port-20261112.md`.
  Не выполнять commit/merge/push/deploy, frozen baseline JSON не менялся.


## A1 password-reset port — 33 remaining (12.11.2026)

- После registration-context **34 → 33** обратных импортов. Frozen
  41: **8 resolved / 0 new**; historical 142: **109 retired**.
- Core `passwordReset.ts`: токен SHA256 и narrow legacy fallback, bcrypt
  cost 12, публичный `InvalidPasswordResetTokenError` и короткий текст
  остались. Нет direct import `identity-write-server/password-reset`.
- API `install-password-reset.ts` перед маршрутом связывает consume receipt,
  username lookup и `instanceof ResetReceiptUnavailableError` predicate;
  серверная одна транзакция меняет пароль, отзывает все refresh-токены
  и удаляет receipt. SMTP notification выполняется только after commit.
- Core port+notice **10/10 PASS**; API composition **1/1 PASS**;
  полный Core **2074 PASS / 136 skip**, API **2745 PASS / 266 skip**;
  Core/API/Persistence/Worker TS, Core build, workspace graph и
  architecture boundaries PASS.
- Full PG race, lost ACK, SMTP/provider/staging и 33-stage+5-stage
  combined architecture acceptance не выполнялись.
- A1→A2 манифест:
  `docs/audit/gafus-agent-1-to-agent-2-password-reset-port-20261112.md`.
  Никаких merge/commit/push/deploy.


## A1 email-account rows port — 32 remaining (12.11.2026)

- Core email-account orchestration **33 → 32**, frozen 41:
  **9 resolved / 0 new**, historical 142: **110 retired**.
- Core `emailAccountFlows.ts`: read/claim/rollback/retire для password reset;
  owner-scoped email-change validation, stage/rollback/retire и одноразовая
  confirmation выполняются через десять портов на прежнем server SQL.
  API composition подключена до загрузки Hono routes.
- Invariants: неизвестный email не раскрывает аккаунт и не отправляет письмо;
  старую ссылку не инвалидировать до ACK нового письма; CAS rollback
  удаляет только собственный токен и не затрагивает более новый запрос;
  email-change owner row-lock и token replay остались в Persistence.
- Core 21/21 адресных тестов, API composition 1/1;
  полные Core **2078 PASS / 136 skip**, API **2746 PASS / 266 skip**;
  TS/сборка, architecture и DAG PASS. 7 real-PG W1 opt-in тестов
  без выделенной базы штатно пропущены; provider не вызывался.
- A1→A2: `docs/audit/gafus-agent-1-to-agent-2-email-account-rows-port-20261112.md`.
  Freeze baseline JSON не редактировали; merge/commit/push/deploy не было.


## A1 VK completion transaction port — 31 remaining (12.11.2026)

- Frozen 41: **10 resolved / 0 new**; historical 142: **111 retired**.
- `VkCompletionPorts` Core policy/composition contract owns the same
  context-scoped advisory lock, user pending→completed CAS, consent,
  affiliate referral, completed marker and one-time WEB LOGIN grant.
  SQL code stays in `identity-write-server/vk-completion-rows`; no
  OAuth network calls, no new nested transaction, no user role bypass.
- Core 6 targeted PASS (2 old replay + 4 new negative port tests),
  API 1 composition PASS; full Core **2082 PASS / 136 skip**, API
  **2747 PASS / 266 skip**; build/types/graph/boundaries PASS.
- Explicit PG concurrency/expired context/cross-owner and VK sandbox OAuth
  acceptance not run, full 33-stage/5-stage integrated gates remain.
- A1→A2 manifest `docs/audit/gafus-agent-1-to-agent-2-vk-completion-port-20261112.md`.
  No merge, commit, push, deploy or frozen baseline JSON update.


## A1 credential registration port — 30 remaining (12.11.2026)

- Из предыдущих 31 остались **30** Core→server; frozen 41:
  **11 resolved / 0 new**, historical 142: **112 retired**.
- `CredentialRegistrationPort` исключает прямые импортируемые SQL функции
  из `registerUserWithCredentials.ts`; API связывает исходный
  `identity-write-server/registration-contract-rows` до Hono routes.
  В рамках одного existing Prisma Tx остаются replay lookup, atomic
  attempt receipt, user, partner attribution и completed consent logs.
- Core оставляет DNS/email, bcrypt, consent policy, required fingerprint
  и публичные `USERNAME_TAKEN`/`EMAIL_TAKEN`/`PROMO_INVALID`/
  `ATTEMPT_MISMATCH`. Unique P2002 classifier по-прежнему server-owned.
- Core 12/12 targeted; API 1/1 composition; full Core **2086 PASS** /
  136 skip, API **2748 PASS** / 266 skip. Typecheck, build,
  `pnpm check:core-boundaries`, workspace graph PASS.
- 2 PostgreSQL opt-in tests, real email DNS and external provider
  acceptance не подменять локальными mocks. Frozen baseline не менялся.
- A1→A2: `docs/audit/gafus-agent-1-to-agent-2-credential-registration-port-20261112.md`.
  Merge/commit/push/deploy отсутствуют.


## A1 registrationContracts SQL port — 29 remaining (12.11.2026)

- Core `registrationContracts.ts` больше не импортирует Persistence rows,
  перенесены **10 row methods + one withRegistrationTransaction**;
  **30 → 29**, frozen 41: **12 resolved / 0 new**, historical 142:
  **113 retired**. Доменная логика fingerprint/purpose остаётся в Core.
- `RegistrationContractRowsPort` — типизированный интерфейс через opaque
  Tx; все SQL/owner/advisory-lock/REGISTRATION grants остаются
  `identity-write-server`. API связывает порты до Hono routes.
- Тесты 7/7 Core SQL port/replay/locking, 1/1 API composition,
  Core build, Core/API typecheck и architecture boundaries PASS.
  Общие Core/API suite результаты фиксируются в JSON-манифесте.
- Fullschema real PG и VK sandbox external acceptance ещё не проверены.
  Frozen baseline JSON не изменён, интеграции, merge/push не было.
- A1→A2:
  `docs/audit/gafus-agent-1-to-agent-2-registration-contract-rows-port-20261112.md`.


## A1 content-policy owner reads — 28 remaining (12.11.2026)

- После registration-contracts **29 → 28** прямых зависимостей;
  frozen 41: **13 resolved / 0 new**, historical 142: **114 retired**.
- Четыре `policy-reads` метода через pure `ContentPolicyReadPort`.
  Core `resolveCourseEntitlement` и `resolveArticleEntitlement` сохраняют
  owner, private assignment без ADMIN-бейпаса, current active period,
  article-specific Gafus access; feature flag проверяется до paid gate.
- API устанавливает DB-read порт до маршрутов; отсутствие port
  fail closed, hot replacement запрещён.
- Исходные policy/occurrence tests, пять негативных сценариев и
  API composition PASS; архитектурные guards PASS. Общие Core/API
  регрессии по группе документируются в JSON-манифесте.
- External PG role/expiry/ACL и общий 33+5-stage acceptance ещё
  не выполнялись. Без merge/commit/push/deploy, frozen JSON не тронут.
- A1→A2: `docs/audit/gafus-agent-1-to-agent-2-content-policy-reads-port-20261112.md`.


## A1 course occurrence reader — 27 remaining (12.11.2026)

- Второй Core `contentAccess` reader port: **28 → 27**,
  frozen 41: **14 resolved / 0 new**; historical 142: **115 retired**.
- `CourseOccurrenceReadsPort` через Application composition передаёт оба
  occurrence-scoped reader callback, Core остаётся владельцем canonical
  entitlement policy и target lookup. Нельзя обойти private course
  назначение, предъявив global Step, HLS медиа ID или grant другого курса.
- Адресные Core 13+3, API 1 PASS, архитектурный guard PASS; полный
  Core/API suite в журнале manifest. Реальная PG-проверка owner/expiry
  и 33-stage/5-stage интеграция ещё не пройдены.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-content-occurrence-reads-port-20261112.md`.
  Frozen baseline JSON не менялся, нет commit/merge/push/deploy.


## A1 Gafus wallet advisory lock — 26 remaining (12.11.2026)

- `gafus/locking.ts` заменяет прямой server reexport `GafusLockPort`
  и fail-closed runtime binding на прежний PostgreSQL
  `gafus-wallet:${userId}` advisory key, в точности в одной транзакции.
  **27 → 26**, frozen 41 **15 resolved / 0 new**, historical 142
  **116 retired**. Статусы/блокировки SQL не менялись.
- Core wallet/reward tests и новый fail-closed/owner async error тест
  6 PASS; API composition 1 PASS. Внешняя реальная проверка
  concurrent grants/debits/owner isolation всё ещё gated.
- Core работа не трогает A2/A3 source wallet records; SQL/Prisma
  остаётся в серверном адаптере, bootstrap в API до маршрутов.
- Manifest `docs/audit/gafus-agent-1-to-agent-2-gafus-wallet-lock-port-20261112.md`.
  Frozen baseline JSON не обновлён; без commit/merge/push/deploy.


## A1 authoritative course revision port — 25 remaining (12.11.2026)

- После wallet lock **26 → 25**, frozen 41:
  **16 resolved / 0 new**, historical 142: **117 retired**.
- Core `getVerifiedCourseContentRevision()` больше не импортирует
  `course-read-server`: только `CourseContentRevisionReadPort`.
  Failure/missing SQL row/unbound port → `null`, значит direct content
  query **без кэша**, а не fallback revision 0. Redis publication
  best-effort как до переноса; listener при Redis outage не влияет на
  committed PostgreSQL revision.
- API bootstrap связывает SQL-reader до Hono routes. Новые 4 теста Core,
  1 API composition и 30 существующих cache/lesson tests PASS.
  Full Core/API и TypeScript проверены в JSON-манифесте.
- Real PG migration triggers/Redis outage на общем A1/A2/A3 кандидате,
  33+5-stage regression ещё не пройдены. Frozen baseline не менялся;
  никаких commit/merge/push/deploy.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-content-revision-port-20261112.md`.


## A1 owner-scoped catalog reader — 24 remaining (12.11.2026)

- Core `courseService.ts` больше не импортирует `legacy-catalog-rows`:
  **25 → 24**, frozen 41: **17 resolved / 0 new**, historical 142:
  **118 retired**.
- `CatalogReadPort` (7 typed methods) и API composition. Авторитетные
  Prisma SELECT ограничивают доступ/favorites/progress только текущим
  владельцем; Core дополнительно фильтрует частную membership по
  точному userId, а не по длине списка. `getCoursesWithProgress`
  сохраняет DTO, даты, `userCourses: []`, role/paid course entitlement.
- Public error/CAS лого курса не изменён. Empty/unbound adapter fails
  closed; read-only SQL port нельзя hot-swap в процессе.
- Старые Core 23/23, новые 4/4, API 1/1 и architecture tests PASS.
  Full suites и TypeScript зафиксированы в JSON-манифесте.
- A2: `docs/audit/gafus-agent-1-to-agent-2-course-catalog-read-port-20261112.md`.
  Real PG owner scoping и общий 33+5-stage остаются внешней проверкой.
  No commit/merge/push/deploy; frozen baseline не изменён.


## A1 training-day exact content projection — 23 remaining (12.11.2026)

- Core `trainingDayContent.ts` не импортирует Persistence content reader;
  **24 → 23**, frozen 41: **18 resolved / 0 new**, historical
  142: **119 retired**.
- `TrainingDayContentReadPort` Core typed snapshot with course/day
  occurrence, ordered step links and attachment fields; browser-safe
  shared StepType. API composition выполняется до Hono routes.
- Оригинальная PostgreSQL `courseType + dayOnCourseId` проверка в SQL,
  Core cache remains revision-coherent, owner-neutral, bounded (TTL/LRU),
  out-of-order requests fenced. Missing adapter rejects with
  `TRAINING_DAY_CONTENT_READ_PORT_UNBOUND` (never stale cache success),
  replacement adapter rejected.
- Addressed 30 old + 4 new Core and 1 API composition PASS.
  Full suites/TypeScript recorded in manifest.
- A2: `docs/audit/gafus-agent-1-to-agent-2-training-day-content-read-port-20261112.md`.
  Shared final 33+5, real PG trigger and Redis/Web/Mobile gates
  are still pending; no merge/commit/push/deploy/frozen ratchet edit.


## A1 subscription promo SERIALIZABLE — 22 remaining (12.11.2026)

- **23 → 22** Core→server, frozen 41 **19 resolved / 0 new**;
  historical 142 **120 retired**. `SubscriptionPromoPort` вводит
  DTO вместо Prisma-generated `AppSubscriptionPromoCode` в Core.
- SQL writer/read owner remains `subscription-finance-server`:
  SERIALIZABLE revision+audit event transaction, P2002, irreversible
  eligibility block from successful/refunded YooKassa payment.
  Public business codes, percent validation and plan gating не менялись.
- Core existing promo 36 PASS, new port 3 PASS, API composition 1 PASS;
  architecture guard PASS. Full Core/API suite в JSON-manifest.
- Real PG race with code archive/revision, YooKassa provider event
  replay and full 33+5-stage integration gated; no commit/merge/push/deploy.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-subscription-promo-port-20261112.md`.


## A1 Gafus wallet ledger rows — 21 remaining (12.11.2026)

- **22 → 21** Core→server; frozen 41 **20 resolved / 0 new**;
  historical 142 **121 retired**.
- `GafusLedgerRowsPort` decouples Core `walletService.ts` from SQL.
  Six narrow methods preserve original wallet owner, caller's locked
  Prisma.TransactionClient and atomic conditional debit `updateMany`
  against balance >= requested spend. Idempotent receipt lookup/append
  remains DB-backed; page cursor/date sort still owner-scoped.
- 20 legacy Core wallet/status/reward tests, 3 new fail-closed tests,
  1 API composition and architecture gate PASS. Full suites in manifest.
- Public balance/history DTO and errors unchanged. Real PG race,
  separate A1/A2/A3 33-stage+5-stage integration pending.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-gafus-ledger-port-20261112.md`.
  No merge/commit/push/deploy; frozen JSON not edited.


## A1 atomic Gafus unlock — 20 remaining (12.11.2026)

- **21 → 20** remaining, frozen 41 **21 resolved / 0 new**;
  historical 142 **122 retired**.
- Core `accessGrantService.ts` no longer imports server unlock rows.
  `GafusUnlockRowsPort` invokes same user-scoped advisory PostgreSQL Tx
  with replay lookup, signed `changeGafusBalanceTx` debit and
  `insertGafusUnlockGrantTx`; grant and debit commit together.
  No second DB connection or auto-renew on replay.
- Core retains exact target/owner entitlement checks and public errors,
  missing port fails closed. Original SQL adapter is bound in API boot.
- 8 old + 3 new Core and 1 API contract PASS, architecture guard PASS.
  Full suite results in JSON manifest. Real-PG race and final 33+5-stage
  external combined acceptance pending. No commit/merge/push/deploy.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-gafus-unlock-port-20261112.md`.


## A1 trainer-day SQL owner port — 19 remaining (12.11.2026)

- Core `trainingDayService.ts` теперь использует `TrainingDayRowsPort`,
  пять узких методов и SQL composition before routes: **20 → 19**,
  frozen 41 **22 resolved / 0 new**, historical 142 **123 retired**.
- SQL `course-progress-server/trainingDayRows.ts` остаётся владельцем
  authorId predicate, проверки Step ownership и CAS удаления в том
  же PostgreSQL Tx; Core не переносит это в preflight.
- Core возвращает те же `ActionResult`/ошибки, invalidation и
  `publishCourseContentChange` после commit; SQL с trusted legacy admin
  path сохранён. Fail closed без порта; hot replacement запрещён.
- 15 legacy+3 new Core и 1 API composition PASS, architecture gate PASS.
  Full regression и TypeScript — в A2 манифесте. Real PG race и
  Web/Mobile/panels joint acceptance pending.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-training-day-rows-port-20261112.md`.
  No merge/commit/push/deploy, frozen baseline not edited.


## A1 rewarded-access SQL reads — 18 remaining (12.11.2026)

- `rewardedCredits/accessService.ts` reads 10 owner-scoped projections
  through the injected `RewardedAccessReadPort`: **19 → 18**,
  frozen 41 **23 resolved / 0 new**, historical 142 **124 retired**.
- Core keeps premium/paid/private/course/video policy, exact per-owner
  `UserTraining`/`UserStep`, role and Gafus eligibility; SQL readers
  live only in entitlements-server. Legacy rewarded grant is read-only;
  never grants unrelated paid course by video URL.
- 16 legacy+3 new Core, 1 API composition and architecture PASS.
  Full typecheck/Core/API results in JSON manifest. Real PG owner ACL,
  video occurrence + notifications staging, joint 33+5 gated.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-rewarded-access-read-port-20261112.md`.
  No commit/merge/push/deploy or baseline change.


## A1 AG4 source review port recovery — 17 remaining (12.11.2026)

- После system error текущий AST-count: **17** (не старые 24),
  frozen 41 **24 resolved / 0 new**, historical 142 **125 retired**.
- Core `g1ReminderMutationReceiptAG4.review.ts` отвязан от SQL
  `identity-write-server/reminder-review-rows` через
  `ReminderAG4ReviewRowsPort`. Одна SQL-транзакция сохраняет owner row lock,
  idempotency key, cap=5, reminder+receipt commit и UNKNOWN fail closed.
- Проблема recovery: test suite API имел 6 неудач. Исходный Core module
  binder не совпадал с compiled `@gafus/core/services/reminders`, из-за
  чего существующий keyed POST возвращал 500; 3 source assertions
  требовали старый незаконный импорт. Исправлена именно composition и
  контракты. Новых маршрутов/миграций нет, review candidate остаётся
  unmounted; существующий keyed POST сохранён.
- 37 старых Core review, 3 новых Core, 18 адресных API, architecture
  PASS; полные регрессии в свежем A2 SHA-манифесте.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-reminder-ag4-recovery-port-20261112.md`.
  No reset, merge, commit, push, deploy or frozen baseline edit.


## A1 OFF021 video.position v3 review-only SQL port — 16 remaining (12.11.2026)

- Core `offlineVideoPositionV3Service.ts` decoupled from server SQL via
  `OfflineVideoSqlPort`: **17 → 16** Core→server; frozen baseline 41:
  **25 resolved / 0 new**; historical 142 **126 retired**.
- Review-only source port preserves one PostgreSQL transaction for exact
  occurrence entitlement, UUID owner/event receipt claim, FOR UPDATE
  revision+CAS, idempotent committed response and public 400/403/404/409/503.
- API composer exists exclusively for review. **Not imported by app.ts,
  active offline route, nor mounted in production**. Legacy video progress
  dual-write is explicitly NOT part of this patch; real PG acceptance gated.
- Targeted Core ACL/replay 8 tests, API v3 composer 2 tests PASS;
  Core/API TS, course-progress adapter, arch/graph logged in JSON manifest.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-offline-video-v3-port-20261112.md`.
  No git commit/merge/push/deploy or frozen baseline JSON edit.


## A1 rewarded wallet advisory SQL port — 15 remaining (12.11.2026)

- Core `rewardedCredits/walletService.ts` decoupled from legacy
  `gafus-server/rewarded-wallet-rows`: **16 → 15** Core→server,
  frozen 41 **26 resolved / 0 new**, historical **127/142 retired**.
- Core sees an opaque/branded RewardedWalletTx and typed RewardedWalletPort.
  Existing server SQL maintains owner PostgreSQL transaction-level advisory
  lock, UNIQUE(idempotencyKey), wallet balance/pendingRefundCredits updates.
- Existing EARN/SPEND/REFUND, one-time Yandex session, Premium bypass,
  Moscow calendar-day limit, balance cap, replay and public failure types
  preserved. No nested/new DB connection; SQL-bound API startup.
- 9 existing +4 new Core, 1 API composer PASS; architecture guard PASS.
  Full Core/API suites/TS results and current SHA256 in A2 manifest.
- A1→A2 `docs/audit/gafus-agent-1-to-agent-2-rewarded-wallet-port-20261112.md`.
  Real PG races and 33+5-stage joint integration pending; no commit/merge/push/deploy.


## A1 admin Gafus + trainer-course rows ports — 12 remaining (12.11.2026)

- Admin Gafus policy now consumes fail-closed transaction-scoped `GafusAdminRowsPort`; original server adapter preserves one PostgreSQL transaction for role checks, audit, wallet lock, replay and fraud CAS.
- Trainer Course service now consumes `TrainerCourseRowsPort`; original SQL implements version-CAS, owner predicate, ordered DayOnCourse, stale/not-found and delete. No fake success and no new transaction.
- **Core→server 14→12**, frozen ratchet 41 with 29 removed/0 new; historic 142→12 (130 retired). Baseline JSON unchanged.
- Core/API typecheck/build PASS; Core and API suites PASS; Core admin 13, trainer 24, redaction 2; API mounted admin 26, port compositions 2; architecture boundaries and workspace graph PASS. Real isolated PG/Redis and 33+5 integration remain PENDING.
- A1→A2: `docs/audit/gafus-agent-1-to-agent-2-admin-trainer-course-ports-20261112.md` and JSON receipt. No commit, merge, push, deploy.

## A1 окончание последних 12 Core → server связей — 0 remaining (12.11.2026)

- Перенесены **все 12 оставшихся AST-импортов**: Auth (username/refresh/password CAS), VK account links, Gafus transaction contract, Offline Mutation Journal, Prevention/Pets/Vet, rewarded-ad session, trainer-step authoring, training-day operation service (2 импорта). Оригинальные server-пакеты владеют SQL и блокировками; API composition регистрирует typed fail-closed Core-порты без fallback.
- После переноса архитектурные контракты порта не импортируют `@gafus/prisma`, `@prisma/client` или `@gafus/*-server`. Gafus transaction представлен структурным Core-facing view, физический Prisma Client остаётся на границе Persistence. Критические CAS, ACL, replay и атомарный outbox по-прежнему исполняются в исходной DB транзакции.
- **Ratchet 41→0, новых 0**; по исходной инвентаризации **142→0**. Замороженные baseline JSON не менялись; дополнительных конфликтов Git не найдено.
- Итоговые PASS: Core Vitest **2159 / 136 skipped**; API Vitest **2767 / 266 skipped**; 8 новых unit-контрактов strict binding/rebind; `pnpm check:core-boundaries` (**26 PASS**); `pnpm -r --workspace-concurrency 5 typecheck` (все запущенные пакеты); сборка Core/API; workspace graph **69 проектов, 0 циклов**.
- A1→A2 final SHA-256 чекпоинт: `docs/audit/gafus-agent-1-to-agent-2-zero-core-server-facades-20261112.json` и `.md`. Не интегрировать с A2/A3 без preflight по общему `apps/api/src/app.ts` и манифесту. Live PG/Redis, 33-stage regression и 5-stage chaos здесь **не выполнялись**. Commit/merge/push/deploy **не делались**.
