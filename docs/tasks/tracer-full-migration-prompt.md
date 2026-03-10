# Промпт: полный переход на Tracer

## Контекст

> **Статус:** Миграция выполнена (март 2026). Seq и Vector удалены.

Перевести весь мониторинг ошибок на Tracer. Полные логи (Seq/Vector) удалить — при необходимости смотреть в контейнере через `docker logs`.

**Один токен (Gafus-Web)** — используется и для клиента, и для сервера. Разделение по полям:
- `errorEventType: "server"` | `"client"`
- `component` / `issueKey` — приложение: `"web"`, `"worker"`, `"api"` и т.п.
- `context` — модуль: `"auth"`, `"payments"`, `"course-service"` и т.д.

В Tracer можно фильтровать по этим полям; по стекам Node.js и браузера события и так различаются.

## Задачи

### 1. Серверные ошибки → Tracer

Добавить отправку серверных ошибок в Tracer при вызове `logger.error()` и `logger.fatal()`.

**Где:** `packages/logger`

**Реализация:**
- Создать `packages/logger/src/tracerServer.ts` — функция `reportServerError(error, options)`.
- Формат payload — как в mobile `reportClientError`, но:
  - `errorEventType: "server"` (у клиента "client").
  - `component` или `issueKey` — имя приложения: `"web"`, `"worker"`, `"trainer-panel"`, `"api"` и т.п. (из `LoggerConfig.appName`).
  - `keys` или `properties` — `context` (модуль/экшен) из `LoggerConfig.context`, плюс `message` если есть.
- API: `POST https://sdk-api.apptracer.ru/api/crash/uploadBatch` с `crashToken`, `compressType=NONE`.
- Токен: `TRACER_APP_TOKEN` или `NEXT_PUBLIC_TRACER_APP_TOKEN` (fallback для Next.js приложений).
- Включение: если токен задан и (`NODE_ENV=production` или `TRACER_SERVER_ENABLED=true`).
- Fire-and-forget, не блокировать основной поток. Игнорировать ошибки отправки.
- `deviceId`: `os.hostname()` или `"server"`. `sessionUuid`: `crypto.randomUUID()` при первом вызове или статичный `"server-session"`.

**Интеграция в UnifiedLogger:**
- В методах `error()` и `fatal()` после записи в Pino вызвать `reportServerError()`, если передан объект `Error`.
- Передать `appName` как component, `context` как часть keys.

### 2. Переменные окружения

Добавить в docker-compose и документацию:
- `TRACER_APP_TOKEN` — для серверных приложений (worker, api, etc.). Можно использовать тот же токен, что и `NEXT_PUBLIC_TRACER_APP_TOKEN` (Gafus-Web).
- `TRACER_SERVER_ENABLED` — `"true"` для отправки в dev (опционально).

Web и trainer-panel уже получают `NEXT_PUBLIC_TRACER_APP_TOKEN` — его же использовать для серверной части этих приложений.

### 3. Удаление Seq и Vector

**Что удалить/отключить:**
- `ci-cd/docker/docker-compose.prod.yml`: сервисы `seq` и `vector` (строки ~399–432), volumes `seq_data`, `vector_data`, зависимости vector→seq. Убрать certbot домены `monitor.gafus.ru`, `logs.gafus.ru`, `seq.gafus.ru` (строка ~302).
- `ci-cd/docker/docker-compose.local.yml`: сервисы `seq` и `vector` (строки ~84–119).
- `ci-cd/nginx/conf.d/gafus.ru.conf`: блок `server_name monitor.gafus.ru` (строки ~237, 251), блок `logs.gafus.ru seq.gafus.ru` (строки ~524, 538).
- `ci-cd/docker/vector/` — удалить папку или оставить, но убрать монтирование/зависимости в compose.
- `ci-cd/docker/seq/` — удалить папку с дашбордами.
- `packages/logger` — убрать из комментариев "Vector", "Seq". Оставить: "Логи → stdout (docker logs). Ошибки → Tracer."

**Что сохранить:**
- Pino пишет в stdout. Логи — в `docker logs <container>`.
- Grafana/Prometheus — мигрированы на Yandex Monitoring (2026).

### 4. Документация

**Обновить:**
- `docs/monitoring/README.md` — убрать Seq, добавить раздел про серверные ошибки в Tracer.
- `docs/monitoring/tracer.md` — добавить раздел "Серверные ошибки", переменные `TRACER_APP_TOKEN`, `TRACER_SERVER_ENABLED`.
- `docs/architecture/logging-architecture.md` — схема: Pino → stdout (docker logs), ошибки → Tracer.
- `docs/architecture/LOGGER_VS_LOKI.md`, `docs/architecture/LOGGING_COMPARISON.md`, `docs/architecture/overview.md`, `docs/architecture/PACKAGE_STRUCTURE_ANALYSIS.md` — убрать/заменить Seq.
- `docs/deployment/container-logs.md`, `docs/deployment/docker.md` — убрать Vector/Seq, указать docker logs.
- `docs/packages/logger.md`, `docs/packages/error-handling.md` — Seq → Tracer.
- `docs/tech-stack/README.md`, `docs/overview/README.md`, `docs/README.md` — убрать ссылки на Seq.
- `docs/monitoring/tracer-audit-prompt.md`, `docs/features/auth-local-vs-prod-audit-prompt.md`, `docs/troubleshooting/paid-course-not-opening.md`, `docs/apps/admin-panel.md`, `docs/testing/REENGAGEMENT_TESTING.md`, `docs/architecture/timer-rerender-analysis.md` — заменить Seq на Tracer/docker logs.

**Удалить или пометить устаревшими:**
- `docs/troubleshooting/CHECK_SEQ.md`
- `docs/deployment/seq-dashboards.md`
- `scripts/import-seq-dashboards.sh`, `scripts/setup-seq-dashboards.js`

### 5. Проверка

- Собрать проект: `pnpm run build`.
- Убедиться, что `logger.error("test", new Error("Test"))` в dev (с `TRACER_SERVER_ENABLED=true`) отправляет событие в Tracer с `errorEventType: "server"`, `component: "web"` (или соответствующий appName).

## Итог

- Клиентские ошибки → Tracer (как сейчас).
- Серверные ошибки → Tracer с `errorEventType: "server"`, `component` = appName, `context` в keys.
- Полные логи → только stdout, просмотр через `docker logs`.
- Seq и Vector удалены из стека.
