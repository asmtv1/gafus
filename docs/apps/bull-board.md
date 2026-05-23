# Bull Board (@gafus/bull-board)

`apps/bull-board` - небольшой Express-сервис для просмотра BullMQ очередей и экспорта Prometheus metrics.

## Код

```text
apps/bull-board/
├── bull-board.ts
├── package.json
└── tsconfig.json
```

Entry point: `bull-board.ts`.

Сервис загружает `.env` из корня монорепы до импорта `@gafus/queues`, потому что очереди создаются при импорте и сразу читают Redis env.

## Routes

- `GET /admin/queues` - Bull Board UI.
- `GET /health` - health check.
- `GET /metrics` - Prometheus metrics по подключённым очередям.

## Очереди в UI

Сейчас Bull Board подключает:

- `pushQueue`
- `examCleanupQueue`
- `reengagementQueue`

В `@gafus/queues` есть и другие очереди (video transcoding, consultation, consent cleanup, pet prevention reminders), но они не выведены в этот UI. Если добавляете очередь в `@gafus/queues` и хотите видеть её в Bull Board, нужно явно добавить `new BullMQAdapter(queue)` в `apps/bull-board/bull-board.ts` и расширить `/metrics`.

## Порты

- Локальный скрипт `pnpm --filter @gafus/bull-board dev` задаёт `PORT=3004`.
- В Dockerfile сервис слушает `3002`.
- В production compose порт наружу не публикуется; доступ идёт через Nginx/internal network.

## Auth

В текущем `bull-board.ts` нет Basic Auth middleware. Доступ должен ограничиваться на уровне Nginx/VPN/network policy. Не документируйте `BULL_BOARD_USERNAME`/`BULL_BOARD_PASSWORD` как рабочую защиту, пока такой middleware не появится в коде.

## Env

```env
PORT=3004
REDIS_URL=redis://localhost:6379
TRACER_APP_TOKEN=
TRACER_SERVER_ENABLED=
```

## Команды

```bash
pnpm --filter @gafus/bull-board dev
pnpm --filter @gafus/bull-board build
pnpm --filter @gafus/bull-board start
pnpm --filter @gafus/bull-board typecheck
```

## Docker

Dockerfile: `ci-cd/docker/Dockerfile-bull-board-optimized`.

Production compose service: `ci-cd/docker/docker-compose.prod.yml` -> `bull-board`.
