# Аудит web: антипаттерны состояния и соответствие skills

Проверка по: `react-state-management`, `code-review-excellence`, `next-best-practices`, `nextjs-app-router-patterns`.

**Обновление 2025-02:** Senior-ревью плана рефакторинга — см. `.cursor/plans/refactoring_step_status_state_777b40f9.plan.md`. Большая часть плана реализована; после каждого этапа — `pnpm run build` (24 successful).

**Обновление 2025-02-06 (рефакторинг статусов web + mobile):** Реализован план `.cursor/plans/рефакторинг_статусов_web_и_mobile_c17d8a63.plan.md`. Исправлено: дублирование rank (web stepStore использует `statusRank` из core); побочный эффект в useMemo (useCourseProgressSync — расчёт перенесён в useEffect + useState); подписка на stepStates в cacheManager заменена на селектор по `updateStepStatus`, stepStates читаются через getState(); парсинг ключей stepStates для courseIds заменён на список курсов из courseStore с передачей dayOnCourseIds в calculateCourseStatus; console.log в stepStore/timerStore заменены на logger; AccordionStep (web) и Day (web) — селекторы с useShallow / стабильные deps; на mobile экран списка дней переведён на getDayDisplayStatus из core (исправлен баг RESET vs COMPLETED); в mobile добавлены селекторы useDayStepStates и useStepStatesForCourse.

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

### 2.2 Дублирование логики rank() и merge — ИСПРАВЛЕНО

**Было:** Одна и та же логика `rank()` и слияния local/server в stepStore (web), на экране списка дней mobile (свой rank, баг RESET vs COMPLETED).

**Сделано:** В core экспортирована `statusRank`, web stepStore использует её; слияние local/server для дней — `getDayDisplayStatus(localStatus, serverStatus)` в core. Web: TrainingDayList, useCourseProgressSync уже используют getDayDisplayStatus. Mobile: экран списка дней переведён на getDayDisplayStatus (RESET имеет приоритет над серверным COMPLETED).

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

1. **Высокий:** RESET в TrainingDayList и useCourseProgressSync — выполнено (getDayDisplayStatus в core).
2. **Средний:** Общая функция getDayDisplayStatus и statusRank в core — выполнено.
3. **Низкий:** Селекторы Zustand (web и mobile) — выполнено.
