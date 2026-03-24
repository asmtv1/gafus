# Полный инвентарь границ Tracer / наблюдаемости ошибок

**Дата среза:** 2026-03-24  
**Обновление:** 2026-03-24 — добавлен **§11 Дополнительный анализ** (ESLint, `logger.error`, критичные потоки).  
**Цель:** зафиксировать, **что именно** было измерено в репозитории и **какие утверждения** о покрытии тогда обоснованы.

---

## 1. Ход работы (как собирался инвентарь)

1. Поиск по коду `reportClientError` (клиент → Tracer по правилам проекта).
2. Поиск по коду `logger.error(` (сервер / worker / пакеты; ошибки в Tracer при корректной передаче `Error`).
3. Автоматический обход файлов с директивой `"use server"` / `'use server'`: наличие в файле конструкции `try {` (эвристика «есть явная граница catch»).
4. Обход `apps/web/src/app/api/**/route.ts`: наличие `try {`.
5. Выборочная сверка исключений (health, заглушки API).
6. Учёт ESLint `@gafus/require-client-catch-tracer` и точечных `eslint-disable` с комментариями.
7. Отдельно: **mobile** не использует `"use client"` (React Native / Expo) — инвентарь по экранам `apps/mobile/app` — по наличию строки `reportClientError` в файле (эвристика экрана, не полного потока).

Повторный прогон скриптов возможен командами из раздела «Воспроизводимость» в конце.

---

## 2. Итоговые метрики (кратко)

| Область | Метрика | Значение |
|--------|---------|----------|
| **Server Actions / use server** в `apps/web`, `apps/trainer-panel`, `apps/admin-panel` | файлов с `"use server"` | **127** (70 + 47 + 10) |
| Там же | файлов **без** `try {` в том же файле | **0** |
| **packages/auth** | `"use server"` файлов | **10** |
| Там же | без `try {` | **9** (список ниже) |
| **packages/webpush** | `db.ts` с `"use server"` | **1**, без `try {` | **1** |
| **packages/csrf** | `utils.ts` с `"use server"` | **1**, с `try {` | **1** |
| **Web `app/api`** | `route.ts` всего | **59** |
| Там же | с `try {` | **57** |
| Там же | без `try {` | **2** (см. §5) |
| **Web `use client`** | файлов всего | **123** |
| Там же | содержат `reportClientError` | **74** |
| Там же | **не** содержат подстроку `reportClientError` | **49** |
| **Trainer `use client`** | всего / с `reportClientError` | **55** / **24** / без **31** |
| **Admin `use client`** | всего / с `reportClientError` | **16** / **7** / без **9** |
| **Mobile `apps/mobile/app`** | файлов `.ts`/`.tsx` | **35** |
| Там же | файлы с `reportClientError` | **14** |
| Там же | файлы **без** `reportClientError` в тексте | **21** (список §7.2) |

Подсчёт `reportClientError`: в выдачу попадают также реэкспорты и определения в `packages/error-handling` и mobile `tracer`; для **утверждений о покрытии** важны **вызовы** в app-коде, а не один импорт.

---

## 3. Сервер: приложения Next.js (web, trainer-panel, admin-panel)

Во всех трёх приложениях **каждый** файл под `apps/*/src`, содержащий `"use server"`, на дату среза **содержит** `try {` в этом же файле.

Это **не** доказывает, что внутри каждого `catch` вызывается `logger.error(..., error as Error)` — только что есть явная синтаксическая граница. Для детализации по конкретному файлу нужен отдельный аудит содержимого `catch`.

---

## 4. Сервер: пакеты с `"use server"`

### 4.1. `packages/auth` — файлы **без** `try {` (9 + 1 с try не в списке)

На дату среза **без** `try {` в файле:

- `checkUserConfirmed.ts`
- `getCurrentUserId.ts` — только `getServerSession` + возврат `id` или `null` (типичный гость не логируется намеренно на уровне web-обёртки; см. `apps/web/src/shared/utils/getCurrentUserId.ts`)
- `getUserPhoneByUsername.ts`
- `registerUser.ts`
- `resetPasswordByShortCode.ts`
- `resetPasswordByToken.ts`
- `sendTelegramPasswordResetRequest.ts`
- `sendTelegramPhoneChangeRequest.ts`
- `sendTelegramUsernameChangeNotification.ts`

**Смысл для Tracer:** ошибки Prisma/сессии здесь **пробрасываются вверх** к вызывающим server actions / API, где уже должны логироваться. Утверждение «в auth-пакете каждый use server обёрнут в try» — **ложно**; утверждение «в Next apps все use server обёрнуты в try» — **истинно** по автоматической проверке.

### 4.2. `packages/webpush/src/db.ts`

`getUserSubscriptions` — прямой `prisma.findMany` без `try/catch` в файле. Сбои БД уйдут вызывающему коду.

### 4.3. `packages/csrf/src/utils.ts`

Содержит `try {` (проходит автоматическую проверку).

---

## 5. HTTP: `apps/web/src/app/api/**/route.ts`

- **59** файлов `route.ts`.
- **57** содержат `try {`.
- **2** без `try {`:
  1. `apps/web/src/app/api/health/route.ts` — статический JSON `{ status: "ok" }`, без I/O.
  2. `apps/web/src/app/api/v1/auth/check-phone-match/route.ts` — заглушка, фиксированный ответ, без логики и БД.

**Утверждение:** для маршрутов с реальной логикой под `app/api` явная обработка `try` почти везде; исключения — намеренно тривиальные эндпоинты.

---

## 6. Standalone API `apps/api`

По всему `apps/api/src` встречаются `try {` и `logger.error` в route-модулях и `middleware/error-handler.ts`. Отдельный полный список «каждый хендлер → есть catch → есть Tracer» в этом документе **не строился**; для API применима та же схема: смотреть `catch` + передачу `Error` в логгер.

---

## 7. Клиент

### 7.1. Web / trainer / admin: `"use client"` и `reportClientError`

Эвристика: **файл содержит** подстроку `reportClientError`.

- Отсутствие подстроки **не значит** отсутствие трейса: ошибка может уйти в **родительский** `ErrorBoundary`, в **дочерний** хук/стор с `reportClientError`, или в **глобальный** обработчик.
- Наличие подстроки **не значит**, что **все** `catch` в файле вызывают трейсер.

**Списки файлов `use client` без подстроки `reportClientError`** (для последующего ручного разбора при необходимости):

<details>
<summary>Web (49 файлов)</summary>

- `apps/web/src/app/(main)/favorites/FavoritesCourseList.tsx`
- `apps/web/src/app/ClientRedirect.tsx`
- `apps/web/src/app/~offline/layout.tsx`
- `apps/web/src/features/achievements/components/AchievementsContent/AchievementsContent.tsx`
- `apps/web/src/features/courses/components/CourseCard/CourseCard.tsx`
- `apps/web/src/features/courses/components/CourseFilters/CourseFilters.tsx`
- `apps/web/src/features/courses/components/CourseFilters/FiltersDrawer.tsx`
- `apps/web/src/features/courses/components/CourseSearch/CourseSearch.tsx`
- `apps/web/src/features/courses/components/CourseTabs/CourseTabs.tsx`
- `apps/web/src/features/header/components/Header.tsx`
- `apps/web/src/features/pet-prevention/components/PreventionEntryForm.tsx`
- `apps/web/src/features/pet-prevention/components/PreventionEntryList.tsx`
- `apps/web/src/features/profile/components/PetList/PetCard.tsx`
- `apps/web/src/features/profile/components/SettingsActions/SettingsActions.tsx`
- `apps/web/src/features/profile/components/TrainerCoursesSection/TrainerCoursesSection.tsx`
- `apps/web/src/features/profile/components/UserProfile/UserProfile.tsx`
- `apps/web/src/features/training/components/AccessDeniedAlert/AccessDeniedAlert.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepContent.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepDiaryBlock.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepExaminationBlock.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepPracticeBlock.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepTimerCard.tsx`
- `apps/web/src/features/training/components/AccordionStep/StepTypeHeader.tsx`
- `apps/web/src/features/training/components/TrainingDayList/TrainingDayList.tsx`
- `apps/web/src/shared/components/auth/MainAuthButtons.tsx`
- `apps/web/src/shared/components/auth/VkErrorBanner.tsx`
- `apps/web/src/shared/components/auth/VkIdTokenHandler.tsx`
- `apps/web/src/shared/components/common/UserProvider.tsx`
- `apps/web/src/shared/components/ui/AchievementsError.tsx`
- `apps/web/src/shared/components/ui/AchievementsSkeleton.tsx`
- `apps/web/src/shared/components/ui/ClientLayout.tsx`
- `apps/web/src/shared/components/ui/FormField.tsx`
- `apps/web/src/shared/components/ui/ImageViewer.tsx`
- `apps/web/src/shared/components/ui/OfflineNotification.tsx`
- `apps/web/src/shared/components/ui/PasswordInput.tsx`
- `apps/web/src/shared/components/ui/RunningDogAnimation.tsx`
- `apps/web/src/shared/components/ui/SessionWrapper.tsx`
- `apps/web/src/shared/components/ui/SyncStatusIndicator.tsx`
- `apps/web/src/shared/components/ui/useRedirectIfAuth.tsx`
- `apps/web/src/shared/components/video/VideoTranscodingPlaceholder.tsx`
- `apps/web/src/shared/hooks/useCourseProgressSync.ts`
- `apps/web/src/shared/hooks/usePets.ts`
- `apps/web/src/shared/hooks/useProfile.ts`
- `apps/web/src/shared/hooks/useSyncStatus.ts`
- `apps/web/src/shared/hooks/useUserCourses.ts`
- `apps/web/src/shared/hooks/useUserProgress.ts`
- `apps/web/src/shared/lib/achievements/calculateAchievements.ts`
- `apps/web/src/shared/providers/QueryProvider.tsx`
- `apps/web/src/shared/utils/cacheManager.ts`

</details>

<details>
<summary>Trainer-panel (31 файл)</summary>

- `apps/trainer-panel/src/app/(main)/main-panel/courses/new/loading.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/days/DaysClient.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/days/EnhancedDaysTable.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/days/loading.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/notes/NotesClient.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/statistics/loading.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/steps/EnhancedStepsTable.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/steps/StepsClient.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/steps/loading.tsx`
- `apps/trainer-panel/src/features/articles/components/ArticleForm/ArticleForm.tsx`
- `apps/trainer-panel/src/features/exam-results/components/ExamResultsListWithFilter.tsx`
- `apps/trainer-panel/src/features/faq/components/FAQContent.tsx`
- `apps/trainer-panel/src/features/notes/components/NotesList.tsx`
- `apps/trainer-panel/src/features/statistics/components/StatisticsClient.tsx`
- `apps/trainer-panel/src/features/steps/components/AdminTemplateManager.tsx`
- `apps/trainer-panel/src/features/steps/components/ChecklistEditor.tsx`
- `apps/trainer-panel/src/features/steps/components/TrainingDayForm.tsx`
- `apps/trainer-panel/src/features/steps/components/VideoSelector.tsx`
- `apps/trainer-panel/src/features/trainer-videos/components/TrainerVideosClient.tsx`
- `apps/trainer-panel/src/shared/components/Dashboard.tsx`
- `apps/trainer-panel/src/shared/components/FormPageLayout.tsx`
- `apps/trainer-panel/src/shared/components/FormSection.tsx`
- `apps/trainer-panel/src/shared/components/PageLayout.tsx`
- `apps/trainer-panel/src/shared/components/PersonalizationPlaceholdersHint.tsx`
- `apps/trainer-panel/src/shared/components/TracerLayout.tsx`
- `apps/trainer-panel/src/shared/components/common/DualListSelector.tsx`
- `apps/trainer-panel/src/shared/components/common/MarkdownInput.tsx`
- `apps/trainer-panel/src/shared/components/common/PasswordInput.tsx`
- `apps/trainer-panel/src/shared/components/ui/Toast.tsx`
- `apps/trainer-panel/src/shared/providers/QueryProvider.tsx`
- `apps/trainer-panel/src/shared/providers/SessionProvider.tsx`

</details>

<details>
<summary>Admin-panel (9 файлов)</summary>

- `apps/admin-panel/src/app/(main)/main-panel/purchases/PurchasesClient.tsx`
- `apps/admin-panel/src/app/(main)/main-panel/purchases/PurchasesTable.tsx`
- `apps/admin-panel/src/app/(main)/main-panel/users/UsersTable.tsx`
- `apps/admin-panel/src/features/admin/components/StorageManagement.tsx`
- `apps/admin-panel/src/features/auth/components/SessionProviderWrapper.tsx`
- `apps/admin-panel/src/shared/components/CookieSettingsButton.tsx`
- `apps/admin-panel/src/shared/components/MobileMenu.tsx`
- `apps/admin-panel/src/shared/components/PageLayout.tsx`
- `apps/admin-panel/src/shared/providers/QueryProvider.tsx`

</details>

### 7.2. Mobile: экраны `apps/mobile/app` без подстроки `reportClientError`

Файлы маршрутов, в тексте которых **нет** `reportClientError` (на дату среза):

- `(auth)/_layout.tsx`, `vk-consent.tsx`, `vk-set-phone.tsx`, `welcome.tsx`
- `(main)/(tabs)/_layout.tsx`, `achievements.tsx`, `articles.tsx`
- `(main)/_layout.tsx`
- `(main)/pets/[id]/prevention.tsx`, `add.tsx`, `edit/[id].tsx`
- `(main)/profile/edit.tsx`
- `(main)/reminders.tsx`
- `(main)/training/[courseType]/reviews.tsx`
- `(main)/trainings/[courseType]/[day].tsx`, `index.tsx`, `reviews.tsx`
- `+not-found.tsx`, `_layout.tsx`, `index.tsx`

Часть сценариев на этих экранах может вызывать код из `apps/mobile/src/**` с `reportClientError`, глобальный обработчик (`installGlobalJsErrorHandler`) или `ErrorBoundary` — список выше про **только текст файла экрана**.

### 7.3. `deviceContext.ts` (mobile)

**Обновление:** при сбое `Application.getAndroidId()` вызывается **`reportAndroidDeviceIdFailure`** (`reportAndroidDeviceIdFailure.ts`) — отправка в Tracer **без** вызова `getDeviceId` (нет рекурсии) и **без** цикла с `reportClientError.ts`. Сессия — модуль `sessionUuid.ts`, общая отправка — `tracerUpload.ts`.

---

## 8. Глобальные границы (layout / ErrorBoundary)

- **Web** `apps/web/src/app/layout.tsx` — обёртка `ErrorBoundary` из `@gafus/error-handling`.
- **Trainer** — `ErrorBoundary`, `CSRFErrorBoundary`; в `main-panel/layout.tsx` есть вызов `reportClientError` в обработчике ошибки (по коду layout).
- **Admin** — `ErrorBoundary` в корневом layout.

Необработанные ошибки рендера на клиенте в зоне дерева с boundary частично попадают в Tracer через реализацию `ErrorBoundary` пакета.

---

## 9. ESLint и явные исключения

- Правило **`@gafus/require-client-catch-tracer`**: **warn** (`eslint.config.mjs`).
- Точечные отключения с комментариями зафиксированы в том числе в:  
  `checkConnection.ts`, `fetchInterceptor.ts`, `offlineStorage.ts`, `returnUrl.ts`, `+native-intent.tsx`, `GuideContentEmbed.tsx`, `ArticlesListClient.tsx` (trainer), и др. — см. `rg "require-client-catch-tracer"` по репозиторию.

Процесс для разработчиков: `docs/audit/tracer-client-catch-process.md`.

---

## 10. Что можно утверждать на основании этого инвентаря

**Можно утверждать с опорой на автоматический срез (§2–§9) и доп. анализ (§11):**

1. В **Next-приложениях** (`web`, `trainer-panel`, `admin-panel`) **все** файлы с `"use server"` содержат **`try {`** в том же файле.
2. Почти все **`apps/web` API `route.ts`** (57/59) содержат `try {`; два исключения — **намеренно тривиальные** маршруты.
3. Клиентский код **широко** использует `reportClientError`, плюс глобальные boundary и обработчики.
4. **В зоне действия правила ESLint `@gafus/require-client-catch-tracer`** (см. §11.1) на дату среза **0** предупреждений — то есть каждый **проверяемый** нетривиальный `catch` либо содержит `reportClientError`, либо отключение правила с комментарием, либо не попадает под правило из‑за тривиального тела.

**По-прежнему нельзя утверждать в абсолютной форме:**

1. Что **каждый** `catch` **во всём** репозитории вызывает `reportClientError` — файлы **без** `"use client"` в web/trainer/admin **не** входят в область правила (§11.1–§11.2).
2. Что **каждый** вызов `logger.error` в многострочной форме гарантированно получает **`Error`** во втором аргументе — выполнена только эвристика по **однострочным** вызовам (§11.3).
3. Полное покрытие **`packages/auth`** и **`packages/webpush/db`** локальным `try` — ошибки зависят от вызывающего кода (§4).

---

## 11. Дополнительный анализ (ESLint, `logger.error`, критичные потоки)

*Выполнено после первой версии инвентаря, чтобы закрыть вопросы из прежнего §10.*

### 11.1. Клиент: ESLint `@gafus/require-client-catch-tracer`

**Правило** (см. `scripts/eslint-rules.js`): для `CatchClause`, если тело **не** тривиально (не пустое, не только `throw`, не только `unstable_rethrow`), ожидается вызов `reportClientError` внутри тела `catch`.

**Область действия:**

- `apps/mobile/**` — все файлы;
- `apps/web`, `apps/trainer-panel`, `apps/admin-panel` — только файлы, где **`"use client"`** — первое выражение после блока `import` (как в реализации правила в `eslint-rules.js`);
- `packages/ui-components/src/**`;
- `packages/csrf/src/react/**`, `packages/csrf/src/store.ts`.

**Прогон** (корень репозитория):

```bash
pnpm exec eslint \
  "apps/web/src/**/*.{ts,tsx}" \
  "apps/trainer-panel/src/**/*.{ts,tsx}" \
  "apps/admin-panel/src/**/*.{ts,tsx}" \
  "apps/mobile/**/*.{ts,tsx}" \
  "packages/ui-components/src/**/*.{ts,tsx}" \
  "packages/csrf/src/react/**/*.{ts,tsx}" \
  "packages/csrf/src/store.ts" \
  --max-warnings 99999 -f json -o /tmp/gafus-eslint-tracer.json
```

Далее подсчёт `messages[].ruleId === "@gafus/require-client-catch-tracer"` в JSON.

**Результат на дату среза:** **0** предупреждений по этому правилу (при ~771 файле в выборке и сотнях прочих сообщений от других правил).

**Вывод:** для **всех** модулей, которые правило **может** проверить, нетривиальные `catch` либо уже согласованы с Tracer, либо освобождены точечным `eslint-disable` с комментарием.

### 11.2. Клиент: код **вне** области ESLint (web)

Скрипт: под `apps/web/src` файлы с `catch`, **без** `"use server"`, путь **не** `app/api/**`, **без** `"use client"` → **27 файлов**.

| Подмножество | Комментарий |
|--------------|-------------|
| Сторы (`timerStore`, `offlineStore`, `pushStore`, …) | В файле есть `reportClientError` + `logger` где уместно |
| RSC-страницы (`trainings/.../page.tsx`, `profile/page.tsx`, `articles/page.tsx`, …) | Ошибки данных → **`logger.error(..., error as Error \| new Error(...))`**, не клиентский Tracer |
| Хуки без директивы (`usePreloadComponents`, `useRefreshData`, `useServiceWorker`, `useCoursePrefetch`) | Требуют ручной ревью при изменениях; в инвентарь занесены как **вне зоны** правила |
| `shared/utils/sweetAlert.ts`, `shared/utils/hapticFeedback.ts` | Нет `"use client"` → правило **не** применяется; в `sweetAlert` есть `catch` с UI-сообщением без Tracer и тривиальные `catch { Swal.close() }` |
| `manageStepNotificationSimple.ts`, `authSchemas.ts`, `serviceWorkerManager.ts` | Вне ESLint-области для web-клиента |

**Вывод:** «каждый клиентский catch» **не** эквивалентен «проверено ESLint» — зона **расширяется** сторами и mobile целиком, но **не** покрывает общие `.ts` утилиты без `use client`.

### 11.3. Сервер: второй аргумент `logger.error` и `Error`

Сигнатура (`packages/logger`): `error(message: string, error?: Error, meta?: LogMeta)`.

**Эвристика 1 (однострочные вызовы):** обход всех `*.ts` / `*.tsx` в `apps/**` и `packages/**` (кроме `node_modules`, `.next`, `dist`); для строк, где весь вызов `logger.error(...);` умещается в одну строку, проверка: есть ли запятая верхнего уровня внутри скобок (второй аргумент).

**Результат:** **0** однострочных вызовов только с сообщением (без второго аргумента).

**Эвристика 2 (выборочно):** типичные паттерны в многострочных блоках — `error as Error`, `new Error(String(...))`, `instanceof Error ? … : new Error(…)`; для Zod — `ZodError` передаётся как `Error`.

**Ограничение:** полный синтаксический разбор всех многострочных вызовов **не** выполнялся; рекомендация — при смене логгера или Tracer прогонять выборочный аудит.

### 11.4. Критичные пользовательские потоки (экспертная карта + код)

Не формальное доказательство, а **сопоставление** ожидаемых потоков с механизмами наблюдаемости:

| Поток | Основной механизм Tracer / логов | Примечание |
|-------|-----------------------------------|------------|
| Вход, регистрация, сброс пароля (web) | `reportClientError` в формах (`LoginForm`, `RegisterForm`, `PasswordResetForm`, …) | См. grep по `issueKey` |
| Подтверждение телефона, VK consent | `ConfirmClient`, `VkConsentForm` | |
| Оплата курса/статьи (web) | `PaidCourseDrawer`, `PaidArticleDrawer`, `TrainingPageClient` (`handlePay`) | |
| Обязательная персонализация курса | `TrainingPageClient` (`need_personalization` / `reportClientError`) | |
| Тренировка: шаги, таймер, видео | `Day`, `AccordionStep`, `useStepTimer`, `VideoPlayerSection`, … | Часть — сторы + Tracer |
| Профиль web (питомцы, заметки, аватар) | соответствующие компоненты + server actions с `logger.error` | |
| Mobile: auth, профиль, push, смена фото | `reportClientError` в экранах и API-слое | |
| Mobile: день тренировки | `[dayId].tsx` и связанные хуки | |
| Необработанные ошибки рендера | `ErrorBoundary` в root layout (web, trainer, admin) | |
| Mobile: глобальные JS-ошибки | `installGlobalJsErrorHandler` | |
| Сбой Android ID (mobile) | `reportAndroidDeviceIdFailure` + fallback UUID | §7.3 |

### 11.5. Сводка после доп. анализа

| Вопрос | Ответ на дату среза |
|--------|---------------------|
| Каждый **проверяемый** ESLint’ом нетривиальный клиентский `catch` ведёт в Tracer (или отключён осознанно)? | **Да** — **0** warnings `@gafus/require-client-catch-tracer`. |
| Каждый `catch` **в любом** файле репозитория? | **Нет** — утилиты и модули **без** `use client` в Next-приложениях правилом не охвачены. |
| Каждый server `catch` передаёт в `logger.error` именно `Error`? | **Однострочные вызовы** без второго аргумента не найдены; **полная** гарантия по многострочным вызовам не строилась. |
| Все критичные продуктовые потоки покрыты? | **Карта §11.4** + дозакрытие зоны §11.2 (уведомления SW, префетч, refresh, sweetAlert, haptic); формальные исключения — только валидационные `catch` в схемах и иные намеренно тривиальные блоки. |

---

## 12. Воспроизведение проверок (команды)

Из корня репозитория:

```bash
# use server без try { (пример скрипта — см. историю docs/audit или повторить обход Path.rglob)
python3 -c "
from pathlib import Path
import re
try_re, use_re = re.compile(r'\\btry\\s*\\{'), re.compile(r\"['\\\"]use server['\\\"]\")
SKIP = {'node_modules', '.next', 'dist', '.turbo'}
for base in ['apps/web/src','apps/trainer-panel/src','apps/admin-panel/src','packages/auth/src','packages/csrf/src','packages/webpush/src']:
  p = Path(base)
  if not p.exists(): continue
  for f in p.rglob('*.ts'):
    if any(x in f.parts for x in SKIP): continue
    t = f.read_text(encoding='utf-8', errors='ignore')
    if use_re.search(t) and not try_re.search(t):
      print(f)
  for f in p.rglob('*.tsx'):
    if any(x in f.parts for x in SKIP): continue
    t = f.read_text(encoding='utf-8', errors='ignore')
    if use_re.search(t) and not try_re.search(t):
      print(f)
"

# API route.ts без try {
find apps/web/src/app/api -name route.ts -print0 | xargs -0 grep -L 'try {' 

# Файлы с reportClientError (обзор)
rg 'reportClientError' -g'*.{ts,tsx}' --stats

# ESLint только факт нарушений require-client-catch-tracer (после прогона в §11.1):
# jq '[.[] | .messages[] | select(.ruleId=="@gafus/require-client-catch-tracer")] | length' /tmp/gafus-eslint-tracer.json
```

---

## 13. Связанные документы

- `docs/audit/tracer-apptracer-gaps.md` — точечные пробелы и проходы.
- `docs/audit/tracer-client-catch-process.md` — процесс для клиентских `catch`.
- `.cursor/rules/error-handling.mdc` — каноничная схема web / mobile / server.
