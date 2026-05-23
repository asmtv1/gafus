# Обзор проекта GAFUS

GAFUS - система обучения владельцев собак и кошек через курсы, ежедневные задания, экзамены, дневник прогресса, консультации, профилактику питомца, уведомления и платежи.

## Текущий состав репозитория

Это монорепозиторий на `pnpm workspaces` и `Turbo`.

```text
gafus/
├── apps/
│   ├── web/            # пользовательский Next.js/PWA
│   ├── mobile/         # Expo Router iOS/Android
│   ├── trainer-panel/  # контент, курсы, экзамены, консультации
│   ├── admin-panel/    # пользователи, покупки, флаги, рассылки
│   ├── api/            # Hono REST API v1
│   └── bull-board/     # мониторинг BullMQ
├── packages/           # общие библиотеки и доменная логика
├── ci-cd/              # Docker/compose/monitoring
├── docs/               # проектная документация
└── scripts/            # repo-level утилиты
```

`apps/telegram-bot` в проекте отсутствует. Telegram-зависимые password/phone flows в `@gafus/auth` считаются legacy и могут возвращать временную недоступность.

## Основные приложения

| Приложение           | Назначение                                                                          | Основные технологии                                 |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web`           | Пользовательский web/PWA: курсы, питомцы, статьи, консультации, подписка, профиль   | Next.js 15, React 19, NextAuth, MUI, Server Actions |
| `apps/mobile`        | Нативный клиент для iOS/Android                                                     | Expo 54, Expo Router 6, React Native 0.81           |
| `apps/trainer-panel` | Управление курсами, шагами, статьями, экзаменами, консультациями, видео             | Next.js 15, MUI, `@gafus/core`                      |
| `apps/admin-panel`   | Администрирование пользователей, покупок, подписок, рассылок, флагов, re-engagement | Next.js 15, MUI, `@gafus/core`                      |
| `apps/api`           | REST API v1 для mobile и внешних клиентов                                           | Hono, JWT, Zod, Redis rate limit                    |
| `apps/bull-board`    | UI и `/metrics` для BullMQ                                                          | Express, Bull Board                                 |

## Домены продукта

- Auth: email/password, VK ID, JWT для API, NextAuth для web-панелей.
- Курсы: обычные курсы, guide-course, daily course, избранное, отзывы.
- Тренировки: дни, шаги, таймеры, теория/практика, дневник, offline download.
- Экзамены: тесты, письменные ответы, видео, проверка тренером.
- Питомцы: профили, фото, документы, журнал профилактики.
- Консультации: каталог кинологов, слоты, бронирование, статусы, reminders/SLA.
- Подписки и платежи: ЮKassa, Apple IAP, app subscription.
- Уведомления: Web Push, Expo Push, RuStore Push, training/reminder/reengagement queues.
- Контент: статьи, видео тренера, FAQ/notes.
- Наблюдаемость: Pino logs, Tracer, Prometheus/Grafana configs.

## Главный архитектурный принцип

`@gafus/core` - центр бизнес-логики. Приложения должны быть тонкими слоями:

1. Проверить auth/role.
2. Валидировать вход через Zod или локальную schema.
3. Вызвать сервис `@gafus/core` или профильный shared package.
4. Вернуть UI/JSON и выполнить `revalidatePath`/`revalidateTag`, если это Next.js мутация.

Прямой Prisma в приложениях допустим только в явно обоснованных инфраструктурных местах, например health checks или низкоуровневые route handlers, уже оформленные в документации конкретного приложения.

## Данные и инфраструктура

- PostgreSQL через Prisma (`@gafus/prisma`).
- Redis для BullMQ и rate limiting.
- Object Storage/S3-compatible CDN через `@gafus/cdn-upload`.
- BullMQ queues в `@gafus/queues`, обработчики в `@gafus/worker`.
- Docker compose production/local конфиги в `ci-cd/docker`.
- Prometheus/Grafana/blackbox configs в `ci-cd/docker`.

## Роли

В коде используются роли Prisma/NextAuth уровня пользователя:

- `USER` - обычный пользователь.
- `TRAINER` - тренер, доступ к trainer-panel и части консультаций.
- `ADMIN` - полный административный доступ.
- `MODERATOR` - ограниченный административный/модераторский доступ.

## Что читать дальше

- [Архитектура](../architecture/README.md)
- [Технологический стек](../tech-stack/README.md)
- [Поток данных](../architecture/data-flow.md)
- [API service](../apps/api.md)
- [Настройка окружения](../development/setup.md)
