# Простая инструкция: Prometheus локально

## Что вы уже сделали

1. ✅ Запустили все приложения: `pnpm run start:all`
2. ✅ Запустили Prometheus: `docker-compose -f docker-compose.local.yml up -d`

## Что дальше

### Шаг 1: Проверьте, что Prometheus работает

Откройте в браузере:
```
http://localhost:9090
```

Если видите интерфейс Prometheus - всё работает!

### Шаг 2: Настройте Error Dashboard

Создайте файл `apps/error-dashboard/.env.local`:

```bash
PROMETHEUS_URL=http://localhost:9090
```

### Шаг 3: Перезапустите Error Dashboard

Остановите Error Dashboard (Ctrl+C) и запустите снова:

```bash
# Из корня проекта
cd apps/error-dashboard
PROMETHEUS_URL=http://localhost:9090 pnpm dev
```

Или если запускаете через `pnpm run start:all`, добавьте переменную в `.env` файл в корне проекта.

### Шаг 4: Проверьте метрики

Откройте в браузере:
```
http://localhost:3005/system-status
```

Должны увидеть метрики (память, CPU, uptime) из Prometheus.

## Быстрая проверка

1. **Prometheus UI**: http://localhost:9090 → введите `node_memory_MemTotal_bytes` → Execute
2. **Error Dashboard**: http://localhost:3005/system-status → должны быть метрики
3. **API**: http://localhost:3005/api/system-status → JSON с метриками

## Если не работает

```bash
# Проверьте, что Prometheus запущен
docker ps | grep prometheus

# Проверьте логи
docker logs gafus-prometheus-local

# Проверьте, что node_exporter работает
curl http://localhost:9100/metrics | head -5
```

Всё! Теперь метрики собираются через Prometheus.

