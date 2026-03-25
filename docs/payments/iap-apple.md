# Apple In-App Purchases (iOS)

Связанные документы: [yookassa.md](./yookassa.md) (web/Android), [oferta-compliance.md](./oferta-compliance.md).

## Два канала оплаты

- **iOS:** цифровой контент только через **App Store** (StoreKit) и эндпоинт `POST /api/v1/payments/apple/verify`.
- **Android и web:** **YooKassa** без изменений (создание платежа, webhook, доступ).

## Верификация

На сервере используется **`@apple/app-store-server-library` v3**: класс `SignedDataVerifier` и `verifyAndDecodeTransaction(JWS)`. Корневые сертификаты Apple лежат в `packages/core/src/services/payments/apple-certs/` (публичные DER, не секреты).

Приватный ключ `.p8` для **App Store Server API** в MVP **не нужен** — только для post-MVP (уведомления, история транзакций).

## Переменные окружения (API)

См. `apps/api/.env.example`: `APPLE_BUNDLE_ID`, `APPLE_APP_APPLE_ID` (для Production), `APPLE_ENVIRONMENT`, `APPLE_IAP_PRODUCT_MAP_JSON`.

## Клиент (mobile)

- Заголовок `X-Client-Platform: ios` — дополнительная блокировка `POST .../payments/create` (не замена политики App Store Review).
- `EXPO_PUBLIC_APPLE_IAP_PRODUCT_MAP_JSON` — тот же массив, что на сервере, для сопоставления `courseId` / `articleId` → SKU.

**Expo Go не поддерживает IAP.** Если при `expo start` открыть проект в Expo Go, будет ошибка **`Cannot find native module 'ExpoIap'`** — это ожидаемо.

Что делать:

1. Локально: из `apps/mobile` выполнить **`pnpm ios`** (скрипт `expo run:ios`) — соберётся нативное приложение с плагином `expo-iap` из `app.json`. При первой настройке или после смены нативных плагинов: `npx expo prebuild --platform ios` (при необходимости с `--clean`).
2. Облако: **`eas build --profile development -p ios`** (в `eas.json` уже есть профиль `development` с simulator), установить билд и подключаться к тому же Metro (`expo start`).

## Sandbox

1. Sandbox-аккаунт в App Store Connect, продукты non-consumable с теми же `productId`, что в `APPLE_IAP_PRODUCT_MAP_JSON`.
2. На API: `APPLE_ENVIRONMENT=SANDBOX`.
3. После покупки клиент шлёт JWS (в `expo-iap` — поле `purchaseToken` на iOS); ответ `{ success, data: { alreadyGranted } }`.

## Восстановление покупок

Кнопка «Восстановить покупки» вызывает `restorePurchases` + `getAvailablePurchases` и для каждой транзакции — `verify` на сервере. Повторные запросы безопасны за счёт уникального `originalTransactionId` в БД.

## Данные и сборка

- **Prisma:** модель `AppleIapTransaction`, enum `AppleIapEnvironment`; миграции `20260325120000_add_apple_iap_transaction`, `20260325123000_oferta_acceptance_apple_iap`.
- **Тесты:** `packages/core/src/services/payments/__tests__/appleIapService.test.ts`.
- Сборка `@gafus/core` копирует `apple-certs/*.cer` в `dist` для чтения верификатором в рантайме.

## Post-MVP (указатели)

- **App Store Server Notifications V2** — отзывы/возвраты в паритет с `refundPaymentFromWebhook` для YooKassa.
- Вызовы **App Store Server API** с `.p8` — история, статус подписок.
- Админка: список `AppleIapTransaction` рядом с платежами YooKassa.
