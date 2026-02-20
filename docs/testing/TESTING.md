# Тестирование @gafus/core

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

| Область | Цель | Текущее |
|---------|------|---------|
| errors/ | 100% | 100% |
| services/achievements | 100% | ~97% |
| services/cache | 100% | 100% |
| services/common | 100% | 100% |
| services/user (preferences) | 100% | 100% |
| utils/ | 90%+ | ~90% |
| Остальные сервисы | 80%+ | В процессе |

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
