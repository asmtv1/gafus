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
- Отправляет в Seq в формате CLEF (Compact Log Event Format) через нативный Seq sink

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

### Проблема

Vector собирает логи только из Docker контейнеров. Если приложение запущено локально (не в Docker), логи не попадут в Seq.

### Решение 1: Запуск в Docker

```bash
# Запустить все сервисы в Docker
docker-compose -f ci-cd/docker/docker-compose.local.yml up -d seq vector
```

### Решение 2: Просмотр логов в консоли

Логи выводятся в stdout и видны в терминале. Для локальной разработки этого достаточно.

### Решение 3: Прямой доступ к Seq UI

Если нужно тестировать Error Dashboard локально:

1. Запустить Seq: `docker-compose -f ci-cd/docker/docker-compose.local.yml up -d seq`
2. Открыть Seq UI: `http://localhost:5341`
3. Просматривать логи через веб-интерфейс Seq

## Production

В production все приложения работают в Docker:

- Vector собирает логи из всех контейнеров
- Seq хранит все логи централизованно
- PostgreSQL хранит только ошибки для управления
- Error Dashboard читает логи из Seq и ошибки из PostgreSQL

## Свойства (Properties)

Vector извлекает следующие свойства из Pino JSON и отправляет в Seq:

- `App` - название приложения (web, worker, trainer-panel, telegram-bot)
- `Level` - уровень лога (debug, info, warn, error, fatal)
- `Context` - контекст логгера (например, push-notifications)
- `ContainerId` - ID контейнера Docker
- `ContainerName` - имя контейнера
- `Stream` - поток (stdout/stderr)
- `tag_container_logs` - тег для логов контейнеров (true/false)

## Запросы к Seq

### Примеры запросов через REST API

```bash
# Все логи приложения worker
curl -G "http://localhost:5341/api/events" \
  --data-urlencode 'q=select * from stream where @Properties['\''App'\''] = '\''worker'\''' \
  --data-urlencode 'count=100'

# Ошибки из web приложения
curl -G "http://localhost:5341/api/events" \
  --data-urlencode 'q=select * from stream where @Properties['\''App'\''] = '\''web'\'' and Level = '\''Error'\''' \
  --data-urlencode 'count=50'

# Логи контейнеров
curl -G "http://localhost:5341/api/events" \
  --data-urlencode 'q=select * from stream where @Properties['\''tag_container_logs'\''] = '\''true'\''' \
  --data-urlencode 'count=100'
```

### SQL-подобный синтаксис Seq

Seq использует SQL-подобный синтаксис для запросов:

```sql
-- Все логи приложения
select * from stream where @Properties['App'] = 'worker'

-- Ошибки и fatal
select * from stream where Level in ('Error', 'Fatal')

-- Логи контейнеров с фильтром по имени
select * from stream
where @Properties['tag_container_logs'] = 'true'
  and @Properties['ContainerName'] like '%web%'
```

## Лучшие практики

✅ **Правильно:**

- Логи идут в stdout → Vector → Seq
- Ошибки синхронизируются в PostgreSQL для управления
- Централизованный сбор логов
- Не нагружает приложения
- Работает даже если приложение упало

❌ **Неправильно:**

- Прямая отправка в Seq из приложения (Push API)
- Хранение всех логов в PostgreSQL (быстро засорит БД)
- Дублирование логов
- Нагрузка на приложение
- Потеря логов при сбое сети

## Troubleshooting

### Логи не появляются в Error Dashboard

1. Проверьте, что Seq запущен:

   ```bash
   curl http://localhost:5341/api
   ```

2. Проверьте, что Vector запущен:

   ```bash
   docker ps | grep vector
   ```

3. Проверьте логи Vector:

   ```bash
   docker logs gafus-vector-local --tail 50
   ```

4. Проверьте, что логи есть в Seq:

   ```bash
   curl -G "http://localhost:5341/api/events" \
     --data-urlencode 'q=select * from stream where @Properties['\''App'\''] = '\''web'\''' \
     --data-urlencode 'count=10'
   ```

5. Откройте Seq UI в браузере:
   ```bash
   open http://localhost:5341
   ```

### Приложение запущено локально (не в Docker)

Vector не может собрать логи из локального процесса. Используйте один из вариантов:

- Запустите приложение в Docker
- Смотрите логи в консоли
- Используйте Seq UI для просмотра логов контейнеров

## Retention Policy

Seq автоматически удаляет старые логи согласно настройкам retention policy:

- По умолчанию: 30 дней
- Настраивается через Seq UI: Settings → Retention
- Можно настроить по размеру или времени

## См. также

- [Error Dashboard документация](apps/error-dashboard.md)
- [Logger пакет](../packages/logger/README.md)
- [Vector конфигурация для Seq](../ci-cd/docker/vector/vector.toml)
