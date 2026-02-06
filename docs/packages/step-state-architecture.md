# Архитектура состояния шагов тренировки

## Принцип единого источника истины

**stepStore (Zustand)** — единственный источник статуса для UI после инициализации.

## Поток данных

1. **Инициализация**: сервер → `initializeStep()` → stepStore
2. **Рантайм**: пользовательские действия → stepStore → UI
3. **Отображение**: `getStepDisplayStatus(stepState, serverStep)`

## Функция getStepDisplayStatus

Чистая функция в `packages/core/src/utils/training.ts`:

- **Приоритет**: локальное состояние (stepStore)
- **Fallback**: серверные данные (первый рендер до initializeStep)
- **Защита от edge cases**: пустая строка, null, undefined

## Почему не хук?

Rules of Hooks запрещают вызов хуков внутри `map`. Day уже подписан на `stepStates`, поэтому используем чистую функцию.

## Ссылки

- [react-state-management](../../.agents/skills/react-state-management/SKILL.md)
- [stepStore.ts](../../apps/web/src/shared/stores/stepStore.ts)
