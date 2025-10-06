# @gafus/logger - Система логирования

## 📋 Обзор

Пакет `@gafus/logger` предоставляет единую систему логирования для всех приложений в экосистеме GAFUS с интеграцией в error-dashboard для централизованного сбора и мониторинга логов.

## 🎯 Основные функции

### Централизованное логирование
- **Единый интерфейс** для всех приложений
- **Структурированные логи** в JSON формате
- **Интеграция с error-dashboard** для мониторинга
- **Различные уровни логирования** (debug, info, warn, error)

### Специализированные логгеры
- **Web Logger** - для веб-приложения
- **Trainer Panel Logger** - для панели тренера
- **Telegram Bot Logger** - для бота
- **Worker Logger** - для фоновых задач
- **Error Dashboard Logger** - для мониторинга ошибок

## 📦 Установка и использование

### Установка
```bash
pnpm add @gafus/logger
```

### Базовое использование
```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('my-app');

logger.info('Application started');
logger.error('Something went wrong', { userId: '123' });
```

## 🔧 API Reference

### Основные классы

#### `UnifiedLogger`
Основной класс логгера с поддержкой различных транспортов.

```typescript
import { UnifiedLogger } from '@gafus/logger';

const logger = new UnifiedLogger({
  appName: 'web-app',
  environment: 'development',
  level: 'info'
});

logger.info('User logged in', { userId: '123' });
logger.error('Database error', { error: error.message });
```

#### `LoggerFactory`
Фабрика для создания специализированных логгеров.

```typescript
import { LoggerFactory } from '@gafus/logger';

const logger = LoggerFactory.createWebLogger('my-app');
```

### Специализированные логгеры

#### `createWebLogger(appName: string)`
Создает логгер для веб-приложения.

```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('web-app');
logger.info('Page loaded', { route: '/dashboard' });
```

#### `createTrainerPanelLogger(appName: string)`
Создает логгер для панели тренера.

```typescript
import { createTrainerPanelLogger } from '@gafus/logger';

const logger = createTrainerPanelLogger('trainer-panel');
logger.info('Course created', { courseId: '123' });
```

#### `createTelegramBotLogger(appName: string)`
Создает логгер для Telegram бота.

```typescript
import { createTelegramBotLogger } from '@gafus/logger';

const logger = createTelegramBotLogger('telegram-bot');
logger.info('Message sent', { chatId: '456' });
```

#### `createWorkerLogger(appName: string)`
Создает логгер для фоновых задач.

```typescript
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('worker');
logger.info('Job completed', { jobId: '789' });
```

#### `createErrorDashboardLogger(appName: string)`
Создает логгер для error-dashboard.

```typescript
import { createErrorDashboardLogger } from '@gafus/logger';

const logger = createErrorDashboardLogger('error-dashboard');
logger.error('Error collected', { errorId: '101' });
```

### Транспорты

#### `ErrorDashboardTransport`
Транспорт для отправки логов в error-dashboard.

```typescript
import { ErrorDashboardTransport } from '@gafus/logger';

const transport = new ErrorDashboardTransport({
  endpoint: 'http://localhost:3000/api/report',
  appName: 'web-app'
});
```

## 📊 Уровни логирования

### Доступные уровни
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

### Использование уровней
```typescript
logger.debug('Debug information', { data: 'sensitive' });
logger.info('General information', { userId: '123' });
logger.warn('Warning message', { issue: 'minor' });
logger.error('Error occurred', { error: error.message });
```

## 🔧 Конфигурация

### Базовая конфигурация
```typescript
interface LoggerConfig {
  appName: string;           // Название приложения
  environment: Environment;  // Окружение (development, production)
  level: LogLevel;          // Уровень логирования
  enableConsole?: boolean;  // Включить консольный вывод
  enableErrorDashboard?: boolean; // Включить отправку в error-dashboard
}
```

### Расширенная конфигурация
```typescript
interface CreateLoggerOptions extends LoggerConfig {
  transports?: Transport[];  // Дополнительные транспорты
  format?: LogFormat;       // Формат логов
  metadata?: LogMeta;       // Метаданные по умолчанию
}
```

## 🏗️ Структура логов

### Базовый формат лога
```typescript
interface LogEntry {
  timestamp: string;        // Время создания лога
  level: LogLevel;         // Уровень логирования
  appName: string;         // Название приложения
  environment: string;     // Окружение
  message: string;         // Сообщение
  metadata?: LogMeta;      // Дополнительные данные
  stack?: string;          // Stack trace для ошибок
}
```

### Error Dashboard формат
```typescript
interface ErrorDashboardLogEntry extends LogEntry {
  id: string;              // Уникальный ID лога
  userId?: string;         // ID пользователя (если применимо)
  sessionId?: string;      // ID сессии
  url?: string;           // URL страницы
  userAgent?: string;     // User Agent браузера
  componentStack?: string; // React component stack
  additionalContext?: any; // Дополнительный контекст
}
```

## 🎯 Специализированное использование

### Логирование в React компонентах
```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('web-app');

function UserProfile({ userId }: { userId: string }) {
  useEffect(() => {
    logger.info('User profile loaded', { userId });
  }, [userId]);

  return <div>Profile content</div>;
}
```

### Логирование в API routes
```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('web-app');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logger.info('API request', { 
    method: req.method, 
    url: req.url,
    userId: req.user?.id 
  });

  try {
    // API логика
    res.json({ success: true });
  } catch (error) {
    logger.error('API error', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Логирование в фоновых задачах
```typescript
import { createWorkerLogger } from '@gafus/logger';

const logger = createWorkerLogger('notification-worker');

export async function processNotification(job: Job) {
  logger.info('Processing notification job', { 
    jobId: job.id,
    userId: job.data.userId 
  });

  try {
    // Обработка уведомления
    await sendNotification(job.data);
    logger.info('Notification sent successfully', { jobId: job.id });
  } catch (error) {
    logger.error('Failed to send notification', { 
      jobId: job.id,
      error: error.message 
    });
    throw error;
  }
}
```

## 🔍 Мониторинг и анализ

### Централизованный сбор логов
Все логи автоматически отправляются в error-dashboard для:
- Централизованного просмотра
- Анализа ошибок
- Мониторинга производительности
- Алертинга

### Фильтрация логов
```typescript
// Логирование только для production
if (process.env.NODE_ENV === 'production') {
  logger.info('Production log', { data: 'important' });
}

// Условное логирование
logger.debug('Debug info', { data }, { 
  condition: process.env.DEBUG === 'true' 
});
```

## 🧪 Тестирование

### Мокирование логгера
```typescript
import { createWebLogger } from '@gafus/logger';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

jest.mock('@gafus/logger', () => ({
  createWebLogger: () => mockLogger
}));
```

### Тестирование логирования
```typescript
import { createWebLogger } from '@gafus/logger';

describe('Logger', () => {
  it('should log info messages', () => {
    const logger = createWebLogger('test-app');
    logger.info('Test message', { data: 'test' });
    
    // Проверка, что лог был создан
    expect(logger.info).toHaveBeenCalledWith('Test message', { data: 'test' });
  });
});
```

## 🔧 Разработка

### Структура пакета
```
packages/logger/
├── src/
│   ├── UnifiedLogger.ts        # Основной класс логгера
│   ├── LoggerFactory.ts        # Фабрика логгеров
│   ├── logger-types.ts         # Типы и интерфейсы
│   └── transports/
│       └── ErrorDashboardTransport.ts # Транспорт для error-dashboard
├── examples/
│   └── usage.ts               # Примеры использования
├── package.json
└── tsconfig.json
```

### Зависимости
- `pino` - Высокопроизводительный логгер
- `@gafus/types` - Общие типы

## 🚀 Развертывание

### Переменные окружения
```env
# Логирование
LOG_LEVEL=info
ENABLE_CONSOLE_LOGS=true
ENABLE_ERROR_DASHBOARD=true
ERROR_DASHBOARD_ENDPOINT=http://localhost:3000/api/report

# Окружение
NODE_ENV=production
```

### Продакшн настройки
- Установите подходящий уровень логирования
- Настройте ротацию логов
- Мониторьте производительность логирования
- Используйте асинхронное логирование

## 📊 Метрики и производительность

### Оптимизация производительности
- Логирование в асинхронном режиме
- Батчинг логов для error-dashboard
- Условное логирование в зависимости от окружения

### Мониторинг
- Отслеживание количества логов
- Мониторинг размера лог-файлов
- Анализ производительности транспортов

---

*Пакет @gafus/logger обеспечивает надежное и централизованное логирование для всей экосистемы GAFUS.*
