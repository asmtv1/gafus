# Просмотр логов Docker контейнеров

## Обзор

Логи приложений GAFUS пишутся в stdout (Pino JSON). Просмотр — через `docker logs`.

## Просмотр логов

```bash
# Логи web-приложения
docker logs gafus-web

# Логи в реальном времени
docker logs -f gafus-web

# Последние N строк
docker logs --tail 100 gafus-web

# Логи за период
docker logs --since 1h gafus-web
```

## Контейнеры

| Контейнер | Приложение |
|-----------|------------|
| gafus-web | Web (Next.js) |
| gafus-trainer-panel | Trainer Panel |
| gafus-admin-panel | Admin Panel |
| gafus-worker | BullMQ Worker |
| gafus-api | API |
| gafus-bull-board | Bull Board |

## Ошибки

Серверные ошибки (`logger.error()`, `logger.fatal()` с Error) автоматически отправляются в Tracer (apptracer.ru).
