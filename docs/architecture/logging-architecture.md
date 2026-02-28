# Архитектура логирования GAFUS

## Обзор

```
Приложение (Pino) → stdout → Vector → Seq (все логи)
Клиентские ошибки → Tracer (ErrorBoundary + reportClientError)
```

## Компоненты

### 1. Серверные логи (Pino → Seq)

- `@gafus/logger` на базе Pino
- Логи в stdout в формате JSON
- Vector собирает из Docker контейнеров, парсит Pino JSON, отправляет в Seq

### 2. Клиентские ошибки (Tracer)

- `TracerProvider` (apps/web, apps/trainer-panel) инициализирует `@apptracer/sdk`
- ErrorBoundary → `reportClientError` → Tracer
- См. [Tracer](../monitoring/tracer.md)

### 3. Vector

- Собирает логи из Docker контейнеров
- Парсит Docker JSON и Pino JSON
- Отправляет в Seq в формате CLEF

### 4. Seq

- Хранит все серверные логи
- Доступ: `http://localhost:5341` (dev), `https://monitor.gafus.ru` (prod)

## Локальная разработка

Vector работает только с Docker. При локальном запуске логи смотрятся в консоли; Seq UI — `http://localhost:5341`.

## Production

Все приложения в Docker → Vector → Seq. Клиентские ошибки — в Tracer.

## См. также

- [Tracer (клиентские ошибки)](../monitoring/tracer.md)
- [Logger](../packages/logger.md)
- [Проверка Seq](../troubleshooting/CHECK_SEQ.md)
