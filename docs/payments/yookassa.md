# Платные курсы и ЮKassa

## Обзор

Оплата платных курсов реализована через [ЮKassa](https://yookassa.ru). Пользователь нажимает «Оплатить» в drawer платного курса → создаётся платёж в БД и в ЮKassa → редирект на страницу оплаты ЮKassa → после успешной оплаты webhook создаёт доступ к курсу.

## Схема Payment (Prisma)

- `id`, `userId`, `courseId`, `amountRub`, `currency`, `yookassaPaymentId`, `confirmationUrl`, `status` (PENDING, SUCCEEDED, CANCELED, REFUNDED), `createdAt`, `updatedAt`
- Частичный уникальный индекс: один PENDING на пару (userId, courseId) — защита от двойного клика «Оплатить».

## Flow оплаты

1. Пользователь кликает по платному курсу без доступа (страница курсов, избранное или прямой URL `/trainings/{type}`) → показывается SweetAlert2 с призывом «Оплатить» или «Закрыть». «Закрыть» — просто закрыть; при прямом заходе на страницу тренировки — редирект на `/courses`.
2. «Оплатить» → открывается PaidCourseDrawer (название, цена, «Оплатить» / «Закрыть»), затем POST `/api/v1/payments/create` с `{ courseId }` и заголовком `x-csrf-token`.
3. API (создание платежа): проверка сессии, rate limit, создание Payment (PENDING), запрос к ЮKassa POST /v3/payments с Idempotence-Key и amount.value строкой (из Course.priceRub).
4. Ответ API: `{ confirmationUrl }` → `window.location.href = confirmationUrl`.
5. Пользователь оплачивает на стороне ЮKassa и возвращается по return_url.
6. ЮKassa отправляет webhook POST `/api/v1/payments/webhook` (event: payment.succeeded).
7. Webhook: проверка IP по whitelist ЮKassa, ответ 200 сразу, затем создание CourseAccess и обновление Payment.status = SUCCEEDED, инвалидация кэша курсов.

## Переменные окружения

В корневом `.env` или `.env.local` (только на сервере, не отдавать клиенту):

```bash
# ЮKassa (платные курсы)
YOOKASSA_SHOP_ID=ваш_shop_id
YOOKASSA_SECRET_KEY=ваш_секретный_ключ
```

- **YOOKASSA_SHOP_ID** — идентификатор магазина из личного кабинета ЮKassa.
- **YOOKASSA_SECRET_KEY** — секретный ключ (не публиковать).

Используются только в API routes: `apps/web/src/app/api/v1/payments/create/route.ts`, webhook читает данные из тела запроса.

## Webhook в личном кабинете ЮKassa

1. URL уведомлений: `https://ваш-домен.ru/api/v1/payments/webhook` (только HTTPS в production).
2. Подписаться на событие: **payment.succeeded**.
3. Локальная разработка: нужен HTTPS (ngrok или аналог), указать URL туннеля в кабинете ЮKassa.

## Маршруты API

- `POST /api/v1/payments/create` — создание платежа (сессия, CSRF, rate limit ~10 req/min на userId).
- `POST /api/v1/payments/webhook` — приём уведомлений ЮKassa (проверка IP, без CSRF).

## Документация ЮKassa

- [Использование API](https://yookassa.ru/developers/using-api/start)
- [Webhooks](https://yookassa.ru/developers/using-api/webhooks)
- [Whitelist IP для webhook](https://yookassa.ru/developers/using-api/webhooks#ip)
