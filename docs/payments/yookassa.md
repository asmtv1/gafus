# Платные курсы и ЮKassa

## Обзор

Оплата платных курсов реализована через [ЮKassa](https://yookassa.ru). Оплата курса в **приложении iOS** — через **Apple IAP** (отдельный API и поле `Course.appleIapProductId`); см. [apple-iap.md](./apple-iap.md). Создавать платные курсы в тренер-панели могут только администратор и тренер с ником **gafus** (см. [Trainer Panel](../apps/trainer-panel.md)). Пользователь нажимает «Оплатить» в drawer платного курса → создаётся платёж в БД и в ЮKassa → редирект на страницу оплаты ЮKassa → после успешной оплаты webhook создаёт доступ к курсу.

## Схема Payment (Prisma)

- `id`, `userId`, `courseId`, `amountRub`, `currency`, `provider` (YOOKASSA | APPLE), `yookassaPaymentId`, `appleTransactionId` (для IAP), `confirmationUrl`, `status` (PENDING, SUCCEEDED, CANCELED, REFUNDED), `createdAt`, `updatedAt`

Логирование согласия с Офертой при создании платежа — см. [oferta-compliance.md](./oferta-compliance.md).

- Частичный уникальный индекс: один PENDING на пару (userId, courseId) — защита от двойного клика «Оплатить».

## Flow оплаты

1. Пользователь кликает по платному курсу без доступа (страница курсов, избранное или прямой URL `/trainings/{type}`) → показывается SweetAlert2 с призывом «Оплатить» или «Закрыть». «Закрыть» — просто закрыть; при прямом заходе на страницу тренировки — редирект на `/courses`.
2. «Оплатить» → открывается PaidCourseDrawer (название, цена, текст согласия с Офертой, «Оплатить/Начать курс» / «Закрыть»), затем POST `/api/v1/payments/create` с `{ courseId }` и заголовком `x-csrf-token`. API берёт IP и User-Agent из заголовков и фиксирует согласие (см. [oferta-compliance.md](./oferta-compliance.md)).
3. API (создание платежа): проверка сессии, rate limit, создание Payment (PENDING), запрос к ЮKassa POST /v3/payments с `capture: true` (списание сразу при оплате), Idempotence-Key и amount.value строкой (из Course.priceRub). Максимальная сумма платежа: 100 000 рублей.
4. Ответ API: `{ confirmationUrl }` → `window.location.href = confirmationUrl`.
5. Пользователь оплачивает на стороне ЮKassa и возвращается по return_url (`/trainings/{type}?paid=1`).
6. ЮKassa отправляет webhook POST `/api/v1/payments/webhook` (event: payment.succeeded, payment.canceled или refund.succeeded).
7. Webhook: проверка IP по whitelist ЮKassa + проверка HMAC-SHA256 подписи, ответ 200 сразу, затем:
   - **payment.succeeded**: создание CourseAccess, обновление Payment.status = SUCCEEDED, проверка суммы платежа
   - **payment.canceled**: обновление Payment.status = CANCELED
   - **refund.succeeded**: удаление CourseAccess, обновление Payment.status = REFUNDED
   - Инвалидация кэша курсов
8. При возврате с ?paid=1: показывается success notification, автоматическое обновление через 5 секунд для подтягивания доступа.

## Переменные окружения

В корневом `.env` или `.env.local` (только на сервере, не отдавать клиенту):

```bash
# ЮKassa (платные курсы)
YOOKASSA_SHOP_ID=ваш_shop_id
YOOKASSA_SECRET_KEY=ваш_секретный_ключ
```

Страница контактов (/contacts) — статический public/contacts.html, реквизиты захардкожены.

- **YOOKASSA_SHOP_ID** — идентификатор магазина из личного кабинета ЮKassa.
- **YOOKASSA_SECRET_KEY** — секретный ключ (не публиковать).

Используются только в API routes: `apps/web/src/app/api/v1/payments/create/route.ts`, webhook читает данные из тела запроса.

## Webhook в личном кабинете ЮKassa

1. URL уведомлений: `https://ваш-домен.ru/api/v1/payments/webhook` (только HTTPS в production).
2. Подписаться на события: **payment.succeeded**, **payment.canceled**, **refund.succeeded**.
3. Локальная разработка: нужен HTTPS (ngrok или аналог), указать URL туннеля в кабинете ЮKassa.
4. **Безопасность**: webhook проверяет IP whitelist ЮKassa + HMAC-SHA256 подпись в заголовке `X-Yookassa-Signature`.

## Маршруты API

- `POST /api/v1/payments/create` — создание платежа (сессия, CSRF, rate limit ~10 req/min на userId).
- `POST /api/v1/payments/webhook` — приём уведомлений ЮKassa (проверка IP, без CSRF).

## Mobile flow (WebView, вариант A)

**Исключение — iOS, платный курс:** оплата через **Apple IAP**, не WebView и не `create` для курса (см. [apple-iap.md](./apple-iap.md)). Ниже — **Android** и **iOS для статей**, а также курсы на Android.

1. Приложение вызывает `POST /api/v1/payments/create` с JWT:
   - body: `{ courseId }` или `{ courseType }` (ровно одно поле).
2. API возвращает `data.confirmationUrl`.
3. Приложение открывает `confirmationUrl` во встроенном `WebView`.
4. ЮKassa редиректит на return URL вида:
   - `${WEB_APP_URL}/trainings/{courseType}?paid=1&from=app`
5. Mobile закрывает `WebView` после детекции return URL и проверяет доступ к курсу через refetch.

Важно:

- успех оплаты в UI показывается только после подтверждённого доступа (а не только по URL `paid=1`);
- `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY` остаются только на сервере;
- в варианте A мобильный SDK-ключ ЮKassa не используется.

## Webhook Security Checklist (non-regression)

- Неверная подпись `X-Yookassa-Signature` должна возвращать `403`.
- IP источника вне whitelist ЮKassa должен возвращать `403`.
- В `payment.succeeded` должна выполняться проверка суммы перед выдачей доступа.

## Тестовый режим: СБП и QR

В **тестовом магазине** ЮKassa доступны только два способа оплаты: **банковские карты** и **кошелёк ЮMoney**. СБП и оплата по QR-коду в тестовом режиме **не отображаются** — это ограничение самой ЮKassa.

В **боевом магазине** (после подписания договора) можно подключить СБП и QR в личном кабинете; тогда они появятся на странице оплаты. Документация: [СБП (FPS)](https://yookassa.ru/developers/payment-acceptance/integration-scenarios/manual-integration/other/sbp), [QR](https://promo.yookassa.ru/qr).

## Курс не открывается после оплаты

1. **Webhook должен доходить до сервера.** В личном кабинете ЮKassa указан URL уведомлений (например `https://gafus.ru/api/v1/payments/webhook`). ЮKassa отправляет туда POST при успешной оплате. Если сайт на localhost, webhook не придёт — нужен туннель (ngrok) с HTTPS и этот URL в настройках ЮKassa.
2. **Гонка при возврате.** Пользователь нажимает «Вернуться на сайт» почти сразу после оплаты; webhook может обработаться на секунду позже. После возврата на страницу курса (с параметром `?paid=1`) показывается success notification и страница автоматически обновляется через 5 секунд для подтягивания доступа.
3. **Проверка:** в БД должны появиться запись `Payment` со статусом `SUCCEEDED` и запись `CourseAccess` для пары courseId + userId. **Важно:** проверка доступа к платному курсу выполняется по таблице `CourseAccess`, а не по `Payment`. Webhook при успешной оплате создаёт запись в `CourseAccess` — именно её проверяют функции `checkCourseAccess` и `checkCourseAccessById`.
4. **Безопасность webhook:** если webhook падает с ошибкой подписи (403), проверьте что `YOOKASSA_SECRET_KEY` совпадает с ключом в личном кабинете ЮKassa.

## Документация ЮKassa

- [Использование API](https://yookassa.ru/developers/using-api/start)
- [Webhooks](https://yookassa.ru/developers/using-api/webhooks)
- [Whitelist IP для webhook](https://yookassa.ru/developers/using-api/webhooks#ip)
- [Тестирование](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing)

## Gafus Premium через ЮKassa

ЮKassa поддерживает три фиксированных тарифа Gafus Premium: `TWO_WEEKS` — «Самостоятельный», 30 дней / 1 185 ₽,
`MONTHLY` — «Поддержка в чате», 30 дней / 1 465 ₽ и `THREE_MONTHS` — «Полное сопровождение», 30 дней / 2 470 ₽. Новые продажи каждого
тарифа управляются настройкой админки; выключение тарифа не останавливает продления уже активных
подписок. Исторический `WEEKLY` сохраняется только для прежних подписок и новых продаж не имеет.
Коды `TWO_WEEKS` и `THREE_MONTHS` сохранены для совместимости и не обозначают срок.
Цены выше — значения по умолчанию; текущие предложения берутся из настроек.
Продления прежних подписок и созданные платежи сохраняют цену и период из снимка условий.

1. `POST /api/v1/app-subscription/yookassa/start` принимает один из кодов `TWO_WEEKS`, `MONTHLY`
   или `THREE_MONTHS` и создаёт `AppSubscription` в статусе `PENDING`.
2. Сервер фиксирует в неизменяемом снимке платежа код тарифа, цену и период, затем создаёт в
   ЮKassa обычный платёж через `POST /v3/payments` с сохранением способа оплаты.
3. Промокод доступен только для первоначального `MONTHLY` или `THREE_MONTHS` платежа. Его снимок
   содержит исходную, скидочную суммы и процент скидки; пользователю до оплаты показываются сумма
   первого списания и полная сумма последующего продления. Повторный платёж промокод не содержит.
4. После подтверждения webhook активирует Premium на период из снимка платежа и сохраняет
   идентификатор способа оплаты.
5. Последующие списания выполняет worker после окончания такого же фиксированного периода через
   автоплатёж с `payment_method_id` и полной действующей ценой периода.

Запись к кинологу входит только в «Полное сопровождение». Каталог кинологов и просмотр слотов доступны на всех тарифах; существующие бронирования сохраняются. App Store остаётся отдельным
месячным тарифом. В профиле Apple review весь интерфейс и серверный start ЮKassa выключаются
единым флагом `mobile_ios_ru_card_payment`; это не затрагивает Apple и серверные продления.

### Release-порядок 1.7.0

Перед отправкой версии 1.7.0 в Apple review выставить `iosReviewVersion = 1.7.0`, а для review
выключить `iosRuCardPayment` и промокоды. Не повышать `MOBILE_IOS_MIN_VERSION` и
`MOBILE_ANDROID_MIN_VERSION` до 1.7.0, пока версия не доступна в соответствующих сторах. После
одобрения перевести 1.7.0 из review-профиля в released, затем включить новые тарифы в админке.

В боевом магазине автоплатежи и нужные способы оплаты должны быть подключены у менеджера ЮKassa.
