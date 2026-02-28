# Промпт: Внедрение RuStore Push в GAFUS

Скопируй этот промпт для агента при реализации RuStore Push.

---

## Контекст

**Целевая дистрибуция:** только RuStore (Android) и App Store (iOS). Google Play не используется.

**Текущая реализация push:**
- **Android:** Expo Push → FCM v1 (не работает на устройствах без GMS)
- **iOS:** Expo Push → APNS
- **Web (PWA):** Web Push API (VAPID)

**Решение:** Добавить RuStore Push как основной канал для Android. iOS и Web оставить без изменений.

---

## Данные RuStore (уже настроены)

- **Project ID:** `PFFHd5eQK8rkDY9vAAeH4TYv3hlvkyMG`
- **Package:** `ru.gafus.app`
- **SHA-256:** `4A:B5:16:CF:4F:E2:61:31:A7:14:D0:84:86:AA:6C:2B:10:70:1E:8D:4B:BD:20:B3:04:3D:64:99:C0:40:D8:F9`
- **Сервисный токен:** сгенерирован в RuStore Dev Console (хранить в `RUSTORE_PUSH_SERVICE_TOKEN`)

---

## Структура проекта (релевантные файлы)

```
apps/mobile/                    # Expo React Native
├── app.json
├── eas.json
└── src/shared/lib/utils/notifications.ts   # Регистрация push, savePushToken

packages/worker/
├── src/push-worker.ts          # Обработка очереди уведомлений
├── src/lib/partitionPushSubscriptions.ts   # Разделение expo vs web
├── src/lib/expoPush.ts        # Отправка через Expo (FCM/APNS)
└── src/reengagement-worker.ts, training-reminders-sender.ts  # Тоже используют push

packages/core/src/services/subscriptions/pushSubscriptionService.ts

packages/prisma/schema.prisma   # PushSubscription model
```

---

## План реализации

### 1. Mobile (Android): интеграция RuStore Push SDK

- Установить RuStore Push SDK / Universal Push SDK (Kotlin/Java). RuStore имеет React Native binding — проверить [документацию RuStore](https://www.rustore.ru/help/sdk/push-notifications).
- Т.к. Expo использует нативные модули, потребуется **development build** (`expo prebuild` + `eas build`), не Expo Go.
- В `notifications.ts` для **Android**: при наличии RuStore на устройстве — получать RuStore push token, иначе fallback на Expo (для dev/preview).
- Формат сохранения RuStore токена: `endpoint` = RuStore token (строка), `keys: { p256dh: "rustore", auth: "rustore" }` — чтобы отличать от Expo в partition.
- API сохранения уже есть: `subscriptionsApi.savePushSubscription({ endpoint, keys })`.

### 2. Backend: разделение подписок и отправка через RuStore

- **partitionPushSubscriptions:** добавить тип `rustore`. Определение: `keys.p256dh === "rustore"` или `keys.auth === "rustore"`.
- **Новый модуль** `packages/worker/src/lib/rustorePush.ts`:
  - POST `https://vkpns-universal.rustore.ru/v1/send`
  - Body: `{ providers: { rustore: { project_id, auth_token } }, tokens: { rustore: [...] }, message: { notification: { title, body }, data: { url } } }`
  - Env: `RUSTORE_PUSH_SERVICE_TOKEN`, `RUSTORE_PROJECT_ID`
  - Обработка ошибок (invalid tokens → удалить подписку), логирование через `@gafus/logger`
- **push-worker.ts, reengagement-worker.ts, training-reminders-sender.ts:** вызывать `sendRustorePushNotifications` для `partitioned.rustore` с тем же payload (title, body, url).

### 3. Схема и API

- **PushSubscription:** текущая схема подходит. RuStore сохраняется как `endpoint` (токен) + `keys: { p256dh: "rustore", auth: "rustore" }`. Миграция не нужна.
- **API subscriptions:** без изменений. Mobile передаёт `{ endpoint: rustoreToken, keys: { p256dh: "rustore", auth: "rustore" } }`.

### 4. Environment

```env
RUSTORE_PUSH_SERVICE_TOKEN=<сервисный токен из консоли>
RUSTORE_PROJECT_ID=PFFHd5eQK8rkDY9vAAeH4TYv3hlvkyMG
```

### 5. Документация

- Обновить `docs/apps/mobile-rn.md` (раздел push)
- Добавить `docs/features/rustore-push.md` с описанием потока, env и ограничений

---

## Ограничения и замечания

- RuStore Push требует RuStore (или приложения VK: Почта, Дзен, ОК) на устройстве.
- Для тестирования: кнопка «Отправить» в RuStore Dev Console (раздел «Тестовое push-уведомление») — нужна интеграция SDK в приложении.
- Один пользователь может иметь несколько подписок: Web + iOS (Expo) + Android (RuStore). Backend отправляет на все активные каналы.
- При `DeviceNotRegistered` / `invalid tokens` — удалять подписку из БД (аналогично expoPush).

---

## Порядок работ

1. Создать `rustorePush.ts`, интегрировать в push-worker (и другие воркеры).
2. Обновить partitionPushSubscriptions.
3. Mobile: добавить RuStore SDK, получение токена и сохранение (только Android).
4. Документация, env в .env.example.
5. Сборка и тестирование (`pnpm run build`).
