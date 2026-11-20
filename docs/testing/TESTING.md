# Тестирование @gafus/core

> Репозиторный стандарт покрытия: см. `docs/testing/TEST_COVERAGE_POLICY.md`.

Документация по тестированию пакета `@gafus/core` — бизнес-логики для Web и React Native приложений.

## Тестовый фреймворк

- **Vitest** — единый фреймворк для unit-тестов
- Конфигурация: `packages/core/vitest.config.ts`
- Файлы тестов: `src/**/*.test.ts`

## Запуск тестов

```bash
# Все тесты
pnpm --filter @gafus/core test

# Watch-режим
pnpm --filter @gafus/core test:watch

# Отчёт о покрытии
pnpm --filter @gafus/core test:coverage
```

## Целевые показатели покрытия

| Область                     | Цель | Текущее    |
| --------------------------- | ---- | ---------- |
| errors/                     | 100% | 100%       |
| services/achievements       | 100% | ~97%       |
| services/cache              | 100% | 100%       |
| services/common             | 100% | 100%       |
| services/user (preferences) | 100% | 100%       |
| utils/                      | 90%+ | ~90%       |
| Остальные сервисы           | 80%+ | В процессе |

## Инфраструктура тестов

### test-utils.ts

Файл `packages/core/src/test/test-utils.ts` содержит переиспользуемые моки:

- `createMockPrisma()` — mock Prisma client с моделями (user, course, userTraining, и т.д.)
- `createMockLogger()` — mock логгера (info, warn, error, success)

### Fixtures

В `packages/core/src/test/fixtures/`:

- `user.ts` — `createUserFixture`
- `course.ts` — `createCourseFixture`
- `pet.ts` — `createPetFixture`
- `training.ts` — `createUserTrainingFixture`, `createDayOnCourseFixture`
- `achievement.ts` — `createAchievementStatsFixture`

## Паттерны моков

### Prisma

```typescript
const mockUserFindMany = vi.fn();
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
  },
}));
```

Для ESM-модулей используйте `vi.hoisted()`:

```typescript
const { MockKnownError } = vi.hoisted(() => {
  class MockKnownError extends Error {
    code: string;
    constructor(msg: string, opts: { code: string }) {
      super(msg);
      this.code = opts.code;
    }
  }
  return { MockKnownError };
});
vi.mock("@gafus/prisma", () => ({ Prisma: { PrismaClientKnownRequestError: MockKnownError } }));
```

### Logger

```typescript
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));
```

### Внешние сервисы (auth, queues)

```typescript
vi.mock("@gafus/auth", () => ({
  checkUserConfirmed: vi.fn(),
  getUserPhoneByUsername: vi.fn(),
}));

vi.mock("@gafus/queues", () => ({
  pushQueue: { add: vi.fn(), remove: vi.fn() },
}));
```

### Временные зависимости (retry, age)

```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("retries after delay", async () => {
  vi.setSystemTime(new Date("2025-03-15"));
  // ...
  await vi.advanceTimersByTimeAsync(1000);
});
```

## Рекомендации при написании тестов

1. Используйте `beforeEach(() => vi.clearAllMocks())` в каждом describe.
2. Группируйте тесты: success path, not found, error path.
3. Для чистой функции без зависимостей — моки не требуются.
4. Для сервисов с Prisma — мокайте только используемые модели.
5. Используйте fixtures для реалистичных данных.

## Структура тестовых файлов

```
packages/core/src/
├── errors/
│   ├── ServiceError.test.ts
│   └── prismaErrorHandler.test.ts
├── utils/
│   ├── date.test.ts
│   ├── retry.test.ts
│   └── ...
├── services/
│   ├── achievements/
│   │   ├── calculateAchievements.test.ts
│   │   ├── calculateStreaks.test.ts
│   │   ├── datesService.test.ts
│   │   └── statsService.test.ts
│   ├── auth/authService.test.ts
│   ├── cache/tags.test.ts
│   └── ...
└── test/
    ├── test-utils.ts
    └── fixtures/
```

## Интеграция с Turborepo

В `turbo.json` задача `test` зависит от `^build`. При запуске `pnpm test` из корня монорепо выполняются тесты всех пакетов, включая `@gafus/core`.

---

## Тестирование остальных пакетов (80% coverage)

Пять пакетов: `@gafus/video-access`, `@gafus/auth`, `@gafus/reengagement`, `@gafus/csrf`, `@gafus/worker` — используют Vitest и локальные моки. Целевой порог покрытия: 80% (временное понижение допустимо для сложных модулей).

### @gafus/video-access

- **Путь к тестам:** `packages/video-access/src/**/*.test.ts`
- **Команды:**
  ```bash
  pnpm --filter @gafus/video-access test
  pnpm --filter @gafus/video-access test:coverage
  ```
- **Конфиг:** `packages/video-access/vitest.config.ts`

### @gafus/auth

- **Путь к тестам:** `packages/auth/src/**/*.test.ts`
- **Команды:**
  ```bash
  pnpm --filter @gafus/auth test
  pnpm --filter @gafus/auth test:coverage
  ```
- **Конфиг:** `packages/auth/vitest.config.ts`
- **Особенности:** JWT (jose), Prisma transactions, libphonenumber-js

### @gafus/reengagement

- **Путь к тестам:** `packages/reengagement/src/**/*.test.ts`
- **Команды:**
  ```bash
  pnpm --filter @gafus/reengagement test
  pnpm --filter @gafus/reengagement test:coverage
  ```
- **Конфиг:** `packages/reengagement/vitest.config.ts`
- **Моки:** `createMockPrisma()` в `src/test/test-utils.ts` (user, userTraining, userStep, reengagementCampaign, reengagementNotification, и др.)

### @gafus/csrf

- **Путь к тестам:** `packages/csrf/src/**/*.test.ts`
- **Команды:**
  ```bash
  pnpm --filter @gafus/csrf test
  pnpm --filter @gafus/csrf test:coverage
  ```
- **Конфиг:** `packages/csrf/vitest.config.ts`
- **Модули:** `csrf-crypto.ts` (чистые функции: isValidTokenFormat, createTokenHash, safeTokenCompare), `utils.ts` (мок next/headers)

### @gafus/worker

- **Путь к тестам:** `packages/worker/src/**/*.test.ts`
- **Команды:**
  ```bash
  pnpm --filter @gafus/worker test
  pnpm --filter @gafus/worker test:coverage
  ```
- **Конфиг:** `packages/worker/vitest.config.ts`
- **Экспорт:** `NotificationProcessor` из `push-worker.ts`

## Новый межпакетный тестовый запуск (переход 2026-11-19)

Система `pnpm test:plan` / `test:unit` / `test:integration` / `test:coverage:pilot` и её ограничения описаны в [TEST_SYSTEM_GUIDE_20261119.md](TEST_SYSTEM_GUIDE_20261119.md). Пакетные примеры и правила ниже сохраняются; новые E2E и release gates не подменяют уже обязательные проверки.

## План, исполнение и повтор

| Задача | Команда |
| --- | --- |
| Обновить инвентарь по манифестам пакетов и дереву исходников | `pnpm test:inventory` |
| Подготовить план затронутых пакетов и их потребителей | `pnpm test:ci --base origin/main --plan-only` |
| Проверить бизнес-сценарий на указанном уровне | `pnpm test:unit --scenario staff.actions` или `pnpm test:integration --scenario training.complete` |
| Прогнать одну задачу сохранённого плана | `node scripts/qa/test-system.mjs run --run-id <id> --task <task-id>` |
| Собрать результат после исполнителей | `node scripts/qa/test-system.mjs report --run-id <id>` |
| Запустить полный сценарий ученика с Playwright Test | `pnpm test:e2e:web --scenario training.complete` |
| Выполнить текущие legacy regression/fault suites с поимённым сверением | `pnpm test:legacy` |
| Собрать сводное V8/Istanbul-покрытие | `pnpm test:coverage` или `pnpm test:coverage --package @gafus/api` |

`plan` выдаёт точный путь и список задач. Для повтора повторно используют тот же `plan.json` и ID задачи. Новый результат записывается в отдельный `attempt-N`. Сводка показывает номер попытки и помечает успех после повтора. Если последняя попытка не завершилась, прежний результат не закрывает задачу. Код `1` обозначает ошибку проверки, `2` — отсутствие среды или достоверного результата. Если есть обе причины, сводка возвращает `2` и сохраняет оба статуса. Исполнение отдельных пакетов, ручные сценарии и грязное рабочее дерево пригодны для диагностики. Для release-квитанции требуется полный план и чистый checkout проверяемого SHA. Рабочие пакеты с информационным маршрутом, ожидающим включения в полный профиль, перечисляются в секции workspace gaps и дают код 2.

Начинайте разбор с `summary.md`, затем открывайте `output.log`, `receipt.json` и исходный отчёт инструмента в самой свежей попытке. Для Web сценария сверяйте Playwright JSON и SQL в `training-web.json`, а для Maestro — отдельные JUnit и `native-run.json`. Готовые инструменты и отсутствие квитанции об исполнении дают неполный результат.

## Изолированная среда

Стандартный Compose-профиль использует PostgreSQL 15 и Redis 7. Переменная `GAFUS_QA_POSTGRES=18` выбирает PostgreSQL 18 с отдельным томом. Для SQL-проверок доступны `pnpm test:integration --scenario schema.fresh` и две защищённые процедуры fresh-only для PostgreSQL 15 и 18. Они используют одобренную базовую схему, исторический реестр и последующие миграции. Команда `tests/support/test-env.mjs with` выполняет строгий `migrate deploy`; прямой replay исторической цепочки на пустой базе имеет зарегистрированный блокер `ExamResult`. Режим `with-functional` подготавливает текущую схему для прикладных проверок. Для приёмки миграций нужны свежий bootstrap и отдельная проверка обновления предыдущей схемы с синтетическими данными.

Локальная Web E2E-проверка запускает изолированные Vite и Hono на loopback-портах и использует **уже открытый личный Chrome через McpGo-Playwright Extension**. Вне настоящего GitHub Actions по умолчанию выбран ручной Chrome-режим; отдельный Chromium на Mac не запускается даже при `CI=true`. `GAFUS_WEB_E2E_AUTOMATED=1` вне GitHub Actions отклоняется. В GitHub Actions выполняется настоящий headless Playwright Test с отдельным браузерным контекстом. Оба маршрута должны подтвердить интерфейс после повторного входа и одну запись PostgreSQL. Для явного ручного режима можно указать `GAFUS_WEB_E2E_AUTOMATED=0`; без фактической браузерной и SQL-квитанции сценарий не считается пройденным.

## Соответствие прежних запусков

| Прежний маршрут | Маршрут нового плана |
| --- | --- |
| `pnpm --filter <workspace> test` | `pnpm test:unit --package <workspace>`. Для Web используются существующие группы с проверкой каждого файла. |
| `turbo run test:coverage` | `pnpm test:coverage:legacy` сохраняет пакетные пороги. `pnpm test:coverage` объединяет Istanbul JSON и записывает LCOV, HTML и знаменатели строк и ветвей. |
| `architecture-final-regression.sh` и `architecture-chaos-local.sh` | `pnpm test:legacy` вызывает прежние скрипты и сверяет каждый из 33 этапов и 10 текущих fault-проб. В исходном плане было 5 fault-проб. |
| Исходные 18 сценариев приёмки | `node scripts/qa/legacy-matrix-ledger.mjs` сверяет исходную матрицу и отдельно помечает исторические результаты. Для закрытия сценариев нужны квитанции того же кандидата. |

Для переноса добавляйте старый сценарий с его именами и предпосылками в `suites.json`, привязывайте обязательные проверки в `critical.json` и сравнивайте файлы, утверждения, пропуски и выходы на одном SHA. Удаление старого маршрута возможно после подтверждения эквивалентности по положительным и отрицательным случаям.

## CI и выпуск

Nightly и ручной профиль `full` в `testing-reusable.yml` сохраняют исходный план, распределяют задачи по Linux, Android и macOS/iOS и собирают отчёт с учётом отсутствующих заданий. Для hosted Android/iOS без подготовленных QA-устройств и подписанных сборок ожидается `INCOMPLETE`. PR сохраняет отдельные информационные маршруты. `GAFUS_TEST_MAIN_ADVISORY=true` позволяет получить артефакт полного профиля в CI проверяемого main SHA. `deploy-only` ищет отчёт в том же CI run и попытке, которые подтвердили образы. Для OTA переменная `GAFUS_OTA_QA_REPORT_RUN_ID` указывает завершившийся доверенный workflow на main. Сравниваются SHA, версия, build, runtime, ревизия и update ID.

После приёмки для активации блокировки понадобится сделать отдельную проверку обязательной для выпуска и убрать `continue-on-error` у этой проверки. Перед переключением требуется воспроизвести на тестовых workflow успешный отчёт, ошибку, пропуск, неполный набор задач, потерю артефакта и подмену SHA или OTA identity. Сценарии провайдеров, стендов и устройств должны быть закрыты реальными квитанциями кандидата.
