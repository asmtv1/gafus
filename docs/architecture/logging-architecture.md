# Архитектура логирования GAFUS

## Обзор

```
Приложение (Pino) → stdout → docker logs (все логи)
logger.error() / logger.fatal() с Error → Tracer (серверные ошибки)
Клиентские ошибки → Tracer (ErrorBoundary + reportClientError)
```

## Компоненты

### 1. Серверные логи (Pino → stdout)

- `@gafus/logger` на базе Pino
- Логи в stdout в формате JSON
- Просмотр: `docker logs <container>`

### 2. Серверные ошибки (Tracer)

- `logger.error()` и `logger.fatal()` с объектом `Error` автоматически отправляют в Tracer
- `errorEventType: "server"`, `component` = appName (web, worker, api и т.д.)
- См. [Tracer](../monitoring/tracer.md)

### 3. Клиентские ошибки (Tracer)

- `TracerProvider` (apps/web, apps/trainer-panel) инициализирует `@apptracer/sdk`
- ErrorBoundary → `reportClientError` → Tracer
- См. [Tracer](../monitoring/tracer.md)

## Локальная разработка

Логи смотрятся в консоли. Для dev-тестирования Tracer: `TRACER_SERVER_ENABLED=true`.

## Production

Все приложения в Docker → логи в stdout. Ошибки (серверные и клиентские) — в Tracer.

## См. также

- [Tracer (ошибки)](../monitoring/tracer.md)
- [Logger](../packages/logger.md)
