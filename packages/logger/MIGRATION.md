# Миграция на @gafus/logger

Этот документ поможет вам мигрировать с существующих систем логирования на новый единый логгер.

## Быстрая миграция

### 1. Замена console.log

**Было:**
```typescript
console.log('Пользователь создан:', user);
console.warn('Предупреждение:', warning);
console.error('Ошибка:', error);
```

**Стало:**
```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('user-service');

logger.info('Пользователь создан', { userId: user.id });
logger.warn('Предупреждение', { warning });
logger.error('Ошибка', error);
```

### 2. Замена существующих логгеров

**Было (из @gafus/types):**
```typescript
import { createLogger } from '@gafus/types';
const logger = createLogger('auth');
```

**Стало:**
```typescript
import { createWebLogger } from '@gafus/logger';
const logger = createWebLogger('auth');
```

**Было (из @gafus/error-handling):**
```typescript
import { createLogger } from '@gafus/error-handling';
const logger = createLogger('web', 'development');
```

**Стало:**
```typescript
import { createWebLogger } from '@gafus/logger';
const logger = createWebLogger('web');
```

### 3. Замена самописных логгеров

**Было:**
```typescript
const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
};
```

**Стало:**
```typescript
import { createWebLogger } from '@gafus/logger';
const logger = createWebLogger('module-name');
```

## Пошаговая миграция

### Этап 1: Установка пакета

```bash
# В корне проекта
pnpm add @gafus/logger
```

### Этап 2: Замена импортов

Найдите все файлы с логированием и замените импорты:

```bash
# Поиск файлов с console.log
grep -r "console\." apps/ packages/ --include="*.ts" --include="*.tsx"

# Поиск существующих логгеров
grep -r "createLogger" apps/ packages/ --include="*.ts" --include="*.tsx"
```

### Этап 3: Обновление кода

Для каждого файла:

1. **Добавьте импорт:**
   ```typescript
   import { createWebLogger } from '@gafus/logger';
   ```

2. **Создайте логгер:**
   ```typescript
   const logger = createWebLogger('module-name');
   ```

3. **Замените вызовы:**
   ```typescript
   // console.log -> logger.info
   // console.warn -> logger.warn  
   // console.error -> logger.error
   ```

### Этап 4: Настройка окружения

Добавьте переменную окружения для error-dashboard:

```bash
# .env.local
ERROR_DASHBOARD_URL=http://localhost:3001/api/push-logs
```

### Этап 5: Тестирование

1. Проверьте, что логи выводятся корректно в development
2. Убедитесь, что ошибки отправляются в error-dashboard
3. Проверьте производительность в production

## Примеры миграции по приложениям

### Web App

```typescript
// apps/web/src/shared/lib/user/createUser.ts
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('user-service');

export async function createUser(userData: UserData) {
  logger.info('Создание пользователя', { email: userData.email });
  
  try {
    const user = await prisma.user.create({ data: userData });
    logger.success('Пользователь создан', { userId: user.id });
    return user;
  } catch (error) {
    await logger.error('Ошибка создания пользователя', error, { email: userData.email });
    throw error;
  }
}
```

### Trainer Panel

```typescript
// apps/trainer-panel/src/features/users/lib/updateUser.ts
import { createTrainerPanelLogger } from '@gafus/logger';

const logger = createTrainerPanelLogger('user-management');

export async function updateUser(userId: string, data: UpdateUserData) {
  logger.info('Обновление пользователя', { userId });
  
  try {
    const user = await prisma.user.update({ where: { id: userId }, data });
    logger.success('Пользователь обновлен', { userId });
    return user;
  } catch (error) {
    await logger.error('Ошибка обновления пользователя', error, { userId });
    throw error;
  }
}
```

### Worker

```typescript
// packages/worker/src/push-worker.ts
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('push-notifications');

export async function sendPushNotification(subscription: PushSubscription, payload: string) {
  logger.info('Отправка push-уведомления', { 
    endpoint: subscription.endpoint,
    payloadLength: payload.length 
  });
  
  try {
    await webpush.sendNotification(subscription, payload);
    logger.success('Push-уведомление отправлено');
  } catch (error) {
    await logger.error('Ошибка отправки push-уведомления', error);
  }
}
```

## Проверка миграции

### 1. Поиск оставшихся console.log

```bash
grep -r "console\." apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v "//"
```

### 2. Проверка импортов старых логгеров

```bash
grep -r "from '@gafus/types.*logger'" apps/ packages/ --include="*.ts" --include="*.tsx"
grep -r "from '@gafus/error-handling.*logger'" apps/ packages/ --include="*.ts" --include="*.tsx"
```

### 3. Тестирование в разных окружениях

```bash
# Development
NODE_ENV=development pnpm dev

# Production
NODE_ENV=production pnpm build && pnpm start
```

## Преимущества после миграции

- ✅ **Единая система логирования** для всех приложений
- ✅ **Автоматическая отправка ошибок** в error-dashboard
- ✅ **Структурированные логи** в JSON формате
- ✅ **Высокая производительность** благодаря Pino
- ✅ **Гибкая конфигурация** по окружениям
- ✅ **TypeScript поддержка** из коробки
- ✅ **Централизованное управление** уровнями логирования

## Поддержка

Если у вас возникли вопросы по миграции, обратитесь к:
- [README пакета](./README.md)
- [Примеры использования](./examples/usage.ts)
- Документации по [Pino](https://getpino.io/)
