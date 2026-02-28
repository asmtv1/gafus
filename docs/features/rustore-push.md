# RuStore Push

## Обзор

RuStore Push позволяет отправлять push-уведомления на Android-устройства без Google Mobile Services (GMS). Альтернатива FCM для устройств с RuStore, Почта Mail.ru, Дзен или Одноклассниками.

## Ключевые файлы

| Компонент | Файл |
|-----------|------|
| Backend | `packages/worker/src/lib/rustorePush.ts` |
| Партиционирование | `packages/worker/src/lib/partitionPushSubscriptions.ts` |
| Интеграция | `push-worker.ts`, `reengagement-worker.ts`, `training-reminders-sender.ts` |
| Mobile | `apps/mobile/src/shared/lib/utils/notifications.ts` |

## Поток

1. **Mobile (Android):** получает RuStore токен через SDK → сохраняет через `POST /api/v1/subscriptions/push` с `{ endpoint: token, keys: { p256dh: "rustore", auth: "rustore" } }`
2. **Backend:** `partitionPushSubscriptions` помещает подписку в `rustore` (по ключам)
3. **Worker:** `sendRustorePushNotifications` отправляет запрос в RuStore Universal Push API

## DUAL registration (Android)

Expo (FCM) и RuStore на Android работают **независимо**. Один пользователь может иметь оба токена:
- С GMS → Expo/FCM
- Без GMS → RuStore
- С обоими → оба сохраняются, бекенд шлёт на все активные

`setupPushNotifications()` регистрирует оба канала на Android.

## Переменные окружения

| Переменная                  | Описание                                  | Секрет |
|----------------------------|-------------------------------------------|--------|
| `RUSTORE_PUSH_SERVICE_TOKEN` | Сервисный токен из RuStore Dev Console   | Да     |
| `RUSTORE_PROJECT_ID`       | Project ID (напр. `PFFHd5eQK8rkDY9vAAeH4TYv3hlvkyMG`) | Нет    |

Хранить `RUSTORE_PUSH_SERVICE_TOKEN` в vault/секретах.

## Ограничения

- Требуется RuStore, Почта Mail.ru, Дзен или OK на устройстве
- GMS не нужен
- Dev build обязателен — в Expo Go RuStore SDK недоступен

## Тестирование

Кнопка «Тестовое push-уведомление» в RuStore Dev Console после интеграции SDK в приложении.
