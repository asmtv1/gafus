# @gafus/core

Переиспользуемая бизнес-логика для Web и React Native приложений GAFUS.

## Скрипты

```bash
pnpm build          # Сборка
pnpm dev            # Watch-режим
pnpm lint           # ESLint
pnpm typecheck      # Проверка типов
pnpm test           # Запуск тестов
pnpm test:watch     # Тесты в watch-режиме
pnpm test:coverage  # Отчёт о покрытии
```

## Тестирование

```bash
# Все тесты
pnpm test

# Отчёт о покрытии
pnpm test:coverage
```

Подробнее см. [docs/testing/TESTING.md](../../docs/testing/TESTING.md).

## Структура

- `src/services/` — бизнес-логика (auth, course, user, achievements, admin и др.)
- `src/errors/` — ServiceError, prismaErrorHandler
- `src/utils/` — утилиты (date, training, retry, social, video и др.)
- `src/test/` — test-utils, fixtures
