# @gafus/reengagement

Пакет логики возврата неактивных пользователей.

## Назначение

`@gafus/reengagement` собирает данные пользователя, анализирует сегмент/состояние, выбирает сообщение и планирует кампанию через очереди/push.

## Код

- `src/user-data-collector.ts` - сбор данных активности.
- `src/analyzer.ts` - анализ и сегментация.
- `src/message-library.ts` - библиотека сообщений.
- `src/personalizer.ts` - персонализация текста.
- `src/campaign-manager.ts` - управление кампаниями.
- `src/scheduler.ts` - планирование.
- `src/metrics.ts` - метрики.
- `src/types.ts`, `src/reengagement-types.ts` - типы.

## Зависимости

- `@gafus/prisma` - данные.
- `@gafus/queues` - постановка задач.
- `@gafus/webpush` - отправка уведомлений.
- `@gafus/logger` - логирование.

## Команды

```bash
pnpm --filter @gafus/reengagement build
pnpm --filter @gafus/reengagement test
pnpm --filter @gafus/reengagement test:coverage
```

При изменении правил сегментации обновляйте тесты analyzer/message-library/personalizer и проверяйте worker, который запускает re-engagement задачи.
