# Пробелы отправки ошибок в AppTracer

Дата аудита: 2026-03-24. Исходно — только фиксация.

**Обновление:** закрыты пункты **§1** (TracerProvider в admin-panel), **§2.1** (список web/trainer/admin + `packages/csrf` + `LoginForm` в ui-components), **§2.2** (mobile из списка), **§2.3–2.4** (zustand + pushStore), **§3** (серверные `logger.error` с `Error`, cdn-upload и др.), **§4** там, где добавлен `reportClientError` / мобильный аналог. Дополнительно (2026-03-24): **§2** — `reportClientError` в `ArticlesClient` (лайк), `useCaughtError`, mobile `confirm` (poll), `VideoPlayer` (ошибка воспроизведения); **§6.3** — `try/catch` + `logger.error(..., Error)` в ряде server actions с `throw` / Zod (trainer: дни/шаги/экзамены/видео/загрузка статей; web: `updatePetAvatar`, `savePushSubscription`, дублирующие `invalidateUserProgressCache` в `lib/actions` и `server-actions/cache`). Перед логированием в этих `catch` вызывается `unstable_rethrow(error)` из `next/navigation`, чтобы не слать в Tracer служебные ошибки Next (SSG / `headers`).

**Обновление (2026-03-24, второй проход):** **§2** — дозакрыты ранее отключённые eslint-кейсы: mobile `+native-intent`, `returnUrl`, `offlineStorage`, публичный профиль (`getAge`), Share fallback на экране дней, trainer `ArticlesListClient` (дата), web `GuideContentEmbed`, `notificationUIStore` (localStorage), `checkRealConnection` (один warning после исчерпания ping). **§6.3** — web `notifications.ts` (Zod внутри `try`, `unstable_rethrow` в `catch`), `tracking.ts`, `updatePreventionEntry` (`unstable_rethrow`); trainer `getStepCategories` / `getStepTemplates` / `getVisibleDays` / `getMultipleVideoStatuses` / `getUserProgress`, `reviewExamResult`; admin `sendBroadcastPush`.

**Обновление (2026-03-24, третий проход):** mobile **`deviceContext`** — при сбое Android ID вызывается **`reportAndroidDeviceIdFailure`** (отдельный модуль + `tracerUpload` / `sessionUuid`), цикл с `reportClientError` снят. Web — `reportClientError` в `manageStepNotificationSimple`, `useRefreshData`, `useServiceWorker`, `useCoursePrefetch`, `usePreloadComponents`, `serviceWorkerManager`, `sweetAlert`, `hapticFeedback`.

## Как устроено в проекте

| Среда | Механизм |
|-------|----------|
| Клиент (web, trainer-panel) | `reportClientError` из `@gafus/error-handling` → `window.__gafusReportError` → SDK `@apptracer/sdk` после монтирования `TracerProvider` (`packages/ui-components`). |
| Клиент (mobile) | `reportClientError` из `@/shared/lib/tracer` → HTTP `uploadBatch` на `sdk-api.apptracer.ru`. |
| Сервер (Node, RSC, API routes, worker, core через `createWebLogger`) | `logger.error(message, error: Error)` / `logger.fatal` → `reportServerError` в `packages/logger/src/tracerServer.ts` (нужны токен и prod или `TRACER_SERVER_ENABLED`). |

Важно: **`logger.error` только с одним аргументом (строка) не вызывает `reportServerError`** — во второй параметр должен попасть `Error`.

---

## 1. Инфраструктура: admin-panel ~~без TracerProvider~~ (исправлено)

Ранее в `apps/admin-panel` не было `TracerProvider`. Сейчас в root `layout.tsx` подключены `TracerProvider` и `ErrorBoundary` (как в web/trainer).

---

## 2. Клиент: `catch` / обработка ошибок без `reportClientError`

Эвристика: файл с `"use client"` **или** путь `apps/mobile/`, есть `catch (`**, в файле **нет** вызова `reportClientError`. Исключены только реализации трейсера и `ErrorBoundary`, которые сами репортят.

### 2.1 Web и trainer-panel (React)

- `apps/admin-panel/src/app/(main)/main-panel/users/UsersClient.tsx`
- `apps/admin-panel/src/features/admin/components/CacheManagement.tsx`
- `apps/admin-panel/src/features/broadcasts/components/BroadcastForm.tsx`
- `apps/admin-panel/src/features/users/components/EditUserForm.tsx`
- `apps/trainer-panel/src/features/ai-chat/components/AIChatSettings.tsx`
- `apps/trainer-panel/src/features/steps/components/TemplateLibrary.tsx`
- `apps/trainer-panel/src/shared/components/video/HLSVideoPlayer.tsx`
- `apps/trainer-panel/src/shared/hooks/useStatistics.ts`
- `apps/web/src/app/(auth)/login/LoginForm.tsx`
- `apps/web/src/app/(auth)/passwordReset/PasswordResetForm.tsx`
- `apps/web/src/app/(auth)/register/RegisterForm.tsx`
- `apps/web/src/app/(main)/articles/[slug]/ArticleDetailClient.tsx`
- `apps/web/src/app/(main)/courses/CoursesClient.tsx`
- `apps/web/src/app/reset-password/reset-password-form.tsx`
- `apps/web/src/app/~offline/page.tsx`
- `apps/web/src/features/achievements/components/UserCoursesStatistics/UserCoursesStatistics.tsx`
- `apps/web/src/features/courses/components/CourseRating/CourseRating.tsx`
- `apps/web/src/features/courses/components/FavoriteButton/FavoriteButton.tsx`
- `apps/web/src/features/profile/components/EditableAvatar/EditableAvatar.tsx`
- `apps/web/src/features/profile/components/NotificationStatus/NotificationStatus.tsx`
- `apps/web/src/features/profile/components/StudentNotes/StudentNotes.tsx`
- `apps/web/src/features/training/components/Day/Day.tsx`
- `apps/web/src/features/training/components/ShareButton/ShareButton.tsx`
- `apps/web/src/shared/components/common/PetsProvider.tsx`
- `apps/web/src/shared/components/ui/NotificationRequesterNew.tsx`
- `apps/web/src/shared/components/ui/OfflineDetector.tsx`
- `apps/web/src/shared/components/ui/OfflineStoreInitializer.tsx`
- `apps/web/src/shared/components/ui/ServiceWorkerRegistrar.tsx`
- `apps/web/src/shared/components/video/CourseVideoPlayer.tsx`
- `apps/web/src/shared/hooks/useAchievementsFromStores.ts`
- `apps/web/src/shared/hooks/useCourses.ts`
- `apps/web/src/shared/hooks/useOfflineCourse.ts`
- `apps/web/src/shared/hooks/useUserData.ts`
- `apps/web/src/shared/lib/network/offlineDetector.ts`
- `apps/web/src/shared/lib/offline/clearCourseCache.ts`
- `apps/web/src/shared/lib/offline/htmlPageStorage.ts`
- `apps/web/src/shared/lib/offline/integrityValidator.ts`
- `apps/web/src/shared/lib/offline/offlineCourseStorage.ts`
- `apps/web/src/shared/lib/offline/offlineMediaResolver.ts`
- `apps/web/src/shared/utils/clearProfileCache.ts`
- `apps/web/src/shared/utils/offlineCacheUtils.ts`
- `packages/csrf/src/react/CSRFProvider.tsx`
- `packages/csrf/src/store.ts`
- `packages/ui-components/src/LoginForm.tsx`

### 2.2 Mobile

- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/app/(auth)/register.tsx`
- `apps/mobile/app/(main)/(tabs)/courses.tsx`
- `apps/mobile/app/(main)/(tabs)/index.tsx`
- `apps/mobile/app/(main)/(tabs)/profile.tsx` — два `catch` без репорта
- `apps/mobile/app/(main)/articles/[slug].tsx`
- `apps/mobile/src/shared/hooks/usePreventionSyncOnReconnect.ts`
- `apps/mobile/src/shared/hooks/useSyncProgressOnReconnect.ts`
- `apps/mobile/src/shared/hooks/useVkLink.ts`
- `apps/mobile/src/shared/hooks/useVkLogin.ts`
- `apps/mobile/src/shared/lib/api/auth.ts`
- `apps/mobile/src/shared/lib/api/pets.ts`
- `apps/mobile/src/shared/lib/offline/downloadHLSForOffline.ts`
- `apps/mobile/src/shared/lib/utils/notifications.ts`

### 2.3 Zustand (web): есть `catch`, **нет** импорта `reportClientError`

Клиентские сторы; ошибки уходят в консоль/`logger.warn`, в AppTracer клиентский канал — нет.

- `apps/web/src/shared/stores/petsStore.ts`
- `apps/web/src/shared/stores/permission/permissionStore.ts`
- `apps/web/src/shared/stores/notification/notificationComposite.ts`
- `apps/web/src/shared/stores/timerStore.ts`
- `apps/web/src/shared/stores/stepStore.ts`

### 2.4 `pushStore`: часть веток только `logger.warn`

В `apps/web/src/shared/stores/push/pushStore.ts` три блока с `reportClientError`, остальные сбои подписки/отписки — **только** `logger.warn` (в Tracer не попадают). Решение продукта: оставить как шум ниже уровня error или дублировать в Tracer с `severity: "warning"` / `reportClientError`.

---

## 3. Сервер: `logger.error` без второго аргумента `Error` → Tracer не вызывается

- `apps/web/src/app/api/v1/payments/create/route.ts` — например отсутствие `YOOKASSA_*` (строка без `Error`).
- `apps/web/src/shared/lib/video/getSignedVideoUrl.ts` — «Нет сессии пользователя» одной строкой.
- `apps/api/src/routes/v1/training.ts` — «Пользователь не найден в контексте» (одна строка).
- `packages/cdn-upload/src/uploadToCDN.ts` — **все** вызовы вида `logger.error(\`… ${error}\`)` без передачи `Error` во второй параметр (6 мест). Для Tracer нужен явный `error instanceof Error ? error : new Error(String(error))` вторым аргументом.

---

## 4. Клиент: `console.error` / `console.warn` при отсутствии `reportClientError` в том же файле

Полезно просмотреть и при необходимости заменить на `reportClientError` (или оставить только для локальной отладки).

- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/app/(auth)/register.tsx`
- `apps/mobile/src/shared/hooks/useVkLink.ts`
- `apps/mobile/src/shared/hooks/useVkLogin.ts`
- `apps/mobile/src/shared/lib/api/pets.ts`
- `apps/mobile/src/shared/lib/utils/notifications.ts`
- `apps/trainer-panel/src/shared/components/video/HLSVideoPlayer.tsx`
- `apps/web/src/features/profile/components/NotificationStatus/NotificationStatus.tsx`
- `apps/web/src/features/training/components/ShareButton/ShareButton.tsx`
- `apps/web/src/shared/components/ui/ServiceWorkerRegistrar.tsx`
- `apps/web/src/shared/components/video/CourseVideoPlayer.tsx`

---

## 5. Не классифицировано как пробел (для ясности)

- Файлы только с **серверными** `catch` и `logger.error(..., err as Error)` — Tracer с серверной стороны покрывается (при включённом токене/окружении).
- `packages/core/src/utils/social.ts` — `catch` с `throw new Error(...)`: репорт ожидается у вызывающего кода, если там есть `logger.error` с `Error`.
- Скрипты в `scripts/` не входили в инвентарь чеклиста.

---

## 6. Не только Tracer: забытый `catch` / нет `logger.error` с `Error` в принципе

Да, такое возможно: ошибка **никак не перехватывается** или перехватывается **не там**, и тогда ни консоль/ответ пользователю, ни Tracer не получают сигнал.

### 6.1 Когда это не баг

- **Намеренный `throw`** (например `getCurrentUserId` бросает «не авторизован») — ожидается `catch` у вызывающего action/handler; если вызывающий молчит, дыра уже у него.
- **Тонкая обёртка** `export async function …() { return otherModule() }` без `try` в этом файле — смотреть **реализацию** `otherModule` (пример: `server-actions/notes.ts` дергает `shared/lib/notes/getStudentNotes.ts`, где уже есть `try/catch` и `logger.error`).
- **Проброс в Next.js** для server action (непойманное исключение → error UI / лог фреймворка) — иногда осознанно, но тогда **Tracer на сервере** всё равно не вызовется, если нигде в цепочке не было `logger.error(..., error)`.

### 6.2 Где чаще забывают

- **Клиент:** `useEffect` с асинхронной загрузкой без `try/catch` вокруг `await` → необработанный rejection (частично пересекается с п. 2: там, где `catch` нет вообще, Tracer тем более не вызовешь).
- **Клиент:** `onClick` / колбэки `async () => { await … }` без `try/catch`.
- **Сервер:** action только прокидывает вызов в core; если core в редком пути **бросает** вместо `{ success: false }`, а action не оборачивает — исключение уходит наверх без вашего `logger.error`.

### 6.3 Эвристика: `"use server"` без ключевого слова `try` в файле

Не все такие файлы ошибочны (см. п. 6.1), но это **кандидаты на ручную проверку**: есть ли перехват и лог с `Error` в вызываемом коде или нужен локальный `try/catch`.

- `apps/admin-panel/src/features/admin/lib/getStorageStats.ts`
- `apps/admin-panel/src/features/broadcasts/lib/sendBroadcastPush.ts`
- `apps/admin-panel/src/features/presentation/lib/getPresentationStats.ts`
- `apps/admin-panel/src/features/reengagement/lib/getReengagementMetrics.ts`
- `apps/trainer-panel/src/features/articles/lib/uploadArticleImageServerAction.ts`
- `apps/trainer-panel/src/features/articles/lib/uploadArticleLogoServerAction.ts`
- `apps/trainer-panel/src/features/courses/lib/getVisibleDays.ts`
- `apps/trainer-panel/src/features/exam-results/lib/getExamResults.ts`
- `apps/trainer-panel/src/features/exam-results/lib/getPendingExamResults.ts`
- `apps/trainer-panel/src/features/exam-results/lib/reviewExamResult.ts`
- `apps/trainer-panel/src/features/steps/lib/createTrainingDay.ts`
- `apps/trainer-panel/src/features/steps/lib/getStepCategories.ts`
- `apps/trainer-panel/src/features/steps/lib/getStepTemplates.ts`
- `apps/trainer-panel/src/features/steps/lib/getVisibleSteps.ts`
- `apps/trainer-panel/src/features/steps/lib/updateTrainingDay.ts`
- `apps/trainer-panel/src/features/trainer-videos/lib/getMultipleVideoStatuses.ts`
- `apps/trainer-panel/src/features/trainer-videos/lib/getTrainerVideos.ts`
- `apps/trainer-panel/src/shared/lib/actions/getUserProgress.ts`
- `apps/web/src/app/(main)/trainings/[courseType]/[day]/actions.ts`
- `apps/web/src/shared/lib/StepNotification/notificationActions.ts`
- `apps/web/src/shared/lib/actions/invalidateCoursesCache.ts`
- `apps/web/src/shared/lib/actions/publicKey.ts`
- `apps/web/src/shared/lib/actions/trackPresentationEvent.ts`
- `apps/web/src/shared/lib/actions/trackPresentationView.ts`
- `apps/web/src/shared/lib/actions/trackReengagementClick.ts`
- `apps/web/src/shared/lib/pets/updatePetAvatar.ts`
- `apps/web/src/shared/lib/savePushSubscription/savePushSubscription.ts`
- `apps/web/src/shared/lib/training/getDeclinedName.ts`
- `apps/web/src/shared/lib/training/saveCoursePersonalization.ts`
- `apps/web/src/shared/server-actions/cache.ts`
- `apps/web/src/shared/server-actions/notes.ts`
- `apps/web/src/shared/server-actions/push.ts`
- `apps/web/src/shared/server-actions/tracking.ts`
- `apps/web/src/shared/utils/getCurrentUserId.ts`

Отдельно: `apps/web/src/shared/server-actions/tracking.ts` — прямой `return trackingService.*` без локального `try`; ошибки и логи зависят от того, **всегда ли** сервис возвращает результат или иногда бросает (см. `packages/core/src/services/tracking/trackingService.ts`).

### 6.4 Эвристика: `"use server"` без вызова `logger.error` в файле

Аналогично не всегда дефект (делегация в модуль с логированием). Список на 2026-03-24 (web + trainer + admin `src`): **40 файлов**, частично совпадает с п. 6.3. Имеет смысл сверить цепочку вызовов до первого `logger.error(..., error as Error)` или `reportServerError`.

---

## 7. Следующие шаги (когда будете исправлять)

1. Подключить `TracerProvider` в admin-panel + точечно добавить `reportClientError` в критичных формах.
2. Пройти список из п. 2 по приоритету (auth, оплата, офлайн, плееры).
3. Исправить п. 3 (особенно `uploadToCDN.ts` и однострочные `logger.error` на сервере).
4. Унифицировать `pushStore` и zustand-сторы при необходимости наблюдаемости push/таймера/питомцев.
5. Пройти кандидатов из п. 6.3–6.4 и клиентские сценарии из п. 6.2: где нет ни `catch`, ни логирования с `Error` в цепочке.
