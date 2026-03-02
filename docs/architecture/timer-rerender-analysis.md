# Анализ ререндеров при нажатии Пуск / Пауза / Рестарт таймера

## Архитектура компонентов

```
Day (from RSC page)
└── DayAccordionItem (memo) × N шагов
    ├── useStepState(courseId, dayId, index)  — подписка на stepStore.stepStates[stepKey]
    └── AccordionStep (только когда openIndex === index)
        ├── useStepTimer (внутри)
        │   ├── useStepState → stepStore
        │   ├── useTimerStore(timers.has) → timerStore
        │   ├── useTimerStore(useShallow {...}) → timerStore
        │   ├── useSyncStatus → useState (локальный)
        │   └── useCacheManager → updateStepProgress
        └── StepTimerCard
            └── useTimerStore(liveTimeLeftByStepKey[stepKey]) → timerStore
```

---

## FLOW 1: Пуск (Start)

### Последовательность вызовов

1. **onClick** → `handleStart` (useStepTimer)
2. `handleStart`:
   - `await startStepWithServer(...)` — Server Action (async)
   - `updateStepProgress(..., "IN_PROGRESS", durationSec, totalSteps)`
   - `onRun(stepIndex)` — вызывает `handleStepStart` в Day
   - `startStepTimer(false)`

3. **startStepWithServer** (timerStore, фоново):
   - `startUserStepServerAction` → updateUserStepStatus + createStepNotification + **invalidateUserProgressCache**

4. **updateStepProgress** (cacheManager):
   - `useStepStore.setState` — stepStates[stepKey] = IN_PROGRESS
   - `updateCoursesCache` → `courseStore.setAllCourses`, `setFavorites`, `setAuthored`

5. **onRun(stepIndex)** → `handleStepStart` в Day:
   - `setRunningIndex(stepIndex)` — **Day re-render**
   - `setStoreRunningIndex(...)` — trainingStore update

6. **startStepTimer**:
   - `resumeStep` (если resume) или пропуск
   - `startTimer(...)` в timerStore:
     - `set({ timers: new Map(timers) })` — **timerStore update**
     - tick callback каждую секунду: `setLiveTimeLeft(stepKey, timeLeft)` — **timerStore update**

### Ререндеры при Start

| # | Триггер | Кто ререндерится |
|---|---------|------------------|
| 1 | `handleStepStart` → setRunningIndex | Day |
| 2 | setRunningIndex → Day children (DayAccordionItem) | DayAccordionItem × N (потому что openIndex, onOpenChange в deps) |
| 3 | trainingStore.setRunningIndex | Все, кто подписан на trainingStore — сейчас Day использует селекторы |
| 4 | stepStore.setState (IN_PROGRESS) | AccordionStep (useStepState), DayAccordionItem (useStepState для этого шага) |
| 5 | timerStore.set(timers) | AccordionStep (hasActiveTimer), StepTimerCard (liveTimeLeft — но timers.has меняется) |
| 6 | courseStore.setAllCourses | Раньше useCacheManager подписывался — **уже убрано** |

**Вывод для Start:** Day ререндерится из‑за `setRunningIndex`. DayAccordionItem ререндерится из‑за (a) нового `openIndex` в props при ререндере Day, (b) `stepState` в stepStore. AccordionStep ререндерится из stepStore + timerStore.

---

## FLOW 2: Пауза (Pause)

### Последовательность вызовов

1. **onClick** → `togglePause` (useStepTimer)
2. `togglePause` (isActuallyRunning === true):
   - `setIsPausing(true)` — **AccordionStep re-render #1**
   - `await pauseStepWithServer(...)`
   - `updateStepProgress(..., "PAUSED")`
   - `setLiveTimeLeft(stepKey, null)` в finally
   - `setIsPausing(false)` в finally — **AccordionStep re-render #2**

3. **pauseStepWithServer** (timerStore):
   - `stepStore.pauseStep(...)`:
     - `stopTimer` → `setLiveTimeLeft(null)`, `set({ timers })` — **2 timerStore updates**
     - `stepStore.setState` PAUSED — **stepStore update**
   - В фоне: `pauseNotification` → `pauseUserStepServerAction` → **invalidateUserProgressCache**

4. **updateStepProgress** для PAUSED:
   - Не вызывает pauseStep (уже сделан)
   - `updateCoursesCache` → courseStore

5. **stopTimer** (в pauseStep):
   - `get().setLiveTimeLeft(stepKey, null)` — **timerStore**
   - `set({ timers: new Map(timers) })` — **timerStore**

### Ререндеры при Pause

| # | Триггер | Кто ререндерится |
|---|---------|------------------|
| 1 | setIsPausing(true) | AccordionStep |
| 2 | timerStore.setLiveTimeLeft(null) | StepTimerCard (liveTimeLeftByStepKey) |
| 3 | timerStore.set(timers) | AccordionStep (hasActiveTimer: true→false) |
| 4 | stepStore.setState(PAUSED) | AccordionStep (useStepState), DayAccordionItem (useStepState) |
| 5 | setIsPausing(false) | AccordionStep |
| 6 | courseStore (updateCoursesCache) | Уже не подписан useCacheManager |

**Главное:** При паузе stepStore обновляется → ререндер AccordionStep и DayAccordionItem. timerStore обновляется дважды (liveTimeLeft + timers) → StepTimerCard и AccordionStep. Плюс два setState isPausing в самом AccordionStep.

---

## FLOW 3: Возобновление (Resume)

Аналогично Pause, но с resumeStep, resumeNotification, IN_PROGRESS.

---

## FLOW 4: Рестарт (Reset)

1. **onClick** → `handleReset`
2. `await resetStepWithServer`
3. **resetStepWithServer** (timerStore):
   - `stopTimer` — timerStore × 2
   - `stepStore.resetStep` — stepStore
   - `updateStepStatusServerAction` → invalidateUserProgressCache
   - `resetNotificationClient`
4. `setLiveTimeLeft(stepKey, null)`
5. `onReset(stepIndex)` → `handleReset` в Day: `setRunningIndex(null)` если runningIndex === stepIndex

### Ререндеры при Reset

Аналогично Pause: stepStore, timerStore, Day (при изменении runningIndex).

---

## КОРНЕВЫЕ ПРИЧИНЫ ЛИШНИХ РЕРЕНДЕРОВ

### 1. Дублирование обновлений stepStore

- `pauseStepWithServer` вызывает `stepStore.pauseStep` (обновляет stepStore).
- Сразу после этого `togglePause` вызывает `updateStepProgress(PAUSED)`.
- Для PAUSED updateStepProgress не трогает stepStore, но вызывает `updateCoursesCache`.
- Итого: один stepStore update — но подписаны и AccordionStep, и DayAccordionItem.

### 2. Два обновления timerStore при stop

- `stopTimer`: `setLiveTimeLeft(stepKey, null)` и `set({ timers: new Map(timers) })`.
- Каждое вызывает ререндер подписчиков.
- StepTimerCard подписан на `liveTimeLeftByStepKey[stepKey]`.
- useStepTimer подписан на `timers.has(stepKey)`.
- Можно объединить в один `set()`.

### 3. handleStepStart / handleReset в Day меняют runningIndex

- `setRunningIndex` → ререндер Day.
- Day рендерит все DayAccordionItem.
- DayAccordionItem в memo, но получает `onOpenChange`, `onStepStart`, `onReset` — они создаются через useCallback с deps [training.courseId, training.dayOnCourseId, ...].
- Если training не меняется, коллбэки стабильны. Но при ререндере Day всё равно создаётся новый JSX для всех детей.

### 4. DayAccordionItem подписан на useStepState

- При любом изменении stepStore.stepStates[stepKey] DayAccordionItem ререндерится.
- Это ожидаемо для отображения статуса в заголовке (PAUSED, IN_PROGRESS и т.д.).
- Без этого заголовок не обновится.

### 5. AccordionStep использует useSyncStatus (useState)

- startSync/finishSync при завершении шага вызывают setState.
- useSyncStatus — локальный state в компоненте, который его использует.
- Ререндер только этого компонента (AccordionStep) — это ок.

### 6. initializeStep в useEffect useStepTimer

```javascript
useEffect(() => {
  initializeStep(courseId, dayOnCourseId, stepIndex, durationSec, initialStatus);
}, [courseId, dayOnCourseId, stepIndex, durationSec, initialStatus, initializeStep]);
```

- `initializeStep` из useStepStore — стабильная ссылка.
- При первом рендере эффект запускается.
- `initializeStep` может вызывать setState в stepStore, если existingState и server rank различаются — лишний ререндер.

### 7. invalidateUserProgressCache и RSC

- `revalidateTag("training")`, `revalidateTag("days")` и т.д.
- getTrainingDayWithUserSteps **не использует** unstable_cache с тегами — прямая функция.
- getTrainingDays (список) использует теги.
- Страница дня, скорее всего, не рефетчится при revalidateTag.
- Но если где‑то используется fetch с этими тегами для дня — будет refetch и новый RSC payload → новый объект training → ререндер Day (если бы не memo).

---

## РЕКОМЕНДАЦИИ (без React.memo)

### 1. Объединить обновления timerStore при stop

В `stopTimer` делать один вызов:

```javascript
set((s) => {
  const { [stepKey]: _, ...rest } = s.liveTimeLeftByStepKey;
  return {
    timers: new Map(timers),
    liveTimeLeftByStepKey: rest,
  };
});
```

Вместо двух `set()`.

### 2. Убрать двойной setIsPausing

Можно использовать один `setIsPausing(false)` в finally и не вызывать `setIsPausing(true)` если это не даёт пользы UI. Или обернуть в `startTransition` для понижения приоритета.

### 3. Ограничить ререндер Day от setRunningIndex

`runningIndex` нужен для UI (какой шаг «запущен»). Но его изменение ререндерит весь Day. Вариант — вынести индикатор running в отдельный компонент с подпиской на trainingStore только для `getRunningIndex(courseId, dayId)`.

### 4. Проверить, нужен ли updateStepProgress при pause

При pause вызываются:
- pauseStepWithServer (stepStore.pauseStep + pauseNotification)
- updateStepProgress(PAUSED)

updateStepProgress для PAUSED не меняет stepStore (пауза уже сделана), только updateCoursesCache. courseStore на странице дня может быть пустым (allCourses, favorites) — тогда updateCoursesCache почти ничего не делает. Можно откладывать или не вызывать updateStepProgress на странице дня при pause/resume.

### 5. useShallow в useTimerStore

```javascript
useTimerStore(useShallow((s) => ({
  startTimer: s.startTimer,
  ...
})))
```

useShallow возвращает новый объект при каждом вызове селектора. Zustand сравнивает результат — если ссылки на функции те же, объект считается равным. Функции в store стабильны, так что ререндеров из‑за этого быть не должно.

---

## ИТОГОВАЯ ЦЕПОЧКА (Pause, упрощённо)

1. Клик → togglePause
2. setIsPausing(true) → AccordionStep re-render
3. pauseStepWithServer:
   - stepStore.pauseStep → stopTimer + stepStore.setState
   - stopTimer → setLiveTimeLeft + set(timers) → 2 timerStore updates
   - stepStore.setState → stepStore update
4. Подписчики:
   - timerStore (liveTimeLeft, timers): StepTimerCard, AccordionStep
   - stepStore: AccordionStep, DayAccordionItem
5. updateStepProgress → updateCoursesCache (без подписки в useCacheManager)
6. setIsPausing(false) → AccordionStep re-render

Минимум 4–5 ререндеров AccordionStep при одном клике Pause — из‑за цепочки: isPausing → timerStore × 2 → stepStore → isPausing.

---

## РЕАЛИЗОВАНО (по рекомендациям react-state-management)

### 1. Селекторы Zustand

| Store | Селектор | Где используется |
|-------|----------|------------------|
| timerStore | `useLiveTimeLeft(stepKey)` | StepTimerCard — ререндер только при изменении времени этого шага |
| timerStore | `useHasActiveTimer(stepKey)` | useStepTimer — ререндер только при has(stepKey) |
| timerStore | `useCleanupTimers` | `(s) => s.cleanupTimers` вместо `useTimerStore()` |
| trainingStore | `useDayOpenIndex(courseId, dayId)` | Не используется — Day держит openIndex локально |
| trainingStore | `useDayRunningIndex(courseId, dayId)` | Day — ререндер только при изменении runningIndex этого дня |
| stepStore | `useStepState(courseId, dayId, index)` | DayAccordionItem, AccordionStep — уже было |

### 2. Colocate state

- **Day**: `openIndex` — локальный (useState), синхронизация с trainingStore для persist. Локальный стейт предотвращает рассинхронизацию при setStoreRunningIndex (Play).
- **Day**: `runningIndex` — из `useDayRunningIndex` (селектор trainingStore). Day ререндерится только при изменении `runningSteps[dayKey]`.

### 3. Батчинг timerStore

- `stopTimer`: один `set({ timers, liveTimeLeftByStepKey })` вместо двух вызовов.

### 4. RSC refetch при Play (корневая причина закрытия шага)

**Проблема:** При нажатии Play вызывался `startUserStepServerAction` → `updateUserStepStatus` → `invalidateUserProgressCache` (await) → `revalidateTag`. Синхронная инвалидация перед возвратом Server Action приводила к RSC refetch текущей страницы → Day unmount/remount → контент шага пропадал (stepState ещё не инициализирован в новом дереве).

**Решение:** `after()` из `next/server` — инвалидация выполняется после отправки ответа клиенту. Для IN_PROGRESS, RESET, COMPLETED, pause, resume используем `after(() => invalidateUserProgressCache(...))`. См. [Next.js functions — after](https://nextjs.org/docs/app/api-reference/functions/after).

**Best practices (next-best-practices, nextjs-app-router-patterns):** `after` — официальный API Next.js для выполнения кода после завершения стриминга ответа. Альтернативы (void, setTimeout) — хак. Переход на `after()` — правильный подход: клиент получает ответ, UI обновляется через stepStore/cacheManager, кэш инвалидируется позже; при следующей навигации/refetch данные свежие.

---

## СООТВЕТСТВИЕ СКИЛЛАМ

Сопоставление с `next-best-practices`, `nextjs-app-router-patterns`, `react-state-management`.

### ✅ Соответствует

| Область | Скилл | Реализация |
|---------|-------|------------|
| **RSC / Client boundary** | rsc-boundaries | Day — Client Component, получает `training` (plain object) из Server Component page. Props сериализуемы. |
| **Data fetching** | data-patterns | Страница дня — async Server Component, вызывает `getTrainingDayWithUserSteps`. Клиент не фетчит — данные приходят как props. |
| **Server Actions** | nextjs-app-router | Мутации (старт, пауза, сброс, завершение) — Server Actions. Валидация Zod, возврат `{ success, error }`. |
| **after()** | next-best-practices, functions | Инвалидация кэша через `after()` — код после ответа. Официальный API. |
| **Zustand селекторы** | react-state-management | `useLiveTimeLeft(stepKey)`, `useHasActiveTimer(stepKey)`, `useDayRunningIndex`, `useStepState` — селективная подписка, меньше ререндеров. |
| **Colocate state** | react-state-management | Локальный openIndex в Day; runningIndex — из store через селектор. |
| **Separate concerns** | react-state-management | stepStore (шаги), timerStore (таймеры), trainingStore (UI дня), courseStore (курсы) — разделение по доменам. |
| **Optimistic updates** | nextjs-app-router | `updateStepProgress` до ответа Server Action; при ошибке — offline queue. |
| **useShallow** | react-state-management | useStepTimer: `useTimerStore(useShallow({...}))` — стабильные ссылки на функции. |

### ⚠️ Рекомендуется улучшить

| Область | Скилл | Текущее | Рекомендация |
|---------|-------|---------|--------------|
| **useTransition** | nextjs-app-router | ✅ Реализовано | useStepTimer, AccordionStep, DayAccordionItem — Server Actions обёрнуты в `startTransition`, кнопки получают `disabled={isPending}`. |
| **Client errors → Tracer** | error-handling | Клиентские ошибки — `reportClientError` → Tracer | `console.error`/`logger` в клиенте заменены на `reportClientError`. TracerProvider (web) инициализирует bridge → apptracer.ru. |
| **Loading states** | nextjs-app-router | ✅ Реализовано | StepTimerCard: `disabled={isPending}` для Play/Pause/Reset. StepPracticeBlock: `disabled={isCompleting}` для «Я выполнил». |
| **Error boundaries** | next-best-practices | ✅ ErrorBoundary в layout | Глобальный ErrorBoundary из `@gafus/error-handling` оборачивает приложение. `error.tsx` не требуется. |

### 📋 Дополнительные проверки

- **Props serialization**: `TrainingDetail` передаётся с сервера — проверить, что нет `Date` (должны быть ISO string) и `Map`/`Set`. ✅ Обычно Prisma Date сериализуется.
- **Don't fetch in Client Components**: AccordionStep, Day — не делают fetch, данные приходят сверху. ✅
- **Server Action return shape**: Все actions возвращают `{ success: boolean }` или `{ success, error }`. ✅

### Клиентские ошибки → Tracer

Веб-логи (не серверные): ошибки в клиентских компонентах отправляются через `reportClientError` из `@gafus/error-handling` в Tracer (apptracer.ru). TracerProvider в web инициализирует `@apptracer/sdk` и устанавливает `window.__gafusReportError`. ErrorBoundary и ручные catch → `reportClientError` → Tracer. Серверные логи — `@gafus/logger` → Pino → Seq.
