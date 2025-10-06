# @gafus/error-handling - Обработка ошибок

## 📋 Обзор

Пакет `@gafus/error-handling` предоставляет централизованную систему обработки ошибок для всех приложений в экосистеме GAFUS, включая React Error Boundaries, серверную обработку ошибок и интеграцию с системой мониторинга.

## 🎯 Основные функции

### Централизованная обработка ошибок
- **React Error Boundaries** для перехвата ошибок в UI
- **Серверная обработка ошибок** для API endpoints
- **Автоматическая отправка ошибок** в error-dashboard
- **Контекстная информация** для отладки

### Мониторинг и отчетность
- **Структурированные отчеты об ошибках** с метаданными
- **Интеграция с системой логирования**
- **Метрики производительности** и ошибок
- **Алертинг** при критических ошибках

## 📦 Установка и использование

### Установка
```bash
pnpm add @gafus/error-handling
```

### Базовое использование
```typescript
import { ErrorBoundary, ErrorReporter } from '@gafus/error-handling';

// В React компоненте
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// В API route
try {
  // API логика
} catch (error) {
  ErrorReporter.report(error, { context: 'API' });
}
```

## 🔧 API Reference

### Основные компоненты

#### `ErrorReporter`
Основной класс для отправки отчетов об ошибках.

```typescript
import { ErrorReporter } from '@gafus/error-handling';

// Отправка ошибки с контекстом
ErrorReporter.report(error, {
  userId: '123',
  sessionId: 'session_456',
  component: 'UserProfile',
  action: 'loadData'
});
```

#### `ErrorBoundary`
React компонент для перехвата ошибок в UI.

```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  return (
    <ErrorBoundary
      fallback={<ErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('Error caught by boundary:', error);
      }}
    >
      <MyApp />
    </ErrorBoundary>
  );
}
```

### Серверные утилиты

#### `logger`
Серверный логгер для обработки ошибок.

```typescript
import { logger } from '@gafus/error-handling';

// Логирование ошибки на сервере
logger.error('Database connection failed', {
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
});
```

#### `metrics`
Система метрик для отслеживания ошибок.

```typescript
import { metrics } from '@gafus/error-handling';

// Увеличение счетчика ошибок
metrics.incrementError('database_error');

// Запись времени выполнения
metrics.recordDuration('api_request', 150);
```

## 🎯 React Error Boundaries

### Базовое использование
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
```

### Кастомный fallback
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function CustomErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="error-container">
      <h2>Что-то пошло не так</h2>
      <p>Произошла ошибка: {error.message}</p>
      <button onClick={resetError}>Попробовать снова</button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary fallback={CustomErrorFallback}>
      <MyApp />
    </ErrorBoundary>
  );
}
```

### Обработка ошибок
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Отправка в систему мониторинга
    ErrorReporter.report(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: errorInfo.errorBoundary
    });
    
    // Логирование для разработки
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught:', error, errorInfo);
    }
  };

  return (
    <ErrorBoundary onError={handleError}>
      <MyApp />
    </ErrorBoundary>
  );
}
```

## 🔧 Серверная обработка ошибок

### В API routes
```typescript
import { ErrorReporter, logger } from '@gafus/error-handling';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // API логика
    const result = await processRequest(req);
    res.json({ success: true, data: result });
  } catch (error) {
    // Логирование ошибки
    logger.error('API Error', {
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack
    });

    // Отправка в систему мониторинга
    ErrorReporter.report(error, {
      context: 'API',
      method: req.method,
      url: req.url,
      userId: req.user?.id
    });

    // Ответ клиенту
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
}
```

### В Server Actions
```typescript
import { ErrorReporter } from '@gafus/error-handling';

export async function createUser(formData: FormData) {
  try {
    const userData = {
      username: formData.get('username') as string,
      email: formData.get('email') as string
    };

    const user = await prisma.user.create({ data: userData });
    return { success: true, user };
  } catch (error) {
    ErrorReporter.report(error, {
      context: 'ServerAction',
      action: 'createUser',
      input: formData
    });

    throw new Error('Failed to create user');
  }
}
```

## 📊 Структура отчетов об ошибках

### ErrorInfo интерфейс
```typescript
interface ErrorInfo {
  message: string;           // Сообщение об ошибке
  stack?: string;           // Stack trace
  componentStack?: string;  // React component stack
  errorBoundary?: string;   // Название Error Boundary
  errorId?: string;         // Уникальный ID ошибки
  timestamp: Date;          // Время возникновения
  userId?: string;          // ID пользователя
  sessionId?: string;       // ID сессии
  url?: string;            // URL страницы
  userAgent?: string;      // User Agent браузера
  additionalContext?: any; // Дополнительный контекст
}
```

### Контекстная информация
```typescript
// Отправка ошибки с полным контекстом
ErrorReporter.report(error, {
  userId: 'user_123',
  sessionId: 'session_456',
  component: 'UserProfile',
  action: 'loadUserData',
  props: { userId: 'user_123' },
  state: { isLoading: true },
  url: window.location.href,
  userAgent: navigator.userAgent,
  timestamp: new Date().toISOString()
});
```

## 🔍 Мониторинг и метрики

### Счетчики ошибок
```typescript
import { metrics } from '@gafus/error-handling';

// Увеличение счетчика ошибок по типу
metrics.incrementError('validation_error');
metrics.incrementError('database_error');
metrics.incrementError('api_error');

// Увеличение счетчика ошибок по компоненту
metrics.incrementComponentError('UserProfile');
metrics.incrementComponentError('CourseList');
```

### Метрики производительности
```typescript
import { metrics } from '@gafus/error-handling';

// Запись времени выполнения
const timer = metrics.startTimer('api_request');
try {
  await apiCall();
} finally {
  timer.end();
}

// Запись размера данных
metrics.recordDataSize('user_profile', 1024); // bytes
metrics.recordDataSize('course_list', 2048);
```

## 🎯 Специализированное использование

### Обработка ошибок в формах
```typescript
import { ErrorReporter } from '@gafus/error-handling';

function UserForm() {
  const handleSubmit = async (data: FormData) => {
    try {
      await submitUser(data);
    } catch (error) {
      ErrorReporter.report(error, {
        context: 'Form',
        formName: 'UserForm',
        formData: data,
        validationErrors: error.validationErrors
      });
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Обработка ошибок в хуках
```typescript
import { ErrorReporter } from '@gafus/error-handling';

function useUserData(userId: string) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUser(userId)
      .then(setUser)
      .catch(error => {
        ErrorReporter.report(error, {
          context: 'Hook',
          hookName: 'useUserData',
          userId
        });
        setError(error);
      });
  }, [userId]);

  return { user, error };
}
```

### Обработка ошибок в фоновых задачах
```typescript
import { ErrorReporter, logger } from '@gafus/error-handling';

export async function processNotification(job: Job) {
  try {
    await sendNotification(job.data);
    logger.info('Notification sent successfully', { jobId: job.id });
  } catch (error) {
    logger.error('Failed to send notification', {
      jobId: job.id,
      error: error.message
    });

    ErrorReporter.report(error, {
      context: 'BackgroundJob',
      jobType: 'notification',
      jobId: job.id,
      jobData: job.data
    });

    throw error; // Повторная обработка задачи
  }
}
```

## 🧪 Тестирование

### Тестирование Error Boundary
```typescript
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@gafus/error-handling';

function ThrowError() {
  throw new Error('Test error');
}

test('ErrorBoundary catches errors', () => {
  render(
    <ErrorBoundary fallback={<div>Error occurred</div>}>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText('Error occurred')).toBeInTheDocument();
});
```

### Мокирование ErrorReporter
```typescript
import { ErrorReporter } from '@gafus/error-handling';

const mockReport = jest.fn();
jest.mock('@gafus/error-handling', () => ({
  ErrorReporter: {
    report: mockReport
  }
}));

test('should report errors', async () => {
  try {
    throw new Error('Test error');
  } catch (error) {
    ErrorReporter.report(error);
    expect(mockReport).toHaveBeenCalledWith(error);
  }
});
```

## 🔧 Разработка

### Структура пакета
```
packages/error-handling/
├── src/
│   ├── core/
│   │   ├── ErrorReporter.ts    # Основной класс для отчетов
│   │   ├── logger.ts           # Серверный логгер
│   │   └── metrics.ts          # Система метрик
│   ├── react/
│   │   └── ErrorBoundary.tsx   # React Error Boundary
│   ├── index.ts               # Главный экспорт
│   └── types.ts               # Типы
├── package.json
└── tsconfig.json
```

### Зависимости
- `@gafus/types` - Общие типы
- `@gafus/logger` - Логирование

## 🚀 Конфигурация

### Переменные окружения
```env
# Error Dashboard
ERROR_DASHBOARD_ENDPOINT=http://localhost:3000/api/report
ERROR_DASHBOARD_API_KEY=your-api-key

# Обработка ошибок
ENABLE_ERROR_REPORTING=true
ERROR_SAMPLE_RATE=1.0  # Процент ошибок для отправки (0.0-1.0)
```

### Конфигурация ErrorReporter
```typescript
import { ErrorReporter } from '@gafus/error-handling';

ErrorReporter.configure({
  endpoint: process.env.ERROR_DASHBOARD_ENDPOINT,
  apiKey: process.env.ERROR_DASHBOARD_API_KEY,
  sampleRate: parseFloat(process.env.ERROR_SAMPLE_RATE || '1.0'),
  enableReporting: process.env.ENABLE_ERROR_REPORTING === 'true'
});
```

---

*Пакет @gafus/error-handling обеспечивает надежную и централизованную обработку ошибок для всей экосистемы GAFUS.*
