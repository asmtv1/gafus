# Архитектура логирования GAFUS

## Обзор

Проект использует гибридную архитектуру логирования для микросервисов:

```
Приложение → stdout/stderr → Vector → Seq (все логи)
Приложение (Pino) → Error Dashboard API → PostgreSQL (только ошибки)
Error Dashboard → Читает из обоих источников
```

## Компоненты

### 1. Приложения (Logger)

- Используют `@gafus/logger` на базе Pino
- Логи выводятся в stdout в формате JSON
- Структурированные логи с метаданными (app, context, level)

### 2. Vector

- Собирает логи из Docker контейнеров (`/var/lib/docker/containers`)
- Парсит Docker JSON формат и Pino JSON логи
- Извлекает метки: app, level, context, environment
- Отправляет в Seq в формате CLEF через нативный Seq sink

### 3. Seq

- Хранит все логи контейнеров с индексацией по свойствам
- Доступен по адресу: `http://localhost:5341` (dev) или `http://seq:5341` (Docker)
- Встроенный веб-интерфейс для просмотра и поиска логов
- Автоматическая очистка старых логов (retention policy)

### 4. PostgreSQL

- Хранит только ошибки (error/fatal) для управления статусами
- Используется Error Dashboard для отображения и управления ошибками
- Структурированные данные с возможностью resolve/unresolve

### 5. Error Dashboard

- Читает логи из Seq через REST API
- Синхронизирует ошибки в PostgreSQL
- Фильтрует по меткам (app, level, tags)
- Отображает ошибки и push-логи

## Локальная разработка

Vector собирает логи только из Docker контейнеров. Если приложение запущено локально, логи не попадут в Seq. Варианты: запуск в Docker, просмотр логов в консоли, прямой доступ к Seq UI (`http://localhost:5341`).

## Production

В production все приложения работают в Docker: Vector собирает логи из всех контейнеров, Seq хранит логи централизованно, PostgreSQL — только ошибки для управления, Error Dashboard читает оба источника.

## Свойства (Properties)

Vector извлекает из Pino JSON: `App`, `Level`, `Context`, `ContainerId`, `ContainerName`, `Stream`, `tag_container_logs`.

## Запросы к Seq

SQL-подобный синтаксис: `select * from stream where @Properties['App'] = 'worker'`, фильтры по Level, ContainerName и т.д. Примеры REST API — в [troubleshooting/CHECK_SEQ.md](../troubleshooting/CHECK_SEQ.md).

## Лучшие практики

- Логи идут в stdout → Vector → Seq; ошибки синхронизируются в PostgreSQL
- Не отправлять логи напрямую в Seq из приложения; не хранить все логи в PostgreSQL

## См. также

- [Error Dashboard](../apps/error-dashboard.md)
- [Logger пакет](../packages/logger.md)
- [Проверка Seq](../troubleshooting/CHECK_SEQ.md)
