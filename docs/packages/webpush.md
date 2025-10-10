# @gafus/webpush - Push уведомления

## 📋 Обзор

Пакет `@gafus/webpush` предоставляет функциональность для отправки push уведомлений пользователям через Web Push API.

## 🎯 Основные функции

- **Отправка push уведомлений** через Web Push API
- **Управление подписками** пользователей
- **Валидация подписок** и их сохранение
- **Интеграция с VAPID** для безопасности

## 📦 Использование

### Немедленная отправка уведомления (Обновлено в v2.5.4)

```typescript
import { sendImmediatePushNotification } from '@gafus/webpush';

// Отправка немедленного уведомления пользователю
await sendImmediatePushNotification({
  userId: 'user-id',
  title: '"Базовые команды" зачтён! ✅',
  body: 'Тренер проверил ваш экзамен. Можете переходить к следующему шагу.',
  url: '/trainings/authors/1',
  icon: '/icons/icon192.png',
  badge: '/icons/badge-72.png'
});
```

**Особенности:**
- ✅ Немедленная отправка (delay: 0)
- ✅ Автоматический retry (3 попытки)
- ✅ Отправка на все устройства пользователя
- ✅ Не блокирует основную логику при ошибках
- ✅ Централизованное логирование
- ✅ **Типобезопасность** - использует Discriminated Union (v2.5.4)
- ✅ **Явное поле типа** - `type: "immediate"` вместо `stepIndex: -1` (v2.5.4)

### Планируемая отправка уведомления

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

### Основные функции

- **`sendImmediatePushNotification(options)`** - Немедленная отправка уведомления (v2.5+)
  - `userId: string` - ID пользователя
  - `title: string` - Заголовок уведомления
  - `body: string` - Текст уведомления
  - `url?: string` - URL для перехода при клике
  - `icon?: string` - Иконка уведомления
  - `badge?: string` - Badge для iOS
  - Возвращает: `{ success: boolean; notificationId?: string; error?: string }`

- **`sendPushNotification(options)`** - Отправка уведомления
- **`subscribeUser(userId, subscription)`** - Подписка пользователя
- **`unsubscribeUser(userId)`** - Отписка пользователя
- **`validateSubscription(subscription)`** - Валидация подписки

### Классы

- **`PushNotificationService`** - Сервис для отправки пуш-уведомлений
- **`DeviceSubscriptionManager`** - Управление подписками устройств

## 🏗️ Архитектура (v2.5.4)

### Discriminated Union для типобезопасности

Система уведомлений использует **Discriminated Union** для обеспечения типобезопасности:

```typescript
// Типы уведомлений
type NotificationType = 'step' | 'immediate';

// Интерфейсы для разных типов уведомлений
interface StepNotificationData {
  type: 'step';
  stepTitle: string;
  stepIndex: number;
  url?: string;
}

interface ImmediateNotificationData {
  type: 'immediate';
  title: string;
  body: string;
  url?: string;
}

// Объединенный тип
type NotificationData = StepNotificationData | ImmediateNotificationData;
```

### Преимущества нового подхода

- ✅ **Типобезопасность** - TypeScript проверяет типы на этапе компиляции
- ✅ **Автокомплит** - IDE знает какие поля доступны
- ✅ **Явность** - тип уведомления очевиден из кода
- ✅ **Расширяемость** - легко добавить новые типы уведомлений
- ✅ **Отсутствие magic numbers** - убран `stepIndex: -1` как индикатор типа

### Миграция БД

```sql
-- Добавляем поле type в StepNotification
ALTER TABLE "StepNotification" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'step';
CREATE INDEX "StepNotification_type_idx" ON "StepNotification"("type");

-- Обновляем существующие записи
UPDATE "StepNotification" SET "type" = 'immediate' WHERE "stepIndex" = -1;
```
