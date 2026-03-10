# Промпт: Упрощение мониторинга GAFUS

> **Статус:** Выполнено (2026). См. `.cursor/agentplan/monitoring-simplify-yandex.md`.

```
@workflow

Задача: Переработать мониторинг GAFUS (Grafana Alloy → Yandex) под минимальный достаточный набор метрик.

## Цели мониторинга

1. **Доступность сервисов (всё на одной странице):**
   - Web (web:3000/api/health)
   - API (api:3001/health) — сейчас отсутствует в blackbox
   - Trainer Panel (trainer-panel:3001/api/health)
   - Admin Panel (admin-panel:3006/api/health)
   - Worker — жив ли контейнер (нужен /health endpoint, см. ниже)
   - БД — pg_up (postgres-exporter)
   - Bull Board (bull-board:3002/health)

2. **Ресурсы сервера (тренды за неделю):**
   - CPU, RAM, диск (свободное место)
   - Дашборд для просмотра нагрузок и просадок

3. **Очередь пушей:**
   - Метрики BullMQ — проверка, что пуши обрабатываются

## Изменения

### 1. Worker — добавить HTTP /health
Worker (packages/worker) — Node.js процесс без HTTP без HTTP. Нужно:
- Добавить минимальный HTTP-сервер (порт из env, напр. WORKER_HEALTH_PORT=3003)
- GET /health → 200 OK
- Запускать сервер в packages/worker/src/index.ts параллельно с воркерами
- В docker-compose.prod.yml: expose порт, healthcheck на localhost:3003/health
- В blackbox: http://worker:3003/health, service="worker"

### 2. config.alloy
- Добавить в services_health: api (http://api:3001/health), worker (http://worker:3003/health)
- Удалить scrape redis-exporter
- (Опционально) metric_relabel_configs в node_exporter — отбросить node_disk_io_*, node_netstat_*, node_sockstat_*; оставить CPU, memory, load, filesystem
- postgres-exporter, bull-board — оставить

### 3. Дашборды Yandex — один обзорный дашборд
Создать/переработать дашборд, чтобы **всё было на одной странице**: зашёл и сразу видно что всё up.

Объединить в один дашборд:
- Статус сервисов (probe_success): web, api, trainer-panel, admin-panel, worker, bull-board
- pg_up — БД жива
- CPU, RAM, диск — ключевые метрики за неделю (компактно)
- Очередь пушей — bull_* метрики для push-очереди

Исходники в ci-cd/docker/grafana/dashboards/ — обновить overview.json (или создать новый consolidated). После изменений запустить scripts/import-dashboards-to-yandex.sh для загрузки в Yandex.

### 4. Зависимости Alloy
В docker-compose.prod.yml: grafana-alloy depends_on добавить worker (если blackbox будет проверять worker).

## Файлы
- packages/worker/src/index.ts (добавить HTTP /health)
- packages/worker/package.json (если нужна зависимость для http)
- ci-cd/docker/docker-compose.prod.yml (worker ports, healthcheck, alloy depends_on)
- ci-cd/docker/prometheus/config.alloy
- ci-cd/docker/grafana/dashboards/overview.json (или новый consolidated)

После изменений: pnpm run build, проверить работоспособность.
```
