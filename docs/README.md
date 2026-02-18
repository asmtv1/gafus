# Документация проекта GAFUS

Система управления фитнес-тренировками для домашних животных (монорепо: Next.js 15, TypeScript, Prisma, BullMQ).

## Содержание

### Обзор и архитектура

- [Обзор проекта](./overview/README.md)
- [Архитектура](./architecture/README.md)
- [Технологический стек](./tech-stack/README.md)

### Пакеты (packages)

- [@gafus/auth](./packages/auth.md) — аутентификация и авторизация
- [@gafus/prisma](./packages/prisma.md) — БД и ORM
- [@gafus/types](./packages/types.md) — общие типы TypeScript
- [@gafus/logger](./packages/logger.md) — логирование
- [@gafus/error-handling](./packages/error-handling.md) — обработка ошибок
- [@gafus/csrf](./packages/csrf.md) — защита от CSRF
- [@gafus/cdn-upload](./packages/cdn-upload.md) — загрузка в CDN
- [@gafus/queues](./packages/queues.md) — очереди BullMQ
- [@gafus/react-query](./packages/react-query.md) — серверное состояние
- [@gafus/webpush](./packages/webpush.md) — push-уведомления
- [@gafus/worker](./packages/worker.md) — фоновые задачи
- [@gafus/ui-components](./packages/ui-components.md) — UI-компоненты
- [@gafus/metadata](./packages/metadata.md) — метаданные и SEO
- [@gafus/core](./packages/core.md) — бизнес-логика
- [Шаблоны шагов](./packages/step-templates.md)
- [Экзаменационные шаги](./packages/examination-steps.md)
- [Напоминания](./packages/reminders.md)
- [Статистика](./packages/statistics.md)

### Приложения (apps)

- [Web](./apps/web.md)
- [Mobile (React Native)](./apps/mobile-rn.md)
- [Trainer Panel](./apps/trainer-panel.md)
- [Admin Panel](./apps/admin-panel.md)
- [API (v1)](./apps/api.md)
- [Telegram Bot](./apps/telegram-bot.md)
- [Error Dashboard](./apps/error-dashboard.md)
- [Bull Board](./apps/bull-board.md)

### Разработка

- [Настройка окружения](./development/setup.md)

### Развёртывание

- [Конфигурация](./deployment/configuration.md)
- [Docker](./deployment/docker.md)
- [Логи контейнеров](./deployment/container-logs.md)
- [Дашборды Seq](./deployment/seq-dashboards.md)
- [Секреты API](./deployment/api-secrets.md)
- [Платные курсы и ЮKassa](./payments/yookassa.md)

### Мониторинг

- [Мониторинг](./monitoring/README.md)
- [Grafana](./monitoring/GRAFANA.md)
- [Prometheus-запросы](./monitoring/PROMETHEUS_QUERIES.md)

### API

- [API Routes v1](./api/v1-routes.md) — REST API для мобильного приложения и интеграций
- [Обзор API](./api/README.md)

### Тестирование

- [Очистка кэша PWA](./testing/CACHE_CLEAR_TEST.md)
- [Re-engagement](./testing/REENGAGEMENT_TESTING.md), [быстрый тест](./testing/QUICK_TEST_REENGAGEMENT.md)
- [Service Worker и офлайн-режим](./testing/SERVICE_WORKER_OFFLINE.md)
- [Тестовый пользователь](./testing/TEST_USER_CREATED.md)

### Решение проблем

- [Troubleshooting](./troubleshooting/README.md) — общие проблемы и решения
- [Server Actions 404/503](./troubleshooting/server-actions-404.md) — ошибки Server Actions
- [Инвалидация кеша между приложениями](./troubleshooting/cache-invalidation-cross-app.md)
- [Платный курс не открывается](./troubleshooting/paid-course-not-opening.md)
- [Проверка Seq](./troubleshooting/CHECK_SEQ.md)

### Юридическое и конфиденциальность

- [Оферта (клаузулы)](./legal/oferta-clauses.md)
- [Публичная оферта](./legal/public-offer-full.md)
- [Cookie consent и управление cookies](./features/cookie-consent.md) — баннер согласия, хранение в localStorage, GDPR

### Прочее

- [Презентация для тренеров](./PRESENTATION_FOR_TRAINERS.md)

---

## Быстрый старт

```bash
git clone <repository-url>
cd gafus
pnpm install
pnpm setup:env
pnpm dev
```

Поддержка: issue в репозитории, раздел [Troubleshooting](./troubleshooting/README.md).

_Обновлено: февраль 2026_
