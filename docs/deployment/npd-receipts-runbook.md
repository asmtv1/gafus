# НПД: production preparation and rollback

Документ описывает эксплуатацию подготовленного контура чеков НПД. Формулировки
публичных документов требуют проверки владельцем/юристом до публикации; наличие
переменных окружения не означает готовность к включению.

## Preconditions

- `NPD_PROCESSING_ENABLED=false` до успешной live-проверки: реальная оплата, чек в
  «Мой налог»/ФНС, доставка покупателю, возврат и отмена/коррекция.
- `NPD_TOKEN_ENCRYPTION_KEY` хранится только в секрет-хранилище worker/bootstrap,
  не в web, API, mobile, клиентских bundle, GitHub logs или issue. Ключ — AES-256
  keyring формата `version:base64`, текущая версия первой; старую сохранять при ротации.
- `NPD_API_BASE_URL` — только `https://lknpd.nalog.ru/api/v1`; gateway отклоняет
  другой HTTPS host. Не включать незафиксированные sandbox/mock endpoints.
- Проверить корреляцию `payment.succeeded` → outbox → receipt → email и idempotency.
  `listRecentReceipts` не использовать для reconciliation: протокол не подтверждён.

## Controlled cutover

После успешного и отдельно подтверждённого владельцем live smoke (включая create и
full-refund/cancel) установить границу только один раз из worker/bootstrap окружения:

```sh
pnpm --filter @gafus/worker npd:cutover -- --confirm
```

Команда не вызывает ФНС и не принимает SMS: она атомарно записывает
`NpdConnection.fiscalizationStartedAt`. Платежи до этой отметки намеренно не получают
автоматический backfill. После этого включать `NPD_PROCESSING_ENABLED=true` можно лишь
в отдельном подтверждённом rollout.

## Kill switch and recovery

1. В `.env` на сервере установить `NPD_PROCESSING_ENABLED=false` и пересоздать только
   `worker` (`docker compose ... up -d --force-recreate worker`).
2. Проверить логи без токенов и метрики. Уже созданные платежи не отменять и доступ не
   отзывать автоматически. Outbox продолжит накапливаться до восстановления.
3. Исправить причину (AUTH_REQUIRED, сеть, лимит, почта), при необходимости пройти
   SMS bootstrap внутри worker-контейнера, затем включить флаг и наблюдать backlog.
4. `RECONCILIATION_REQUIRED` разбирать вручную по provider receipt/payment и журналу;
   не повторять неопределённую запись вслепую. Не удалять receipts/outbox и не откатывать
   Prisma migration как способ очистки.

## Rollback release

До deploy сохранить commit SHA и digest каждого образа (`docker image inspect`). Для
отката задать в compose/серверном env неизменяемый `IMAGE_TAG` или digest предыдущего
успешного релиза и пересоздать worker/api/web согласованно; `latest` не считать
доказуемой версией. Сначала выключить внешний NPD processing, затем откатывать образ.
Миграции и уже выданные чеки не удалять; после rollback проверить платежи, outbox и
доступ пользователей.

## Alerts

Готовые PromQL-примеры и оговорки о неподтверждённых рядах находятся в
[`docs/monitoring/PROMETHEUS_QUERIES.md`](../monitoring/PROMETHEUS_QUERIES.md).
