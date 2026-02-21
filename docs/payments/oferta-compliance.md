# Соответствие оферте (OfertaAcceptance)

## Обзор

При нажатии «Оплатить/Начать курс» создаётся запись в таблице `OfertaAcceptance` — фиксация согласия пользователя с условиями Оферты (п. 8.8, 8.9 oferta.html).

## Схема OfertaAcceptance (Prisma)

- `userId`, `courseId`, `paymentId` (nullable), `acceptedAt` (UTC), `ipAddress`, `userAgent`, `documentVersions` (JSON), `source` ("web" | "mobile")

## Когда создаётся запись

- При успешном создании платежа (`createPayment`) с переданным `acceptanceContext`.
- **Не создаётся** при early return по `existingPending.confirmationUrl` — только при первой попытке создания платежа.

## Fire-and-forget

Логирование согласия выполняется асинхронно и **никогда не блокирует платёж**. Ошибки записи логируются в `@gafus/logger`, пользователю не показываются.

## API и передача данных

- **Web** (`POST /api/v1/payments/create`): IP и User-Agent берутся из заголовков `x-forwarded-for` / `x-real-ip` и `user-agent`. API формирует `acceptanceContext` и передаёт в `createPayment`.
- **Mobile** (`apps/api` → `POST /v1/payments/create`): аналогично — заголовки `x-forwarded-for`, `user-agent`, `source: "mobile"`.
- Клиент не передаёт acceptanceContext в body — сервер всегда формирует его из запроса.

## Версии документов

Версии хранятся в `packages/core/src/config/documentVersions.ts`. **Обновлять при изменении** oferta.html, policy.html, personal.html, personal-distribution.html.
