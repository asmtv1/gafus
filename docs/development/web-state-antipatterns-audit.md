# Аудит web: антипаттерны состояния и соответствие skills

Проверка по: `react-state-management`, `code-review-excellence`, `next-best-practices`, `nextjs-app-router-patterns`.

**Обновление 2025-02:** Senior-ревью плана рефакторинга — см. `.cursor/plans/refactoring_step_status_state_777b40f9.plan.md`. Большая часть плана реализована; после каждого этапа — `pnpm run build` (24 successful).

---

## 1. Исправлено (рефакторинг step status)

| Паттерн | Файл | Статус |
|---------|------|--------|
| Два источника истины для статуса шага (stepStore + step.isPausedOnServer) | Day.tsx | Исправлено: `getStepDisplayStatus(stepState, step)` в core |

---

## 2. Обнаруженные антипаттерны и рекомендации

### 2.1 Day-level: RESET перезаписывался серверным COMPLETED — ИСПРАВЛЕНО

**Файлы:** `TrainingDayList.tsx`, `useCourseProgressSync.ts`, `packages/core/src/utils/training.ts`

**Было:** Функция `rank()` не учитывала RESET. При `localStatus=RESET` выбирался COMPLETED с сервера.

**Сделано:** Добавлена `getDayDisplayStatus(localStatus, serverStatus)` в core — RESET имеет приоритет, иначе берётся максимум по rank. TrainingDayList и useCourseProgressSync переведены на её использование.

---

### 2.2 Дублирование логики rank() и merge

**Файлы:** `TrainingDayList.tsx` (rank), `useCourseProgressSync.ts` (rank), `stepStore.ts` (rank)

**Проблема:** Одна и та же логика `rank()` и слияния local/server разнесена по 3 местам. Риск расхождений (как с RESET).

**Рекомендация:** Вынести в `packages/core` общую функцию, например:

```typescript
// packages/core/src/utils/training.ts
export function getDayDisplayStatus(
  localStatus: TrainingStatus,
  serverStatus?: string
): TrainingStatus {
  if (localStatus === TrainingStatus.RESET) return TrainingStatus.RESET;
  const r = (s?: string) => {
    if (s === "COMPLETED") return 2;
    if (s === "IN_PROGRESS" || s === "PAUSED" || s === "RESET") return 1;
    return 0;
  };
  return r(localStatus) >= r(serverStatus) ? localStatus : (serverStatus as TrainingStatus) ?? TrainingStatus.NOT_STARTED;
}
```

---

### 2.3 Отсутствие селекторов Zustand — ИСПРАВЛЕНО

**Файлы:** `Day.tsx`, `TrainingDayList.tsx`, `AccordionStep.tsx`, `stepStore.ts`

**Сделано:** Добавлены селекторы в stepStore:
- `useDayStepStates(courseId, dayOnCourseId)` — Day.tsx
- `useStepStatesForCourse(courseId)` — TrainingDayList
- `useStepState(courseId, dayOnCourseId, stepIndex)` — AccordionStep

Действия подписаны точечно через `useStepStore((s) => s.action)`.

---

### 2.4 syncedCourses || allCourses?.data — неявный приоритет

**Файлы:** `CoursesClient.tsx`, `useCourseProgressSync.ts`, `UserCoursesStatistics.tsx`, `useAchievementsFromStores.ts`

**Паттерн:** `syncedCourses || allCourses?.data`

**Оценка:** Это не антипаттерн. `syncedCourses` — результат синхронизации (derived), при отсутствии используется store. Логика: derive, don't sync — допустимо.

---

### 2.5 CourseCard: isFavorite — store vs props

**Файл:** `CourseCard.tsx`

```typescript
const isFavorite = storeIsFavorite(id) ?? propIsFavorite;
```

**Оценка:** Store приоритетнее props. Если store не инициализирован — fallback на props. Нормальный паттерн для hydration.

---

### 2.6 console.warn в production

**Файл:** `TrainingDayList.tsx:161`

```typescript
if (process.env.NODE_ENV !== "production") {
  console.warn("[TrainingDayList] Day time debug", {...});
}
```

**Оценка:** Условный лог, в production не выполняется. Не критично.

---

## 3. Соответствие skills

| Skill | Критерий | Статус |
|-------|----------|--------|
| react-state-management | Don't duplicate server state | Day (шаги) — исправлено; Day (дни) — RESET-баг |
| react-state-management | Use selectors | Day, TrainingDayList, AccordionStep — исправлено |
| react-state-management | Separate concerns | Server (init) vs client (runtime) — соблюдено для шагов |
| react-state-management | Colocate state | stepStore — централизованно, ок |
| code-review-excellence | Edge cases | RESET vs COMPLETED — не учтён |
| code-review-excellence | Logic correctness | Дублирование rank() в 3 местах |

---

## 4. Приоритеты исправлений

1. **Высокий:** RESET в TrainingDayList и useCourseProgressSync (корректное отображение после сброса).
2. **Средний:** Общая функция `getDayDisplayStatus` в core для унификации логики.
3. **Низкий:** Селекторы Zustand — выполнено (useDayStepStates, useStepStatesForCourse, useStepState).
