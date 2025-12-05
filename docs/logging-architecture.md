# Архитектура логирования GAFUS

## Обзор

Проект использует стандартную архитектуру логирования для микросервисов:

```
Приложение → stdout/stderr → Promtail → Loki → Grafana/Error Dashboard
```

## Компоненты

### 1. Приложения (Logger)
- Используют `@gafus/logger` на базе Pino
- Логи выводятся в stdout в формате JSON
- Структурированные логи с метаданными (app, context, level)

### 2. Promtail
- Собирает логи из Docker контейнеров (`/var/lib/docker/containers`)
- Парсит Pino JSON формат
- Извлекает метки: app, level, context, environment
- Отправляет в Loki

### 3. Loki
- Хранит логи с индексацией по меткам
- Доступен по адресу: `http://localhost:3100` (dev) или `http://loki:3100` (Docker)

### 4. Error Dashboard
- Читает логи из Loki через Query API
- Фильтрует по меткам (app, level, tags)
- Отображает ошибки и push-логи

## Локальная разработка

### Проблема
Promtail собирает логи только из Docker контейнеров. Если приложение запущено локально (не в Docker), логи не попадут в Loki.

### Решение 1: Запуск в Docker
```bash
# Запустить все сервисы в Docker
docker-compose -f ci-cd/docker/docker-compose.local.yml up -d
```

### Решение 2: Просмотр логов в консоли
Логи выводятся в stdout и видны в терминале. Для локальной разработки этого достаточно.

### Решение 3: Временная прямая отправка в Loki (не рекомендуется)
Если нужно тестировать Error Dashboard локально:

1. Включить `enableErrorDashboard: true` в `packages/logger/src/LoggerFactory.ts`
2. Раскомментировать `void this.sendToLoki(logEntry)` в `ErrorDashboardTransport.ts`
3. Пересобрать: `cd packages/logger && pnpm build`
4. Запустить тестовый скрипт

**Важно:** После тестирования вернуть изменения, чтобы избежать дублирования в production.

## Production

В production все приложения работают в Docker:
- Promtail собирает логи из всех контейнеров
- Loki хранит логи централизованно
- Error Dashboard и Grafana читают логи из Loki

## Метки (Labels)

Promtail извлекает следующие метки из Pino JSON:

- `app` - название приложения (web, worker, trainer-panel, telegram-bot)
- `level` - уровень лога (debug, info, warn, error, fatal)
- `context` - контекст логгера (например, push-notifications)
- `environment` - окружение (development, production)
- `tag_push_notifications` - тег для push-логов (true/false)
- `tag_error_report` - тег для ошибок (true/false)

## Запросы к Loki

### Примеры запросов

```bash
# Все логи приложения worker
curl -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="worker"}' \
  --data-urlencode 'limit=100'

# Ошибки из web приложения
curl -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="web",level="error"}' \
  --data-urlencode 'limit=50'

# Push-логи
curl -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="worker",tag_push_notifications="true"}' \
  --data-urlencode 'limit=100'
```

## Лучшие практики

✅ **Правильно:**
- Логи идут в stdout → Promtail → Loki
- Централизованный сбор логов
- Не нагружает приложения
- Работает даже если приложение упало

❌ **Неправильно:**
- Прямая отправка в Loki из приложения (Push API)
- Дублирование логов
- Нагрузка на приложение
- Потеря логов при сбое сети

## Troubleshooting

### Логи не появляются в Error Dashboard

1. Проверьте, что Loki запущен:
   ```bash
   curl http://localhost:3100/ready
   ```

2. Проверьте, что Promtail запущен:
   ```bash
   docker ps | grep promtail
   ```

3. Проверьте логи Promtail:
   ```bash
   docker logs gafus-promtail-local --tail 50
   ```

4. Проверьте, что логи есть в Loki:
   ```bash
   curl -G "http://localhost:3100/loki/api/v1/query_range" \
     --data-urlencode 'query={app="web"}' \
     --data-urlencode 'limit=10'
   ```

### Приложение запущено локально (не в Docker)

Promtail не может собрать логи из локального процесса. Используйте один из вариантов:
- Запустите приложение в Docker
- Смотрите логи в консоли
- Временно включите прямую отправку в Loki (см. выше)

## См. также

- [Error Dashboard документация](apps/error-dashboard.md)
- [Logger пакет](../packages/logger/README.md)
- [Promtail конфигурация](../ci-cd/docker/promtail/promtail.yml)












