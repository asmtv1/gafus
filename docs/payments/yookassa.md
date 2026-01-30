# Платные курсы и ЮKassa

## Обзор

Оплата платных курсов реализована через [ЮKassa](https://yookassa.ru). Создавать платные курсы в тренер-панели могут только администратор и тренер с ником **gafus** (см. docs/apps/trainer-panel.md). Пользователь нажимает «Оплатить» в drawer платного курса → создаётся платёж в БД и в ЮKassa → редирект на страницу оплаты ЮKassa → после успешной оплаты webhook создаёт доступ к курсу.

## Схема Payment (Prisma)

- `id`, `userId`, `courseId`, `amountRub`, `currency`, `yookassaPaymentId`, `confirmationUrl`, `status` (PENDING, SUCCEEDED, CANCELED, REFUNDED), `createdAt`, `updatedAt`
- Частичный уникальный индекс: один PENDING на пару (userId, courseId) — защита от двойного клика «Оплатить».

## Flow оплаты

1. Пользователь кликает по платному курсу без доступа (страница курсов, избранное или прямой URL `/trainings/{type}`) → показывается SweetAlert2 с призывом «Оплатить» или «Закрыть». «Закрыть» — просто закрыть; при прямом заходе на страницу тренировки — редирект на `/courses`.
2. «Оплатить» → открывается PaidCourseDrawer (название, цена, «Оплатить» / «Закрыть»), затем POST `/api/v1/payments/create` с `{ courseId }` и заголовком `x-csrf-token`.
3. API (создание платежа): проверка сессии, rate limit, создание Payment (PENDING), запрос к ЮKassa POST /v3/payments с `capture: true` (списание сразу при оплате), Idempotence-Key и amount.value строкой (из Course.priceRub).
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

## Тестовый режим: СБП и QR

В **тестовом магазине** ЮKassa доступны только два способа оплаты: **банковские карты** и **кошелёк ЮMoney**. СБП и оплата по QR-коду в тестовом режиме **не отображаются** — это ограничение самой ЮKassa.

В **боевом магазине** (после подписания договора) можно подключить СБП и QR в личном кабинете; тогда они появятся на странице оплаты. Документация: [СБП (FPS)](https://yookassa.ru/developers/payment-acceptance/integration-scenarios/manual-integration/other/sbp), [QR](https://promo.yookassa.ru/qr).

## Курс не открывается после оплаты

1. **Webhook должен доходить до сервера.** В личном кабинете ЮKassa указан URL уведомлений (например `https://gafus.ru/api/v1/payments/webhook`). ЮKassa отправляет туда POST при успешной оплате. Если сайт на localhost, webhook не придёт — нужен туннель (ngrok) с HTTPS и этот URL в настройках ЮKassa.
2. **Гонка при возврате.** Пользователь нажимает «Вернуться на сайт» почти сразу после оплаты; webhook может обработаться на секунду позже. После возврата на страницу курса (с параметром `?paid=1`) показывается подсказка и кнопка «Обновить» — нажать её через несколько секунд, чтобы подтянуть доступ.
3. **Проверка:** в БД должны появиться запись `Payment` со статусом `SUCCEEDED` и запись `CourseAccess` для пары courseId + userId.

## Документация ЮKassa

- [Использование API](https://yookassa.ru/developers/using-api/start)
- [Webhooks](https://yookassa.ru/developers/using-api/webhooks)
- [Whitelist IP для webhook](https://yookassa.ru/developers/using-api/webhooks#ip)
- [Тестирование](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing)