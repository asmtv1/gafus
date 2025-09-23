# @gafus/logger

Единый логгер для всех приложений Gafus с интеграцией в error-dashboard.

## Особенности

- 🚀 **Высокая производительность** на основе Pino
- 📊 **Структурированное логирование** в формате JSON
- 🎯 **Интеграция с error-dashboard** для централизованного сбора ошибок
- 🔧 **Гибкая конфигурация** по окружениям
- 📝 **TypeScript поддержка** из коробки
- 🏗️ **Монорепозиторий** - единый пакет для всех приложений

## Быстрый старт

### Базовое использование

```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('auth-module');

logger.info('Пользователь вошел в систему', { userId: '123' });
logger.error('Ошибка аутентификации', error, { userId: '123' });
logger.success('Операция выполнена успешно');
```

### Создание кастомного логгера

```typescript
import { LoggerFactory } from '@gafus/logger';

const logger = LoggerFactory.createLogger({
  appName: 'my-app',
  context: 'user-service',
  environment: 'development',
  enableErrorDashboard: true,
  errorDashboardUrl: 'http://localhost:3001/api/push-logs',
});
```

## API

### Уровни логирования

- `debug` - Отладочная информация (только в development)
- `info` - Общая информация
- `warn` - Предупреждения
- `error` - Ошибки (отправляются в error-dashboard)
- `fatal` - Критические ошибки (отправляются в error-dashboard)

### Методы логгера

```typescript
interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, error?: Error, meta?: LogMeta): Promise<void>;
  fatal(message: string, error?: Error, meta?: LogMeta): Promise<void>;
  dev(message: string, meta?: LogMeta): void; // Только в development
  success(message: string, meta?: LogMeta): void;
}
```

### Готовые логгеры для приложений

```typescript
import {
  createWebLogger,
  createTrainerPanelLogger,
  createErrorDashboardLogger,
  createTelegramBotLogger,
  createWorkerLogger,
  createBullBoardLogger,
} from '@gafus/logger';

// Для веб-приложения
const webLogger = createWebLogger('auth');

// Для панели тренера
const trainerLogger = createTrainerPanelLogger('statistics');

// Для telegram-bot
const botLogger = createTelegramBotLogger('commands');

// Для worker
const workerLogger = createWorkerLogger('push-notifications');
```

## Конфигурация

### Переменные окружения

```bash
# URL error-dashboard для отправки логов
ERROR_DASHBOARD_URL=http://localhost:3001/api/push-logs

# Окружение (development, production, test)
NODE_ENV=development
```

### Автоматическая конфигурация по окружению

- **Development**: `debug` уровень, цветной вывод, отправка в error-dashboard
- **Production**: `warn` уровень, JSON формат, отправка в error-dashboard
- **Test**: `warn` уровень, минимальное логирование

## Интеграция с error-dashboard

Логгер автоматически отправляет ошибки в ваш error-dashboard:

### Development режим
- ✅ **error** и **fatal** - отправляются в error-dashboard
- ❌ **warn**, **info**, **debug** - только в консоль

### Production режим  
- ✅ **error**, **fatal** и **warn** - отправляются в error-dashboard
- ❌ **info**, **debug** - только в консоль

```typescript
// Эта ошибка будет отправлена в error-dashboard
await logger.error('Ошибка базы данных', error, { 
  query: 'SELECT * FROM users',
  userId: '123' 
});

// Это предупреждение отправится в error-dashboard только в production
logger.warn('Медленный запрос', { 
  query: 'SELECT * FROM users',
  duration: '5.2s' 
});
```

### Конфигурация

Добавьте в `.env`:
```bash
ERROR_DASHBOARD_URL=http://localhost:3001/api
NODE_ENV=production
```

### Endpoints

- **Worker/Webpush**: `/api/push-logs` (специализированный endpoint)
- **Остальные приложения**: `/api/report` (стандартный endpoint)

## Миграция с существующих логгеров

### Замена console.log

```typescript
// Было
console.log('Пользователь создан:', user);

// Стало
logger.info('Пользователь создан', { userId: user.id });
```

### Замена существующих логгеров

```typescript
// Было
import { createLogger } from '@gafus/types';
const logger = createLogger('auth');

// Стало
import { createWebLogger } from '@gafus/logger';
const logger = createWebLogger('auth');
```

## Производительность

- **Pino** - один из самых быстрых логгеров для Node.js
- **Асинхронная отправка** в error-dashboard не блокирует основной поток
- **Условное логирование** - проверка уровней перед форматированием
- **Минимальные накладные расходы** в production

## Примеры использования

### Логирование в серверных действиях

```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('server-actions');

export async function createUser(data: UserData) {
  try {
    logger.info('Создание пользователя', { email: data.email });
    
    const user = await prisma.user.create({ data });
    
    logger.success('Пользователь создан', { userId: user.id });
    return user;
  } catch (error) {
    logger.error('Ошибка создания пользователя', error, { email: data.email });
    throw error;
  }
}
```

### Логирование в middleware

```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('middleware');

export function authMiddleware(req: NextRequest) {
  logger.debug('Проверка аутентификации', { 
    path: req.nextUrl.pathname,
    method: req.method 
  });
  
  // ... логика middleware
}
```

### Логирование в worker

```typescript
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('push-notifications');

export async function sendPushNotification(userId: string, message: string) {
  try {
    logger.info('Отправка push-уведомления', { userId, message });
    
    // ... логика отправки
    
    logger.success('Push-уведомление отправлено', { userId });
  } catch (error) {
    logger.error('Ошибка отправки push-уведомления', error, { userId });
  }
}
```
