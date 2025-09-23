# Конфигурация для отправки логов в error-dashboard

## Переменные окружения

Добавьте в ваш `.env` файл:

```bash
# URL error-dashboard для отправки логов
ERROR_DASHBOARD_URL=http://localhost:3001/api

# Окружение (development, production, test)
NODE_ENV=production
```

## Что отправляется в error-dashboard

### Development режим
- ✅ **error** - критические ошибки
- ✅ **fatal** - фатальные ошибки
- ❌ **warn** - предупреждения (только в консоль)
- ❌ **info** - информационные сообщения (только в консоль)
- ❌ **debug** - отладочная информация (только в консоль)

### Production режим
- ✅ **error** - критические ошибки
- ✅ **fatal** - фатальные ошибки
- ✅ **warn** - предупреждения (важно для мониторинга!)
- ❌ **info** - информационные сообщения (только в консоль)
- ❌ **debug** - отладочная информация (отключено)

## Endpoints error-dashboard

### `/api/report` - для обычных ошибок
Используется для:
- web
- trainer-panel
- telegram-bot
- error-dashboard (отключено)

### `/api/push-logs` - для push-уведомлений
Используется для:
- worker
- webpush сервисы (webpush-service, device-manager)
- queues (redis-connection)
- types (worker-processor, queue-* контексты)
- error-handling (worker-* контексты)
- csrf (worker-* контексты)
- auth (worker-* контексты)
- react-query (worker-* контексты)
- prisma (worker-* контексты)
- telegram-bot (worker-* контексты)
- bull-board (worker-* контексты)

## Примеры логов в error-dashboard

### Bull Board ошибка (bull-board)
```json
{
  "message": "Ошибка при создании Bull Board",
  "context": "bull-board",
  "service": "bull-board",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "bull-board",
  "environment": "production",
  "stack": "Error: Queue adapter failed\n    at createBullBoard...",
  "additionalContext": {
    "environment": "production",
    "port": 3004,
    "operation": "create_bull_board",
    "error": {
      "name": "Error",
      "message": "Queue adapter failed",
      "stack": "..."
    }
  },
  "tags": ["error", "bull-board"]
}
```

### Telegram Bot ошибка (telegram-bot)
```json
{
  "message": "Bot error",
  "context": "telegram-bot",
  "service": "telegram-bot",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "telegram-bot",
  "environment": "production",
  "stack": "Error: Webhook validation failed\n    at Bot.catch...",
  "additionalContext": {
    "chatId": 123456789,
    "userId": 987654321,
    "username": "testuser",
    "messageType": "text",
    "updateId": 12345,
    "error": {
      "name": "Error",
      "message": "Webhook validation failed",
      "stack": "..."
    }
  },
  "tags": ["error", "telegram-bot"]
}
```

### Prisma ошибка (web)
```json
{
  "message": "Database connection failed",
  "context": "prisma-client",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: Connection timeout\n    at PrismaClient.connect...",
  "additionalContext": {
    "databaseUrl": "postgresql://user:pass@localhost:5432/db",
    "environment": "production",
    "retryCount": 3,
    "error": {
      "name": "Error",
      "message": "Connection timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "prisma-client"]
}
```

### React-Query ошибка (web)
```json
{
  "message": "React Query fetch failed",
  "context": "react-query-optimized",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: Network timeout\n    at fetchCoursesData...",
  "additionalContext": {
    "queryKey": "courses-list",
    "dataType": "courses",
    "strategy": "courses",
    "retryCount": 3,
    "error": {
      "name": "Error",
      "message": "Network timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "react-query-optimized"]
}
```

### Auth ошибка (web)
```json
{
  "message": "Telegram ID не найден для пользователя",
  "context": "auth-telegram",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: User not found\n    at sendTelegramPasswordResetRequest...",
  "additionalContext": {
    "username": "testuser",
    "hasUser": false,
    "hasTelegramId": false,
    "error": {
      "name": "Error",
      "message": "User not found",
      "stack": "..."
    }
  },
  "tags": ["error", "auth-telegram"]
}
```

### CSRF ошибка (web)
```json
{
  "message": "Error generating CSRF token",
  "context": "csrf-utils",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: Crypto module failed\n    at generateCSRFToken...",
  "additionalContext": {
    "secretSize": 32,
    "saltSize": 16,
    "error": {
      "name": "Error",
      "message": "Crypto module failed",
      "stack": "..."
    }
  },
  "tags": ["error", "csrf-utils"]
}
```

### Error-handling ошибка (web)
```json
{
  "message": "Failed to load user data",
  "context": "error-handling-web-app",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: Network timeout\n    at fetchUserData...",
  "additionalContext": {
    "userId": "user-123",
    "endpoint": "/api/user",
    "retryCount": 3,
    "error": {
      "name": "Error",
      "message": "Network timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "error-handling-web-app"]
}
```

### Types ошибка (web)
```json
{
  "message": "Failed to load user data",
  "context": "web-client",
  "service": "web",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "web",
  "environment": "production",
  "stack": "Error: Network timeout\n    at fetchUserData...",
  "additionalContext": {
    "userId": "user-123",
    "endpoint": "/api/user",
    "retryCount": 3,
    "error": {
      "name": "Error",
      "message": "Network timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "web-client"]
}
```

### Queues ошибка
```json
{
  "message": "Redis connection error",
  "context": "redis-connection",
  "service": "worker",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "worker",
  "environment": "production",
  "stack": "Error: ECONNREFUSED\n    at RedisConnection...",
  "additionalContext": {
    "url": "redis://localhost:6379",
    "errorCode": "ECONNREFUSED",
    "errno": -61,
    "error": {
      "name": "Error",
      "message": "ECONNREFUSED",
      "stack": "..."
    }
  },
  "tags": ["error", "redis-connection"]
}
```

### Webpush ошибка
```json
{
  "message": "Failed to send push notification",
  "context": "webpush-service",
  "service": "webpush-service",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "worker",
  "environment": "production",
  "stack": "Error: WebPush API error\n    at sendNotification...",
  "additionalContext": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "userId": "user-123",
    "notificationId": "notif-456",
    "retryCount": 3,
    "error": {
      "name": "Error",
      "message": "WebPush API error",
      "stack": "..."
    }
  },
  "tags": ["error", "webpush-service"]
}
```

### Worker ошибка
```json
{
  "message": "Failed to fetch notification",
  "context": "notification-processor",
  "service": "worker",
  "level": "error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "appName": "worker",
  "environment": "production",
  "stack": "Error: Connection timeout\n    at fetchNotification...",
  "additionalContext": {
    "notificationId": "notif-123",
    "error": {
      "name": "Error",
      "message": "Connection timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "notification-processor"]
}
```

### Web приложение ошибка
```json
{
  "message": "Database connection failed",
  "stack": "Error: Connection timeout\n    at connect...",
  "appName": "web",
  "environment": "production",
  "url": "/logger",
  "userAgent": "logger-service",
  "userId": null,
  "sessionId": null,
  "componentStack": null,
  "additionalContext": {
    "context": "database",
    "level": "error",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "error": {
      "name": "Error",
      "message": "Connection timeout",
      "stack": "..."
    }
  },
  "tags": ["error", "database"]
}
```

## Мониторинг в production

### Что важно отслеживать:

1. **Error уровень** - критические ошибки, требующие немедленного внимания
2. **Fatal уровень** - фатальные ошибки, останавливающие работу
3. **Warn уровень** - предупреждения, которые могут стать проблемами

### Настройка алертов:

Рекомендуется настроить уведомления для:
- Новые ошибки уровня `error` или `fatal`
- Резкое увеличение количества `warn` сообщений
- Ошибки от критических сервисов (worker, web)

## Тестирование

### Проверка bull-board логов:

```typescript
import { createBullBoardLogger } from '@gafus/logger';

// Bull Board использует один логгер для всех операций
const boardLogger = createBullBoardLogger('bull-board');

// Bull Board ошибки отправляются в /api/report
await boardLogger.error('Ошибка при создании Bull Board', new Error('Queue adapter failed'), {
  environment: 'production',
  port: 3004,
  operation: 'create_bull_board'
});

// Info сообщения о инициализации
boardLogger.info('Bull-Board initializing', {
  environment: 'production',
  port: 3004,
  basePath: '/admin/queues'
});

// Success сообщения о создании Bull Board
boardLogger.success('Bull Board created successfully', {
  queueCount: 1,
  queueName: 'pushQueue',
  basePath: '/admin/queues',
  operation: 'create_bull_board'
});

// Success сообщения о запуске сервера
boardLogger.success('Bull-Board запущен: http://localhost:3004/admin/queues', {
  port: 3004,
  environment: 'production',
  basePath: '/admin/queues',
  operation: 'start_server'
});

// Health check info сообщения
boardLogger.info('Health check requested', {
  timestamp: new Date().toISOString(),
  operation: 'health_check'
});

// Graceful shutdown info сообщения
boardLogger.info('Received SIGINT, shutting down gracefully');

// Queue connection ошибки
await boardLogger.error('Queue connection failed', new Error('Redis connection timeout'), {
  queueName: 'pushQueue',
  operation: 'connect_queue',
  retryCount: 3
});

// Express server ошибки
await boardLogger.error('Express server error', new Error('Port already in use'), {
  port: 3004,
  environment: 'production',
  operation: 'start_server'
});

// Bull Board API ошибки
await boardLogger.error('Bull Board API error', new Error('Invalid queue configuration'), {
  queueCount: 1,
  queueName: 'pushQueue',
  operation: 'configure_queues'
});

// Queue monitoring предупреждения (только в production)
boardLogger.warn('Queue monitoring disabled', {
  queueName: 'pushQueue',
  reason: 'Redis connection unstable',
  operation: 'monitor_queue'
});

// Route access info сообщения
boardLogger.info('Bull Board route accessed', {
  path: '/admin/queues',
  method: 'GET',
  userAgent: 'Mozilla/5.0',
  operation: 'access_dashboard'
});

// Job processing success сообщения
boardLogger.success('Queue job processed successfully', {
  queueName: 'pushQueue',
  jobId: 'job-123',
  jobType: 'push_notification',
  duration: 150,
  operation: 'process_job'
});

// Configuration update info сообщения
boardLogger.info('Bull Board configuration updated', {
  queueCount: 2,
  queueNames: ['pushQueue', 'emailQueue'],
  basePath: '/admin/queues',
  operation: 'update_configuration'
});

// Queue statistics success сообщения
boardLogger.success('Queue statistics retrieved', {
  queueName: 'pushQueue',
  activeJobs: 5,
  completedJobs: 150,
  failedJobs: 2,
  operation: 'get_statistics'
});

// Middleware ошибки
await boardLogger.error('Bull Board middleware error', new Error('Authentication failed'), {
  path: '/admin/queues',
  method: 'GET',
  operation: 'middleware_auth'
});

// Queue cleanup success сообщения
boardLogger.success('Queue cleanup completed', {
  queueName: 'pushQueue',
  cleanedJobs: 25,
  operation: 'cleanup_queue'
});

// Performance предупреждения (только в production)
boardLogger.warn('Bull Board performance degraded', {
  responseTime: 5000,
  threshold: 1000,
  queueCount: 1,
  operation: 'performance_check'
});
```

### Проверка telegram-bot логов:

```typescript
import { createTelegramBotLogger } from '@gafus/logger';

// Telegram Bot использует один логгер для всех операций
const botLogger = createTelegramBotLogger('telegram-bot');

// Bot ошибки отправляются в /api/report
await botLogger.error('Bot error', new Error('Webhook validation failed'), {
  chatId: 123456789,
  userId: 987654321,
  username: 'testuser',
  messageType: 'text',
  updateId: 12345
});

// Info сообщения о инициализации бота
botLogger.info('Telegram bot initializing', {
  environment: 'production',
  hasToken: true,
  tokenLength: 45
});

// Success сообщения о запуске бота
botLogger.success('Telegram bot launched successfully', {
  environment: 'production',
  botUsername: 'gafus_bot'
});

// Warning сообщения о пользователях
botLogger.warn('Пользователь с номером не найден в базе данных', {
  chatId: 123456789,
  phone: '+79198031371',
  operation: 'find_user_by_phone'
});

// Success сообщения о подтверждении пользователей
botLogger.success('Пользователь успешно подтвержден через Telegram', {
  chatId: 123456789,
  phone: '+79198031371',
  userId: 'user-123',
  username: 'testuser',
  operation: 'confirm_user_telegram'
});

// Database ошибки
await botLogger.error('Ошибка при обновлении пользователя', new Error('Database connection timeout'), {
  chatId: 123456789,
  phone: '+79198031371',
  hasUser: true,
  operation: 'update_user_telegram_id'
});

// Fatal ошибки запуска
await botLogger.fatal('Failed to launch Telegram bot', new Error('Invalid bot token'), {
  environment: 'production',
  hasToken: false
});

// Fatal ошибки отсутствия токена
await botLogger.fatal('TELEGRAM_BOT_TOKEN не задан в переменных окружения', new Error('Missing Telegram Bot Token'), {
  environment: 'production',
  hasToken: false
});

// Info сообщения о graceful shutdown
botLogger.info('Received SIGINT, stopping bot gracefully');

// Message processing ошибки
await botLogger.error('Message processing failed', new Error('Invalid message format'), {
  chatId: 123456789,
  userId: 987654321,
  messageType: 'unknown',
  updateId: 12346
});

// Webhook ошибки
await botLogger.error('Webhook validation failed', new Error('Invalid webhook signature'), {
  chatId: 123456789,
  userId: 987654321,
  messageType: 'webhook',
  updateId: 12347
});

// Rate limit предупреждения (только в production)
botLogger.warn('Rate limit exceeded for user', {
  chatId: 123456789,
  userId: 987654321,
  username: 'testuser',
  operation: 'send_message',
  retryAfter: 60
});

// Contact processing success сообщения
botLogger.success('Contact processed successfully', {
  chatId: 123456789,
  phone: '+79198031371',
  userId: 'user-123',
  username: 'testuser',
  operation: 'process_contact'
});

// Database connection ошибки
await botLogger.error('Database connection failed', new Error('Connection pool exhausted'), {
  chatId: 123456789,
  phone: '+79198031371',
  operation: 'find_user_by_phone',
  retryCount: 3
});

// Bot info update сообщения
botLogger.info('Bot info updated successfully', {
  botUsername: 'gafus_bot',
  botId: 123456789,
  environment: 'production'
});

// Message sent success сообщения
botLogger.success('Message sent successfully', {
  chatId: 123456789,
  userId: 987654321,
  messageType: 'confirmation',
  operation: 'send_confirmation_message'
});
```

### Проверка prisma логов:

```typescript
import { createWebLogger } from '@gafus/logger';

// Prisma Client использует один логгер для всех операций с БД
const clientLogger = createWebLogger('prisma-client');

// Prisma Seed использует отдельный логгер для операций сидирования
const seedLogger = createWebLogger('prisma-seed');

// Prisma ошибки отправляются в /api/report
await clientLogger.error('Database connection failed', new Error('Connection timeout'), {
  databaseUrl: 'postgresql://user:pass@localhost:5432/db',
  environment: 'production',
  retryCount: 3
});

// Info сообщения о инициализации клиента
clientLogger.info('Prisma client initialized', {
  databaseUrl: 'configured',
  environment: 'production',
  logLevel: 'error'
});

// Success сообщения о операциях сидирования
seedLogger.success('Админ создан или найден', {
  username: 'admin',
  phone: '+79198031371',
  role: 'ADMIN',
  isConfirmed: true
});

// Query ошибки
await clientLogger.error('Query execution failed', new Error('Invalid query syntax'), {
  query: 'SELECT * FROM users WHERE',
  table: 'users',
  operation: 'SELECT'
});

// Migration ошибки
await clientLogger.error('Migration failed', new Error('Schema validation error'), {
  migrationName: 'add_user_table',
  environment: 'production',
  schemaChanges: ['CREATE TABLE users']
});

// Seed ошибки
await seedLogger.error('Ошибка при сидировании', new Error('Foreign key constraint violation'), {
  environment: 'production',
  databaseUrl: 'configured',
  operation: 'create_admin'
});

// Transaction ошибки
await clientLogger.error('Transaction rollback', new Error('Deadlock detected'), {
  transactionId: 'tx-123',
  operations: ['create_user', 'create_course'],
  retryCount: 2
});

// Connection pool предупреждения (только в production)
clientLogger.warn('Connection pool exhausted', {
  activeConnections: 10,
  maxConnections: 10,
  pendingQueries: 5,
  environment: 'production'
});

// Slow query предупреждения (только в production)
clientLogger.warn('Slow query detected', {
  query: 'SELECT * FROM users WHERE created_at > ?',
  duration: 5000,
  threshold: 1000,
  table: 'users'
});

// Cache hit success сообщения
clientLogger.success('Query cache hit', {
  query: 'SELECT * FROM courses WHERE type = ?',
  cacheKey: 'courses-home',
  duration: 5,
  table: 'courses'
});
```

### Проверка react-query логов:

```typescript
import { createWebLogger } from '@gafus/logger';

// React Query использует один логгер для всех оптимизированных хуков
const optimizedLogger = createWebLogger('react-query-optimized');

// React Query ошибки отправляются в /api/report
await optimizedLogger.error('React Query fetch failed', new Error('Network timeout'), {
  queryKey: 'courses-list',
  dataType: 'courses',
  strategy: 'courses',
  retryCount: 3
});

// Info сообщения о загрузке данных (только в development)
optimizedLogger.info('Courses loaded: courses-list', {
  dataType: 'courses',
  key: 'courses-list',
  hasData: true,
  strategy: 'courses'
});

// Cache miss предупреждения (только в production)
optimizedLogger.warn('Cache miss for query', {
  queryKey: 'user-profile-456',
  dataType: 'user-profile',
  strategy: 'user-profile',
  cacheAge: 0
});

// Query success сообщения
optimizedLogger.success('Query completed successfully', {
  queryKey: 'statistics-summary',
  dataType: 'statistics',
  strategy: 'statistics',
  duration: '150ms',
  dataSize: '2.5KB'
});

// Stale data предупреждения (только в production)
optimizedLogger.warn('Stale data detected', {
  queryKey: 'search-results',
  dataType: 'search',
  strategy: 'search',
  staleTime: 1000,
  lastUpdated: Date.now() - 5000
});
```

### Проверка auth логов:

```typescript
import { createWebLogger } from '@gafus/logger';

// Разные компоненты Auth используют разные логгеры
const telegramLogger = createWebLogger('auth-telegram');
const ownerLogger = createWebLogger('auth-owner-check');

// Auth Telegram ошибки отправляются в /api/report
await telegramLogger.error('Telegram ID не найден для пользователя', new Error('User not found'), {
  username: 'testuser',
  hasUser: false,
  hasTelegramId: false
});

// Auth Owner Check ошибки отправляются в /api/report
await ownerLogger.error('Error in getIsOwner', new Error('Session validation failed'), {
  profileUsername: 'testuser',
  hasReq: true,
  hasQueryUsername: false
});

// Telegram Bot Token ошибки отправляются в /api/report
await telegramLogger.error('TELEGRAM_BOT_TOKEN не задан', new Error('Missing bot token'), {
  hasBotToken: false,
  environment: 'production'
});

// Telegram API ошибки отправляются в /api/report
await telegramLogger.error('Не удалось отправить сообщение в Telegram', new Error('HTTP 400: Bad Request'), {
  status: 400,
  statusText: 'Bad Request',
  responseBody: '{"error_code":400,"description":"Bad Request: chat not found"}',
  username: 'testuser',
  telegramId: '123456789'
});

// Повторный запрос предупреждения (только в production)
telegramLogger.warn('Повторный запрос слишком рано', {
  username: 'testuser',
  timeSinceLastRequest: 30000,
  minInterval: 60000
});
```

### Проверка csrf логов:

```typescript
import { createWebLogger } from '@gafus/logger';

// Разные компоненты CSRF используют разные логгеры
const utilsLogger = createWebLogger('csrf-utils');
const storeLogger = createWebLogger('csrf-store');
const providerLogger = createWebLogger('csrf-provider');
const middlewareLogger = createWebLogger('csrf-middleware');

// CSRF Utils ошибки отправляются в /api/report
await utilsLogger.error('Error generating CSRF token', new Error('Crypto failed'), {
  secretSize: 32,
  saltSize: 16
});

// CSRF Store ошибки отправляются в /api/report
await storeLogger.error('Ошибка при получении CSRF токена', new Error('Network timeout'), {
  retryCount: 3
});

// CSRF Provider ошибки отправляются в /api/report
await providerLogger.error('CSRF Provider initialization failed', new Error('Token validation failed'), {
  retryCount: 2,
  maxRetries: 5
});

// CSRF Middleware ошибки отправляются в /api/report
await middlewareLogger.error('Error verifying CSRF token', new Error('Token mismatch'), {
  method: 'POST',
  url: '/api/data'
});

// CSRF Attack Attempt предупреждения (только в production)
middlewareLogger.warn('CSRF Attack Attempt', {
  ip: '192.168.1.100',
  method: 'POST',
  url: '/api/sensitive-data',
  reason: 'Invalid CSRF token'
});
```

### Проверка error-handling логов:

```typescript
import { createLogger, ErrorReporter } from '@gafus/error-handling';

// Автоматически определяет тип приложения по имени
const webLogger = createLogger('web-app', 'production');
const workerLogger = createLogger('worker-app', 'production');
const dashboardLogger = createLogger('error-dashboard-app', 'production');

// Web ошибки отправляются в /api/report
await webLogger.error('Failed to load data', new Error('Network error'), {
  endpoint: '/api/data',
  userId: 'user-123'
});

// Worker ошибки отправляются в /api/push-logs
await workerLogger.error('Failed to process job', new Error('Queue error'), {
  jobId: 'job-456',
  queueName: 'notifications'
});

// Error-dashboard ошибки НЕ отправляются в себя
await dashboardLogger.error('Failed to process report', new Error('Invalid JSON'), {
  reportId: 'report-123'
});

// ErrorReporter класс
const errorReporter = new ErrorReporter({
  appName: 'my-app',
  environment: 'production'
});

await errorReporter.reportError(new Error('Test error'), {
  componentStack: 'Component -> ErrorBoundary',
  errorBoundaryName: 'MyErrorBoundary',
  appName: 'my-app',
  url: 'http://localhost:3000/test',
  userAgent: 'Mozilla/5.0...',
  timestamp: Date.now()
});
```

### Проверка types логов:

```typescript
import { createLogger } from '@gafus/types';

// Автоматически определяет тип приложения по контексту
const webLogger = createLogger('web-client');
const trainerLogger = createLogger('trainer-panel');
const workerLogger = createLogger('worker-processor');

// Web ошибки отправляются в /api/report
await webLogger.error('Failed to load data', new Error('Network error'), {
  endpoint: '/api/data',
  userId: 'user-123'
});

// Worker ошибки отправляются в /api/push-logs
await workerLogger.error('Failed to process job', new Error('Queue error'), {
  jobId: 'job-456',
  queueName: 'notifications'
});

// Trainer panel ошибки отправляются в /api/report
await trainerLogger.error('Failed to save training', new Error('Validation error'), {
  trainingId: 'training-789'
});
```

### Проверка queues логов:

```typescript
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('redis-connection');

// Эта ошибка должна появиться в error-dashboard push-logs
await logger.error("Redis connection error", new Error("ECONNREFUSED"), {
  url: 'redis://localhost:6379',
  errorCode: 'ECONNREFUSED',
  errno: -61
});

// Это предупреждение появится в error-dashboard только в production
logger.warn("Redis connection closed", {
  url: 'redis://localhost:6379',
  reason: 'Client disconnected'
});
```

### Проверка webpush логов:

```typescript
import { createWorkerLogger } from '@gafus/logger';

const serviceLogger = createWorkerLogger('webpush-service');
const deviceLogger = createWorkerLogger('device-manager');

// Эта ошибка должна появиться в error-dashboard push-logs
await serviceLogger.error('Failed to send push notification', new Error('WebPush API error'), {
  endpoint: 'https://fcm.googleapis.com/fcm/send/...',
  userId: 'user-123',
  notificationId: 'notif-456'
});

// Это предупреждение появится в error-dashboard только в production
deviceLogger.warn('Failed to save to localStorage', {
  operation: 'save',
  deviceCount: 5
});
```

### Проверка отправки логов:

```typescript
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('test');

// Эта ошибка должна появиться в error-dashboard
await logger.error('Test error for dashboard', new Error('Test error'), {
  testId: 'test-123',
  timestamp: new Date().toISOString()
});

// Это предупреждение появится в error-dashboard только в production
logger.warn('Test warning for dashboard', {
  testId: 'test-456'
});
```

### Проверка в error-dashboard:

1. Откройте error-dashboard: `http://localhost:3001`
2. Перейдите в раздел "Push Logs" для worker логов
3. Перейдите в раздел "Errors" для остальных логов
4. Найдите ваши тестовые логи по тегам или контексту
