# @gafus/error-handling - Обработка ошибок

## 📋 Обзор

Пакет `@gafus/error-handling` предоставляет React Error Boundaries для перехвата ошибок в UI-компонентах с автоматической отправкой в Tracer.

## 🎯 Основные функции

- **React Error Boundaries** для перехвата ошибок в UI
- **Автоматическая отправка ошибок** в Tracer через `reportClientError`
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
  fallback?: ReactNode; // Кастомный UI при ошибке
  config?: ErrorBoundaryConfig; // Конфигурация
  onError?: (error: Error, errorInfo: ErrorInfo) => void; // Callback при ошибке
}

interface ErrorBoundaryConfig {
  appName: string;
  logToConsole?: boolean;
  showErrorDetails?: boolean;
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

### Ручная отправка клиентских ошибок в Tracer

Для отправки клиентских ошибок используйте `reportClientError`:

```typescript
import { reportClientError } from "@gafus/error-handling";

reportClientError(error, {
  severity: "error",
  userId: "123",
  issueKey: "my-feature",
  keys: { screen: "profile", action: "save" },
});
```

Для серверных ошибок — `logger.error()` из `@gafus/logger` (логи → stdout, ошибки → Tracer).

### Web vs Mobile

| Платформа | Пакет | Импорт |
|----------|-------|--------|
| web, trainer-panel | `@gafus/error-handling` | `import { reportClientError } from "@gafus/error-handling"` |
| mobile (Expo/RN) | кастомный tracer | `import { reportClientError } from "@/shared/lib/tracer"` |

Mobile не использует `@gafus/error-handling` (зависит от react-dom) — реализация в `apps/mobile/src/shared/lib/tracer/`.

### Где используется reportClientError (apps/web)

| issueKey | operations |
|----------|------------|
| VideoPlayerSection | video_thumbnail, video_metadata, video_progress_load, video_progress_save, video_signed_url, video_playback |
| VideoProgress | get, save, getAll, clear, sync |
| OfflineStore | sync, syncVideo, addToQueue, syncAction |
| OfflineDownload | download, segment |
| VideoUrl | signed_url |
| ProfilePets | submit, save, avatar |
| pushStore | push_subscription_setup, push_subscription_remove, push_ensure_active_subscription |
| courseStore | fetch_all_courses, fetch_favorites, fetch_authored, course_store_rehydrate_sync |
| fetchInterceptor | fetch_unexpected (только не-сетевые ошибки, не offline) |
| VideoReport | video_report_load, video_report_camera, video_report_submit, video_report_reset |
| reviewsStore | review_add, review_update, review_delete |

**Mobile** (issueKey): ErrorBoundary, ApiClient, RefreshToken, AuthLogin, AuthRegister, AuthLogout, AuthCheck, ProgressSync, TrainingDay, AccordionStep, OfflineDownload, VideoUrl.

**trainer-panel** (issueKey): NotesDelete, NotesSave, NotesStudentSearch, StepsCreate, DaysCreate, CourseFormSubmit, CourseMediaUpload, StepImageUpload, TrainerVideoSignedUrl, TrainerVideoUpload, ExamResultsAction, StatisticsUserLoad, StatisticsDeleteCourse, StatisticsLoad, UserSearch, MainPanelPendingExams, AIChatWidget, GlobalJsError, UnhandledRejection.

При добавлении новых вызовов — передавать `issueKey` и `keys.operation` (или `keys`) для группировки в Tracer.

## 📊 Структура отчётов об ошибках

### ErrorInfo интерфейс

```typescript
interface ErrorInfo {
  componentStack?: string; // React component stack
  errorBoundaryName?: string; // Название Error Boundary
  appName: string; // Название приложения
  url: string; // URL страницы
  userAgent: string; // User Agent браузера
  timestamp: number; // Время возникновения
  userId?: string; // ID пользователя
  sessionId?: string; // ID сессии
  additionalContext?: Record<string, unknown>; // Дополнительный контекст
}
```

## 🔧 Структура пакета

```
packages/error-handling/
├── src/
│   ├── lib/
│   │   └── reportClientError.ts  # Bridge в Tracer
│   ├── react/
│   │   └── ErrorBoundary.tsx    # React Error Boundary → reportClientError
│   └── index.ts                 # Экспорты
├── package.json
└── tsconfig.json
```

## 📦 Зависимости

- `@gafus/types` — общие типы
- `react`, `react-dom` — React runtime

## 🎯 Рекомендации по использованию

1. **Оборачивайте корневой компонент** в ErrorBoundary для глобального перехвата
2. **Используйте несколько ErrorBoundary** для изоляции секций (чтобы ошибка в одной части не ломала всё приложение)
3. **Настройте appName** для правильной группировки ошибок в dashboard
4. **Используйте onError callback** для интеграции с аналитикой

---

_Для логирования и серверной обработки ошибок используйте `@gafus/logger`._
