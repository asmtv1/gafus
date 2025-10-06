# @gafus/webpush - Push уведомления

## 📋 Обзор

Пакет `@gafus/webpush` предоставляет функциональность для отправки push уведомлений пользователям через Web Push API.

## 🎯 Основные функции

- **Отправка push уведомлений** через Web Push API
- **Управление подписками** пользователей
- **Валидация подписок** и их сохранение
- **Интеграция с VAPID** для безопасности

## 📦 Использование

### Отправка уведомления
```typescript
import { sendPushNotification } from '@gafus/webpush';

await sendPushNotification({
  subscription: pushSubscription,
  payload: {
    title: 'Новое сообщение',
    body: 'У вас есть новое сообщение',
    icon: '/icon.png',
    badge: '/badge.png'
  }
});
```

### Управление подписками
```typescript
import { subscribeUser, unsubscribeUser } from '@gafus/webpush';

// Подписка пользователя
const subscription = await subscribeUser(userId, pushSubscription);

// Отписка пользователя
await unsubscribeUser(userId);
```

## 🔧 API

- `sendPushNotification(options)` - Отправка уведомления
- `subscribeUser(userId, subscription)` - Подписка пользователя
- `unsubscribeUser(userId)` - Отписка пользователя
- `validateSubscription(subscription)` - Валидация подписки
