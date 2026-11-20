# Запуск тестирования GAFUS (переходный интерфейс)

Новый тестовый запуск **дополняет**, а не заменяет существующие `pnpm test`, `pnpm test:all`, пакетные Vitest и блокирующие проверки CI. В репозитории сохраняются legacy-сценарии до подтверждения эквивалентности на одном коммите. Инвентаризация: `tests/catalog/inventory.json`; заявленные критические сценарии — `tests/catalog/critical.json`, исполняемые задачи — `tests/catalog/suites.json`.

**Актуальный hand-off / release-readiness:** [`TEST_SYSTEM_RELEASE_READINESS_HANDOFF_20261119.md`](./TEST_SYSTEM_RELEASE_READINESS_HANDOFF_20261119.md). Проверка без физических устройств и без GitHub execution не разрешает релиз.

**Payment/Worker fault-пилот:** [`TEST_FAULT_PILOT_20261119.md`](./TEST_FAULT_PILOT_20261119.md) — 2/2 одноразовых PostgreSQL checks, 5 именованных failure assertions; только локальная информационная проверка, не разрешение на релиз.

**Измеряемое покрытие payment/Worker (локальный advisory):** [`TEST_RISK_COVERAGE_PILOT_20261119.md`](./TEST_RISK_COVERAGE_PILOT_20261119.md) — `pnpm test:coverage-risk`, V8 baseline по четырём исходникам; не release gate.

**Targeted payment/transition coverage delta:** [`TEST_RISK_COVERAGE_TARGETED_20261119.md`](./TEST_RISK_COVERAGE_TARGETED_20261119.md) — saved old baseline, updated measured counts, named SQL scenarios and limitations.

**Worker Redis/BullMQ recovery advisory:** [`TEST_WORKER_REDIS_RECOVERY_20261119.md`](./TEST_WORKER_REDIS_RECOVERY_20261119.md). Real private Redis AOF restart, actual owned Worker SIGKILL after SQL checkpoint, three named QA cases, no release gate.

**Authenticated API HTTP/SQL acceptance:** [`TEST_API_AUTHENTICATED_HTTP_ACCEPTANCE_20261119.md`](./TEST_API_AUTHENTICATED_HTTP_ACCEPTANCE_20261119.md) — 9 named HTTP+SQL cases, original Hono TCP, disposable PostgreSQL18/Redis, advisory only.

**Additional local SIGKILL and Turbo cache checks:** [TEST_REFACTOR_LOCAL_SIGKILL_AND_TURBO_CACHE_20261119.md](./TEST_REFACTOR_LOCAL_SIGKILL_AND_TURBO_CACHE_20261119.md) — supervised hard-kill 7/7, forged owner identity rejection, verified Vite config cache hash; informational only.

**Latest five local QA hardening tasks:** [TEST_REFACTOR_FIVE_LOCAL_STAGES_20261119.md](./TEST_REFACTOR_FIVE_LOCAL_STAGES_20261119.md) — concurrency and cancellation, 13 package unit test routes, V8 source coverage, Prisma rollback and local CI fail-closed receipts; advisory only.

**Latest ten-stage continuation checkpoint:** [TEST_REFACTOR_CONTINUATION_20261119.md](./TEST_REFACTOR_CONTINUATION_20261119.md) — actual local PASS/INCOMPLETE matrix and remaining external release acceptance, no gate changes.

**Partial workspace-gap test pilot:** [TEST_WORKSPACE_GAP_ADVISORY_20261119.md](./TEST_WORKSPACE_GAP_ADVISORY_20261119.md) — 13 workspaces / 86 selected assertions, each with non-gating test:unit script; CI promotion still open.

**Account deletion audit immutability:** [`TEST_ACCOUNT_DELETION_AUDIT_GUARD_20261119.md`](./TEST_ACCOUNT_DELETION_AUDIT_GUARD_20261119.md) — local PostgreSQL 18, 5/5 append-only SQL cases, migration chain and Bash 3.2 false-PASS regression fix; informational only.

**Existing Chrome cookie/refresh acceptance:** [`TEST_BROWSER_COOKIE_ACCEPTANCE_20261119.md`](./TEST_BROWSER_COOKIE_ACCEPTANCE_20261119.md) — 13 ordered live Chrome actions, 29 Hono HTTP responses, 13 real PostgreSQL snapshots, two refresh rotations; advisory only.

## Команды

| Цель | Команда |
| --- | --- |
| Понять ожидаемый состав | `pnpm test:plan --profile ci --base origin/main --plan-only` |
| Unit пакета | `pnpm test:unit --package @gafus/core-client` |
| Проверка конкретного сценария | `pnpm test:unit --scenario chat.delivery` |
| Реальная БД, тренировки | `pnpm test:integration --scenario training.complete` |
| Browser E2E, реальный web/API | `pnpm test:e2e:web --scenario training.complete` |
| Все зарегистрированные интеграции | `pnpm test:integration` |
| Пилот покрытия реального модуля | `pnpm test:coverage:pilot` |
| Проверки контрактов раннера | `pnpm test:system:contract` |
| Native-набор для iOS | `pnpm test:e2e:mobile --platform ios` |
| Полный план | `pnpm test:full --plan-only` |

Параметры `--package`, `--scenario`, `--platform`, `--base`, `--plan-only` разбираются `scripts/qa/test-system.mjs`. Неизвестные ID завершаются ошибкой. `--base` — фактическая база сравнения PR; если её нельзя получить, выбирается полный применимый профиль. Документация меняет выбор только при чисто документальном изменении, но неизвестный исполняемый путь расширяет план.

`plan.json`, поимённые отчёты Vitest, журналы и `summary.md` размещаются **только** в `.qa/testing/<run-id>/`, исключены из Git. Записи содержат SHA коммита, fingerprint плана, номер попытки, платформу, статус и время. Обязательный пропуск, пустой набор, чужой SHA, отсутствующий JSON или повторный непредусмотренный результат дают код `2`, ошибка утверждения — `1`, полное прохождение — `0`. Отдельный запуск пакета — частичный; его успешность **не является** общей готовностью к релизу.

Для воспроизведения сбоя используйте указанную в `summary.md` команду. При распределённом запуске `node scripts/qa/test-system.mjs run --plan .qa/testing/<run-id>/plan.json --task <check-id>` запускает одну задачу, а `node scripts/qa/test-system.mjs report --run-id <run-id>` сверяет все обязательные записи. Отчёт должен собираться независимо от успеха исполнителей.

## Изоляция данных

Интеграционные обёртки `scripts/qa/*isolated-pg.sh` создают уникальный временный PostgreSQL 18 на `127.0.0.1` с временными пользователем, портом и БД. Сами тесты проверяют эти свойства. Они вызывают Prisma `db push` и **не** являются проверкой применения исторических миграций.

Compose runner: `node tests/support/test-env.mjs with -- <command>` (strict migration deployment) or `node tests/support/test-env.mjs with-functional -- <command>` (current schema via db push ONLY for functional tests; this is NOT a migration check). Strict PG15 bootstrap fails at `20241108120000_exam_result_trainer_review` because `ExamResult` is missing (P3018/42P01). The test process receives sanitized env, random credentials and loopback addresses, and teardown removes only owned resources.

**Нельзя использовать реальные платежные ключи, production DATABASE_URL или реальные аккаунты в сценариях.** Проверки тестовых провайдеров и физических устройств получают отдельные записи с их окружением и версиями.

## Браузерный E2E: `training.complete.web`

`pnpm test:e2e:web --scenario training.complete` создаёт изолированную Docker Compose PostgreSQL 15 + Redis 7 с уникальными пользователем, БД и портами; поднимает настоящие Hono API и Vite на `127.0.0.1:3001/5173`, сеет одноразовый курс и двух синтетических пользователей. Используется **только** `with-functional` (`prisma db push`), это **не** доказательство чистой миграционной цепочки. В конце проверяются `UserStep.COMPLETED`, `UserCourse.COMPLETED`, принадлежность и ровно одна запись шага. При завершении контейнеры и том удаляются.

Локально браузер управляется **McpGo-Playwright Extension в уже открытом личном Chrome**; для завершения запуска нужен автоматизированный MCP-прогон: вход → шаг → «Я выполнил» (HTTP 200) → выход → повторный вход → сохранённый статус. После UI-проверок пишется `browser-evidence.json`; runner независимо проверяет БД и кладёт именованный отчёт в `.qa/testing/<run-id>/tasks/*/tests.json`. Сам запуск CLI без браузерного сценария намеренно не даёт PASS. Отчёт local обозначает `source=mcpgo-playwright-extension-with-sql-verification`, он **не** притворяется запуском Playwright CLI.

**Два независимых локальных прогона завершились с кодом 0:**

- `.qa/testing/qa-81eae30c-473a-4dc7-848b-e46663c9d6f9/summary.md` — `gafusqa94b4b6105014`; `UserStep=COMPLETED`, `UserCourse=COMPLETED`, один шаг.
- `.qa/testing/qa-81a12a11-b748-4131-9a19-37721cc1daef/summary.md` — `gafusqa326490939111`; те же независимые SQL-утверждения, новый пользователь и новая БД.

В GitHub CI `tests/e2e/web/training.complete.spec.ts` исполняет **Playwright Test с Chromium только на временном runner**; `tests/support/playwright-report-contract.mjs` принимает лишь строго один пройденный именованный тест, без skip/retry/failure, после чего сверяются SQL-данные. Job `testing-web-e2e-advisory` имеет `continue-on-error` и не входит в release gates. Сам job на GitHub ещё не запускался (нет push/commit/deploy).

## Покрытие

`pnpm test:coverage:pilot` измеряет исходный модуль `packages/core-client/src/utils/training.ts` на четырёх владельческих тестах и сохраняет Istanbul JSON, LCOV, JSON summary и receipt. Пустой знаменатель строк или ветвей считается ошибкой, даже если инструмент показывает «100%». Этот запуск **не** равен покрытию всего монорепозитория. `packages/core/src/utils/training.ts` — реэкспорт, его нельзя использовать как знаменатель бизнес-логики.

## Что пока не подтверждено

- `training.complete.web`: два локальных E2E прогона на разных одноразовых Compose-БД прошли; **GitHub Actions Playwright job ещё не запускался**, поэтому CI-браузерный профиль остаётся информационным. Не считать его обязательным release gate.
- `mobile.ota.android` и `mobile.ota.ios` ждут подписанные QA-сборки, Maestro/устройства, тестовый канал OTA и подтверждение запущенной ревизии. YAML-шаблоны в `tests/e2e/mobile/flows/` не равны пройденной нативной приёмке.
- Docker functional profile (PostgreSQL 15 + Redis 7) passed and cleaned up. Two-stack Compose validation was separately performed; cancellation still needs testing. Strict migration mode is blocked by P3018/42P01.
- Системная миграционная совместимость, облачные Jobs, тестовые Apple/ЮKassa, весь набор 33/5/18 регрессионных сценариев и приемка публикации/отката требуют отдельных проверок.
- `testing-advisory` и `testing-nightly` по-прежнему проверяют план и контракты; отдельный `testing-web-e2e-advisory` запускает Playwright Test на disposable GitHub runner при PR/ручном вызове и **не блокирует release** (`continue-on-error`). Фактический CI-прогон ещё не подтверждён. Действующие `deploy-production`, `deploy-only` и OTA release gates сохранены.

Новые профили подключаются как обязательные только после повторного чистого прохождения, демонстрационного отказа при поломке и подтверждения каждого требуемого окружения на одном SHA. Для неразмеченных пакетов в инвентаре явно указан `gap:no-test-script` — это работа на перенос, а не успешная проверка.

## Воспроизводимая web-vite регрессия (информационная, 19.11.2026)

Существующий `pnpm --filter @gafus/web-vite test` **не изменён**. Раньше единый Vitest/JSDOM-процесс обрывался после 480 секунд без полного отчёта. Новый запуск `pnpm test:web-vite` делит `vite.config.test.mjs` и **303 файла** `apps/web-vite/src/**/*.{test,spec}.*` на 44 именованные группы с отдельным свежим Vitest-процессом на группу (кроме Node-тестов Vite-конфига). Сохранены штатная конфигурация, `--maxWorkers=1`, изоляция пяти тяжёлых React-тестов по правилам прежнего `web-vite-chunked-regression.mjs`, отсутствие retry и `passWithNoTests`. Лимит — до 25 минут **на группу**, не общий 8-минутный обрыв.

Команды:

```bash
pnpm test:web-vite:inventory
pnpm test:plan --profile web-vite --plan-only
pnpm test:web-vite
pnpm test:unit --package @gafus/web-vite  # тоже использует 44 именованные группы
pnpm test:system:contract
# При осознанном добавлении/удалении тестов:
node scripts/qa/web-vite-group-inventory.mjs write
```

`tests/catalog/web-vite-groups.json` фиксирует точный входной список: группировка проверяется на полноту и отсутствие дубликатов ещё до выполнения. `plan` включает все 44 задачи; `run` пишет подлинные Vitest JSON и JSON-профиль каждой группы; `report` повторно проверяет **все имена файлов и исходы всех тест-кейсов**. Отсутствующий отчёт, незапланированный файл или неожиданный пропуск дают `BLOCKED`. Единственные разрешённые обычной unit-регрессией пропуски — **шесть точно названных** кейсов `g05WebRealConsumer.real.test.ts`, которые требуют отдельного допуска AG4 Web для реального HTTP. Эти 6 — `skipped`, а не `passed`.

**Подтверждено локально** на `04052d616`: `.qa/testing/qa-df588eea-1a5f-4b67-86cd-4ff9360cd281/summary.md` — `44/44` групп, `304/304` файла (303 Vitest + Node Vite config), **3154 passed**, **6 известных gated skipped**, **0 failed**, финальный `REPORT 0`. Первая попытка одной группы была `BLOCKED` из-за этих документированных пропусков; после настройки строгого allowlist повторно запущена только она в том же плане. Сумма длительностей — приблизительно 8 минут 28 секунд; самая долгая группа `feature-training-01` — около 62 секунд. Это реальная регрессия исходных файлов, но не выполнение gated G05 HTTP-тестов и не готовность к релизу.

В `.github/workflows/testing-reusable.yml` появился `testing-web-vite-advisory` для PR и ручного запуска. Он устанавливает locked зависимости, строит зависимые пакеты и запускает ту же команду `pnpm test:web-vite`; `continue-on-error` сохраняет **все текущие release gates без изменений**. Job **ещё не запускался на GitHub** — никаких commit, push или deploy не выполнялось.

## Maestro: предпосылки без устройства (19.11.2026)

`pnpm test:e2e:mobile:preflight` анализирует действительные три YAML-flow Maestro, `ru.gafus.app`, native `testID`, Expo/OTA runtime и доступные бинарники без открытия симуляторов, установки приложений или публикации OTA. Проверено: `Expo 57`, `version=1.7.5`, `runtimeVersion=appVersion`, `expo-updates ~57.0.28`; файлы flow и исходные `testID` совпадают. `adb`, Android SDK, Gradle wrapper, Xcode 27.2, `xcrun`, `pod` доступны. **Обновление 19.11.2026:** `maestro` 2.12.1 и Java 17.0.18 настроены, команда `maestro test --help` проверена без устройств.  Нет подключённого Android и запущенного iOS Simulator. Подписанные бинарники **изолированного QA** не подтверждены. Результат `incomplete` и не считается нативным E2E PASS. Точные команды, условия безопасного тестового API/канала и чек-лист физической приёмки: `tests/e2e/mobile/README.md`.


## Установка Maestro и информационный native-preflight (19.11.2026)

Локально установлен **Maestro CLI 2.12.1** в `~/.maestro/bin` и закреплён `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home` через пользовательские `.zprofile`/`.zshrc` (с резервными копиями). В новых `zsh -lc` и `zsh -ic` проверены `java -version` (17.0.18), `maestro --version` и `maestro test --help`. Команды чтения не создают/запускают устройств.

`pnpm test:e2e:mobile:preflight` оставлен прямой диагностикой с машинным JSON `status=incomplete`. Новый `pnpm test:mobile:preflight` — интеграция с `test-system.mjs --profile native-preflight`: одна зарегистрированная задача `mobile.maestro.preflight`, которая повторно проверяет CLI, Java, все три YAML-flow и native `testID`; пишет строгий JSON-отчёт `native-preflight.json`; завершает кодом **2 (`incomplete`)** до предъявления устройств, подписанных QA-сборок и установленной реальной OTA-ревизии. `report` независимо сверяет содержимое реальных YAML и RN testID по sha256 и показывает `nativePreflight.status=incomplete`. Статическая проверка никогда не подтверждает нативный E2E.

Фактическая квитанция: `.qa/testing/qa-0ab652c6-515e-4ea8-b4f9-cd4db9960eb5/summary.md`, `REPORT 2`, `toolsReady=true`, `staticFlowsValidated=3`. На машине нет доступного физического Android/iOS, подписанных изолированных QA-бинарников или JUnit после реального OTA. У Maestro 2.12.1 нет отдельной поддерживаемой команды `test --dry-run` для flow без устройства: используется статическая валидация YAML плюс проверка `maestro test --help`, без запуска `maestro test`.

Информационную задачу можно вручную выбрать в `testing-reusable.yml` через `workflow_dispatch` profile `native-preflight`; job имеет `continue-on-error` и **не является release gate**. На GitHub он ещё не исполнялся. Физический чек-лист и реальные команды: `tests/e2e/mobile/README.md`.
