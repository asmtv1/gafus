# Промт для аудита Tracer (web, mobile, trainer-panel)

Проверь интеграцию с Tracer (apptracer.ru) в приложениях GAFUS. Цель: убедиться, что все клиентские ошибки, требующие мониторинга, попадают в Tracer, и выявить пробелы для исправления.

## Контекст

- **Клиентские ошибки** → Tracer (ErrorBoundary, reportClientError, @apptracer/sdk)
- **Серверные логи** → Seq (Pino → stdout → Vector)
- Документация: `docs/monitoring/tracer.md`, `docs/packages/error-handling.md`

## Что проверить

### 1. Инфраструктура и инициализация

- [ ] **Web**: `TracerProvider` в layout, `setupGlobalErrorHandling()` в ClientLayout — перехват `window.onerror`, `unhandledrejection`
- [ ] **trainer-panel**: `TracerProvider` и `ErrorBoundary` в layout — есть ли `setupGlobalErrorHandling()`? (Web вызывает, trainer-panel — проверить)
- [ ] **Mobile**: `TracerProvider` (ErrorUtils.setGlobalHandler), `ErrorBoundary` в _layout.tsx
- [ ] Env: `NEXT_PUBLIC_TRACER_APP_TOKEN`, `NEXT_PUBLIC_ENABLE_TRACER` (web/trainer-panel); `EXPO_PUBLIC_TRACER_APP_TOKEN`, `EXPO_PUBLIC_ENABLE_TRACER` (mobile)

### 2. Автоматический перехват

- [ ] ErrorBoundary везде оборачивает приложение
- [ ] Глобальные JS-ошибки: `window.onerror` → reportClientError / SDK
- [ ] Unhandled Promise rejections → reportClientError / SDK

### 3. Ручная отправка (reportClientError)

Проверь все `catch` и `try/catch` блоки в клиентском коде. Каждое место, где обрабатывается **неожиданная** или **критичная** ошибка, должно вызывать `reportClientError` с `issueKey` и `keys` для группировки.

#### Web — где уже есть reportClientError

- global-error-handler: GlobalJsError, UnhandledRejection
- ErrorBoundary: error-boundary:gafus
- fetchInterceptor: fetch_unexpected (не сетевые)
- useCachedTrainingDays
- VkIdOneTap
- useStepTimer
- VideoReport
- OptimizedImage
- courseStore
- OfflineStatus
- ProfileAvatar

#### Mobile — где уже есть reportClientError

- ErrorBoundary, TracerProvider
- authStore: AuthLogin, AuthVkLogin, AuthRegister, AuthLogout, AuthCheck, AuthVkPhoneSet
- ApiClient, RefreshToken
- progressSyncStore

#### Потенциальные пробелы (catch без reportClientError)

**Web** — проверить и при необходимости добавить reportClientError:

- LoginForm, RegisterForm, PasswordResetForm
- AddPetForm, EditBioForm, EditablePetAvatar
- FavoriteButton, ShareButton
- StudentNotes, NotificationStatus
- OfflineStore, offlineStore, useOfflineCourse
- ServiceWorkerRegistrar, useServiceWorker
- PetsProvider, CoursesClient (fetchAllCourses.catch)
- videoProgressStorage, videoProgressActions
- downloadHLSVideo
- useVideoUrl
- stepStore
- subscription, trainingReminders, updateReengagementSettings

**Mobile** — проверить:

- login.tsx, register.tsx (catch err)
- courses.tsx, index.tsx
- AccordionStep.tsx (несколько catch)
- [dayId].tsx (много catch)
- useTrainingDay
- downloadHLSForOffline, downloadCourseForOffline
- api/auth.ts, api/pets.ts (catch без reportClientError)
- useVideoUrl
- notifications.ts

**trainer-panel** — в приложении **нет ни одного** `reportClientError`:

- Все catch-блоки в компонентах и lib возвращают ошибку или `{ success: false }`, но не отправляют в Tracer
- Проверить: AIChatWidget, AIChatSettings, CourseForm, ExamResultsList, NoteForm, NewStepForm, uploadTrainerVideoAction, TrainerVideoUploader, createStep, updateStep и др.

### 4. Критерии: когда вызывать reportClientError

**Нужно вызывать** для:

- Неожиданные ошибки (сетевая ошибка API, сбой загрузки, ошибка парсинга)
- Ошибки, влияющие на UX (не загрузился контент, не сохранились данные)
- Ошибки в критичных flow: auth, оплата, тренировки, офлайн

**Не обязательно** для:

- Ожидаемые/валидационные ошибки (пользователь ввёл неверные данные)
- Ошибки, которые уже перехватываются выше (ErrorBoundary, unhandledrejection)
- Server Actions — серверная логика, Seq, не Tracer

### 5. Качество reportClientError

При вызове передавать:

- `issueKey` — для группировки (например `AuthLogin`, `CourseStore`)
- `keys` — контекст: `operation`, `endpoint`, `step` и т.п.
- `userId` — если известен

Пример: `reportClientError(error, { issueKey: "AuthLogin", keys: { step: "submit" }, userId })`

### 6. Исключения и границы

- **Server Actions / API routes**: ошибки логируются в Seq, не в Tracer
- **Ожидаемые ошибки** (404, 401, validation): можно не отправлять или отправлять с severity: "warning"
- **Офлайн/сетевые ошибки**: часто обрабатываются отдельно (offline mode) — решить, отправлять ли в Tracer для статистики

## Формат результата

Для каждого приложения (web, mobile, trainer-panel) выдать:

1. **Статус инфраструктуры** — что настроено, чего не хватает
2. **Список пробелов** — файл:строка, описание, рекомендуемый issueKey
3. **Приоритет** — high (критичные flow), medium (важные), low (редкие сценарии)
