# Архитектура состояния шагов тренировки

## Принцип единого источника истины

**stepStore (Zustand)** — единственный источник статуса для UI после инициализации.

## Поток данных

1. **Инициализация**: сервер → `initializeStep()` → stepStore
2. **Рантайм**: пользовательские действия → stepStore → UI
3. **Отображение**: `getStepDisplayStatus(stepState, serverStep)`

## Функции в packages/core (training.ts)

- **getStepDisplayStatus** — статус шага для UI: приоритет stepStore, fallback — сервер.
- **statusRank** — ранг статуса для сравнения при слиянии local/server; экспортируется, используется в web stepStore.
- **getDayDisplayStatus** — слияние локального и серверного статуса дня: RESET имеет приоритет над серверным COMPLETED; иначе берётся максимум по rank. Используется на web (TrainingDayList, useCourseProgressSync) и на mobile (экран списка дней).
- **calculateDayStatus** / **calculateCourseStatus** — расчёт статуса дня/курса по stepStates; для курса при наличии передаётся `dayOnCourseIds` (из course.dayLinks), чтобы не парсить ключи с дефисами.

## Почему не хук?

Rules of Hooks запрещают вызов хуков внутри `map`. Day уже подписан на `stepStates`, поэтому используем чистую функцию.

## Ссылки

- [react-state-management](../../.agents/skills/react-state-management/SKILL.md)
- [stepStore.ts](../../apps/web/src/shared/stores/stepStore.ts)
