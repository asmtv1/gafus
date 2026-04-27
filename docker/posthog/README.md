# Локальный / VPS PostHog (официальный hobby)

Минимальный `docker-compose` из корня репозитория **не поддерживается** образом `posthog/posthog:latest` (нужны Kafka, Zookeeper, конфиг ClickHouse и т.д.). Best practice — **тот же путь, что в официальной документации**: hobby-стек из репозитория PostHog.

## Требования

- Docker + Docker Compose v2
- **Публичное DNS-имя** (`POSTHOG_DOMAIN`), указывающее на машину с Docker
- Открытые **80 и 443** (Let's Encrypt для Caddy)
- Рекомендуется **≥ 8 GB RAM** (лучше 16 GB, как в доке PostHog)

## Запуск

Из корня монорепо:

```bash
export POSTHOG_DOMAIN=posthog.yourdomain.com
bash docker/posthog/up.sh
```

Переменные (опционально):

- `POSTHOG_APP_TAG` — тег образа Docker Hub (по умолчанию `latest`)
- `POSTHOG_SECRET`, `ENCRYPTION_SALT_KEYS` — если не задать, сгенерируются
- `TLS_BLOCK` — для staging LE (редко нужно)

Состояние клона и compose лежит в `docker/posthog/runtime/` (в `.gitignore`).

## Остановка и полная очистка данных

```bash
bash docker/posthog/down.sh
```

## Разработка на Mac без публичного домена

Официальный hobby **рассчитан на VPS + домен**. На ноутбуке без DNS/TLS проще:

- использовать **PostHog Cloud** (EU/US) для проверки `@gafus/analytics`, или
- non-hobby сценарий из [handbook PostHog](https://posthog.com/handbook/engineering/developing-locally) (hogli + docker dev — для контрибьюторов PostHog).

## Связка с GAFUS

В `apps/web/.env.local` и mobile:

- `NEXT_PUBLIC_POSTHOG_HOST=https://<POSTHOG_DOMAIN>` (или путь к API, как настроит Caddy)
- `NEXT_PUBLIC_POSTHOG_KEY=<project api key из UI PostHog>`
