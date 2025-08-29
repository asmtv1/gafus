# 🏗️ Архитектура управления push-подписками по устройствам

## 🎯 Проблема

**Старая архитектура была неправильной:**
- Одна подписка на всех устройствах
- При создании/удалении подписки страдали все устройства
- Safari и Chrome получали одинаковые уведомления
- Невозможно было отслеживать активность по устройствам

## ✅ Новое решение

**Правильная архитектура:**
- **Отдельная подписка для каждого устройства**
- **Разные стратегии отправки для Safari и Chrome**
- **Отслеживание активности по устройствам**
- **Автоматическое определение типа устройства**

## 🏛️ Архитектура

### 1. Device Subscription Manager
```typescript
// packages/webpush/src/device-manager.ts
export class DeviceSubscriptionManager {
  // Singleton pattern для глобального доступа
  static getInstance(): DeviceSubscriptionManager
  
  // Создание подписки для конкретного устройства
  async createDeviceSubscription(vapidKey: string, userId: string): Promise<DeviceSubscription>
  
  // Управление подписками по устройствам
  removeDeviceSubscription(deviceId: string): Promise<void>
  getDeviceSubscription(deviceId: string): DeviceSubscription | undefined
  getAllActiveSubscriptions(): DeviceSubscription[]
}
```

### 2. Device Subscription Interface
```typescript
export interface DeviceSubscription {
  id: string;                    // Уникальный ID устройства
  userId: string;                // ID пользователя
  endpoint: string;              // Push endpoint (APNS/FCM)
  keys: {                        // Ключи шифрования
    p256dh: string;
    auth: string;
  };
  deviceType: 'safari' | 'chrome' | 'firefox' | 'other';
  userAgent: string;             // User-Agent браузера
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
  createdAt: Date;               // Дата создания
  lastUsed: Date;                // Последнее использование
  isActive: boolean;             // Активна ли подписка
}
```

### 3. Push Store (Zustand)
```typescript
// apps/web/src/shared/stores/push/pushStore.ts
export const usePushStore = create<PushState>()(
  persist(
    (set, get) => ({
      currentDeviceSubscription: DeviceSubscription | null,
      
      // Создание подписки для текущего устройства
      setupDeviceSubscription: async (vapidKey: string) => Promise<void>,
      
      // Управление подписками
      removeCurrentDeviceSubscription: async () => Promise<void>,
      refreshCurrentDeviceSubscription: () => void,
      
      // Утилиты
      getCurrentDeviceInfo: () => DeviceInfo,
      getAllDeviceSubscriptions: () => DeviceSubscription[],
    })
  )
);
```

## 🔄 Жизненный цикл подписки

### 1. Создание подписки
```typescript
// Пользователь открывает сайт на новом устройстве
const deviceInfo = deviceManager.getCurrentDeviceInfo();
// deviceInfo.id = "device_1234567890_abc123_def456"

// Создается подписка для этого устройства
const subscription = await deviceManager.createDeviceSubscription(
  vapidPublicKey,
  userId
);

// Подписка сохраняется локально и на сервере
localStorage.setItem('device-subscriptions', JSON.stringify(data));
await updateSubscriptionAction(subscription);
```

### 2. Отправка уведомлений
```typescript
// Получаем все активные подписки пользователя
const userSubscriptions = await getUserSubscriptions(userId);

// Группируем по типу устройства
const safariSubscriptions = userSubscriptions.filter(sub => 
  sub.endpoint.includes('web.push.apple.com')
);
const chromeSubscriptions = userSubscriptions.filter(sub => 
  sub.endpoint.includes('fcm.googleapis.com')
);

// Отправляем с разными стратегиями
await sendToSafari(safariSubscriptions, safariPayload);
await sendToChrome(chromeSubscriptions, chromePayload);
```

### 3. Удаление подписки
```typescript
// Пользователь удаляет подписку на конкретном устройстве
await deviceManager.removeDeviceSubscription(deviceId);

// Удаляется только с этого устройства
// Другие устройства не затрагиваются
```

## 📱 Стратегии по типам устройств

### Safari (APNS)
```typescript
// Endpoint: web.push.apple.com
const safariPayload = {
  title: "Уведомление",
  body: "Текст уведомления",
  icon: "/icons/icon192.png",
  badge: "/icons/icon192.png",
  // APNS специфичные поля
  aps: {
    alert: { title: "Уведомление", body: "Текст" },
    badge: 1,
    sound: "default",
    "content-available": 1
  }
};
```

### Chrome (FCM)
```typescript
// Endpoint: fcm.googleapis.com
const chromePayload = {
  title: "Уведомление",
  body: "Текст уведомления",
  icon: "/icons/icon192.png",
  badge: "/icons/icon192.png",
  // FCM специфичные поля
  fcm_options: {
    link: "/",
    image: "/icons/icon192.png"
  }
};
```

## 🗄️ Хранение данных

### Локальное хранение (localStorage)
```typescript
{
  "device-subscriptions": [
    ["device_123", {
      "id": "device_123",
      "deviceType": "safari",
      "platform": "ios",
      "endpoint": "web.push.apple.com/...",
      "createdAt": "2025-01-29T...",
      "lastUsed": "2025-01-29T..."
    }],
    ["device_456", {
      "id": "device_456", 
      "deviceType": "chrome",
      "platform": "desktop",
      "endpoint": "fcm.googleapis.com/...",
      "createdAt": "2025-01-29T...",
      "lastUsed": "2025-01-29T..."
    }]
  ],
  "currentDeviceId": "device_123",
  "timestamp": 1706544000000
}
```

### Серверное хранение (Database)
```sql
-- Таблица push_subscriptions
CREATE TABLE push_subscriptions (
  id VARCHAR(255) PRIMARY KEY,           -- device_123
  user_id VARCHAR(255) NOT NULL,         -- cmet0jwh10000qzhto2vcgc5c
  endpoint TEXT NOT NULL,                -- web.push.apple.com/...
  p256dh TEXT NOT NULL,                  -- Ключ шифрования
  auth TEXT NOT NULL,                    -- Ключ аутентификации
  device_type VARCHAR(50),               -- safari, chrome, firefox
  platform VARCHAR(50),                  -- ios, android, desktop
  user_agent TEXT,                       -- User-Agent браузера
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);
```

## 🚀 Преимущества новой архитектуры

### ✅ Для пользователей
- **Push-уведомления работают на всех устройствах**
- **Каждое устройство получает уведомления независимо**
- **Safari получает APNS-совместимые уведомления**
- **Chrome получает FCM-совместимые уведомления**

### ✅ Для разработчиков
- **Четкое разделение логики по устройствам**
- **Легко добавлять новые типы устройств**
- **Отслеживание активности по устройствам**
- **Масштабируемость для множества устройств**

### ✅ Для системы
- **Нет конфликтов между устройствами**
- **Эффективное использование ресурсов**
- **Простое управление подписками**
- **Автоматическое определение типа устройства**

## 🔧 Использование

### В компоненте React
```typescript
import { usePushStore } from '@/shared/stores/push/pushStore';

function PushNotificationButton() {
  const { 
    setupDeviceSubscription, 
    currentDeviceSubscription,
    getCurrentDeviceInfo 
  } = usePushStore();

  const handleSubscribe = async () => {
    const deviceInfo = getCurrentDeviceInfo();
    console.log('Device:', deviceInfo.type, deviceInfo.platform);
    
    await setupDeviceSubscription(vapidPublicKey);
  };

  return (
    <button onClick={handleSubscribe}>
      {currentDeviceSubscription ? 'Подписка активна' : 'Подписаться'}
    </button>
  );
}
```

### В worker'е
```typescript
import { PushNotificationService } from '@gafus/webpush/service';

const pushService = new PushNotificationService(config);

// Отправляем уведомления с учетом типа устройства
const results = await pushService.sendNotificationsToDevices(
  subscriptions,
  payload
);

console.log('Device type stats:', results.deviceTypeStats);
// { safari: { success: 5, failure: 0 }, chrome: { success: 10, failure: 1 } }
```

## 🧪 Тестирование

### Тестовая страница для Safari
```
/force-safari-subscription.html
```

### Тестовая страница для Chrome
```
/test-push.html
```

### Универсальная диагностика
```
/test-safari-push.html
```

## 📚 Лучшие практики

1. **Всегда используйте device manager** для создания подписок
2. **Не удаляйте подписки глобально** - только для конкретного устройства
3. **Группируйте подписки по типу** перед отправкой уведомлений
4. **Используйте соответствующие payload** для каждого типа устройства
5. **Отслеживайте активность** устройств для очистки неактивных подписок

## 🔮 Будущие улучшения

- [ ] Автоматическая очистка неактивных подписок
- [ ] Синхронизация подписок между устройствами
- [ ] A/B тестирование разных payload для устройств
- [ ] Аналитика доставки по типам устройств
- [ ] Поддержка новых платформ (Edge, Opera)
