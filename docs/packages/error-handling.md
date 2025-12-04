# @gafus/error-handling - Обработка ошибок

## 📋 Обзор

Пакет `@gafus/error-handling` предоставляет React Error Boundaries для перехвата ошибок в UI-компонентах с автоматической отправкой отчётов в error-dashboard.

## 🎯 Основные функции

- **React Error Boundaries** для перехвата ошибок в UI
- **Автоматическая отправка ошибок** в error-dashboard через `@gafus/logger`
- **Кастомизируемый fallback UI** для отображения ошибок пользователю
- **Контекстная информация** для отладки (component stack, user info, etc.)

## 📦 Установка и использование

### Установка
```bash
pnpm add @gafus/error-handling
```

### Базовое использование
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  return (
    <ErrorBoundary config={{ appName: 'web' }}>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

## 🔧 API Reference

### `ErrorBoundary`

React компонент для перехвата ошибок в дочерних компонентах.

```typescript
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;           // Кастомный UI при ошибке
  config?: ErrorBoundaryConfig;   // Конфигурация
  onError?: (error: Error, errorInfo: ErrorInfo) => void; // Callback при ошибке
}

interface ErrorBoundaryConfig {
  appName: string;           // Название приложения
  environment?: string;      // Окружение (по умолчанию process.env.NODE_ENV)
  logToConsole?: boolean;    // Логировать в консоль (по умолчанию true)
  showErrorDetails?: boolean; // Показывать детали ошибки (по умолчанию false)
}
```

### Примеры

#### Базовое использование
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  return (
    <ErrorBoundary config={{ appName: 'web' }}>
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

#### Кастомный fallback
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function CustomErrorFallback() {
  return (
    <div className="error-container">
      <h2>Что-то пошло не так</h2>
      <button onClick={() => window.location.reload()}>
        Перезагрузить страницу
      </button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary fallback={<CustomErrorFallback />}>
      <MyApp />
    </ErrorBoundary>
  );
}
```

#### Обработка ошибок с callback
```typescript
import { ErrorBoundary } from '@gafus/error-handling';

function App() {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Дополнительная обработка (например, аналитика)
    analytics.track('error_boundary_caught', {
      error: error.message,
      componentStack: errorInfo.componentStack
    });
  };

  return (
    <ErrorBoundary 
      config={{ appName: 'web' }}
      onError={handleError}
    >
      <MyApp />
    </ErrorBoundary>
  );
}
```

### Отправка ошибок напрямую

Для отправки ошибок используйте `logger.error()` из `@gafus/logger`:

```typescript
import { createWebLogger } from '@gafus/logger';

const logger = createWebLogger('my-context');

// Отправка ошибки
await logger.error(
  error.message || 'Unknown error',
  error,
  {
    userId: '123',
    operation: 'save_profile',
    additionalContext: { action: 'save_profile' },
    tags: ['error', 'profile'],
  }
);
```

## 📊 Структура отчётов об ошибках

### ErrorInfo интерфейс
```typescript
interface ErrorInfo {
  componentStack?: string;   // React component stack
  errorBoundaryName?: string; // Название Error Boundary
  appName: string;           // Название приложения
  url: string;              // URL страницы
  userAgent: string;        // User Agent браузера
  timestamp: number;        // Время возникновения
  userId?: string;          // ID пользователя
  sessionId?: string;       // ID сессии
  additionalContext?: Record<string, unknown>; // Дополнительный контекст
}
```

## 🔧 Структура пакета

```
packages/error-handling/
├── src/
│   ├── react/
│   │   └── ErrorBoundary.tsx   # React Error Boundary
│   └── index.ts               # Экспорты
├── package.json
└── tsconfig.json
```

## 📦 Зависимости

- `@gafus/logger` — логирование
- `@gafus/types` — общие типы
- `react`, `react-dom` — React runtime

## 🎯 Рекомендации по использованию

1. **Оборачивайте корневой компонент** в ErrorBoundary для глобального перехвата
2. **Используйте несколько ErrorBoundary** для изоляции секций (чтобы ошибка в одной части не ломала всё приложение)
3. **Настройте appName** для правильной группировки ошибок в dashboard
4. **Используйте onError callback** для интеграции с аналитикой

---

*Для логирования и серверной обработки ошибок используйте `@gafus/logger`.*
