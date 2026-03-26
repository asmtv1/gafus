# @gafus/logger - Система логирования

## 📋 Обзор

Пакет `@gafus/logger` предоставляет единую систему логирования для всех приложений GAFUS. Построен на базе **Pino** — одного из самых быстрых Node.js логгеров.

## 🎯 Почему свой логгер, а не Sentry/Datadog?

Проект использует собственную систему логирования по следующим причинам:

| Критерий               | @gafus/logger                | Sentry/Datadog                       |
| ---------------------- | ---------------------------- | ------------------------------------ |
| **Стоимость**          | Бесплатно (self-hosted)      | $26+/месяц или ограничения free tier |
| **Контроль данных**    | Полный (своя БД)             | Данные у провайдера                  |
| **Интеграция**         | Нативная для монорепо        | Требует настройки                    |
| **Гибкость**           | Полная кастомизация          | Ограничена API провайдера            |
| **Производительность** | Pino — один из самых быстрых | Зависит от SDK                       |

### Что уже реализовано

- ✅ Серверные логи → Pino → stdout (docker logs)
- ✅ Серверные ошибки → Tracer (logger.error/fatal с Error)
- ✅ Структурированные логи (JSON)
- ✅ Поддержка всех приложений монорепо
- ✅ Специализированные логгеры для каждого типа сервиса
- ✅ React Error Boundaries (`@gafus/error-handling`)

### Чего не хватает (можно добавить при необходимости)

- Source maps для красивых stack traces
- Session replay (можно интегрировать LogRocket отдельно)
- Breadcrumbs (история действий до ошибки)

**Вывод:** Переход на Sentry/Datadog не оправдан — текущая система покрывает потребности проекта.

> 📚 **Детальное сравнение:** См. [Сравнение систем логирования](../architecture/LOGGING_COMPARISON.md) для подробного анализа LogRocket, self-hosted Sentry и текущей системы.

---

## 📦 Установка

```bash
pnpm add @gafus/logger
```

## 🔧 Использование

### Специализированные логгеры

```typescript
import {
  createWebLogger,
  createTrainerPanelLogger,
  createWorkerLogger,
  createTelegramBotLogger,
} from "@gafus/logger";

// Для веб-приложения
const logger = createWebLogger("profile-page");
logger.info("Страница загружена", { userId: "123" });

// Для worker-ов
const workerLogger = createWorkerLogger("notifications");
workerLogger.error("Не удалось отправить push", error);
```

### Доступные фабрики

| Фабрика                    | Приложение    |
| -------------------------- | ------------- |
| `createWebLogger`          | web           |
| `createTrainerPanelLogger` | trainer-panel |
| `createAdminPanelLogger`   | admin-panel   |
| `createWorkerLogger`       | worker        |
| `createTelegramBotLogger`  | legacy (приложение telegram-bot удалено) |
| `createBullBoardLogger`    | bull-board    |
| `createSilentLogger`       | — (только fatal) |

Клиентские ошибки — в Tracer через ErrorBoundary и `reportClientError`.

### Уровни логирования

```typescript
logger.debug("Детальная информация для отладки");
logger.info("Общая информация о работе");
logger.warn("Предупреждение о потенциальной проблеме");
logger.error("Ошибка", errorObject);
logger.fatal("Критическая ошибка");
```

### Уровни по умолчанию

| Окружение   | Уровень |
| ----------- | ------- |
| development | debug   |
| test        | warn    |
| production  | warn    |

### Отправка ошибок напрямую

Для отправки ошибок используйте `logger.error()` напрямую (синхронный вызов):

```typescript
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("my-context");

// Серверные ошибки — лог в Pino и отправка в Tracer
logger.error(error.message || "Unknown error", error, {
  userId: user.id,
  operation: "checkout",
  additionalContext: { action: "checkout" },
});
```

## 🏗️ Архитектура

```
@gafus/logger
├── UnifiedLogger   # Основной класс (обёртка над Pino)
├── LoggerFactory   # Фабрика с кэшированием
└── transports/    # Pino transports (при необходимости)
```

### Поток данных

```
Приложение → Logger → Pino → stdout (docker logs)
logger.error/fatal с Error → Tracer (серверные ошибки)
```

Клиентские ошибки отправляются в Tracer через ErrorBoundary и `reportClientError` из `@gafus/error-handling`.

## ⚙️ Конфигурация

### Переменные окружения

```env
# Отключение логирования
DISABLE_LOGGING=true          # Полное отключение
DISABLE_CONSOLE_LOGGING=true  # Только консоль
```

### LoggerConfig

```typescript
interface LoggerConfig {
  appName: string;
  environment: "development" | "production" | "test";
  level: "debug" | "info" | "warn" | "error" | "fatal";
  enableConsole?: boolean;
  context?: string;
}
```

## 📊 Формат логов

### В консоли (development)

```
[2024-01-15 10:30:45] INFO  [web:profile-page] Страница загружена {"userId":"123"}
```

### В production (stdout, Pino JSON)

Логи в формате JSON с полями app, context, level, msg. Просмотр: `docker logs <container>`.

## 🔧 Структура пакета

```
packages/logger/
├── src/
│   ├── UnifiedLogger.ts   # Основной логгер
│   ├── LoggerFactory.ts   # Фабрика
│   ├── logger-types.ts    # Типы
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 📦 Зависимости

- `pino` — высокопроизводительный логгер
- `@gafus/types` — общие типы

---

_Пакет обеспечивает единое логирование для всей экосистемы GAFUS без зависимости от внешних SaaS._
