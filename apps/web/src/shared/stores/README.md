# Архитектура сторов для тренировок

## 🏗️ **Разделение ответственности**

Вместо одного монолитного `trainingStore`, мы разделили логику на три специализированных стора:

### 1. **`trainingStore`** - Управление состоянием дней

- ✅ Открытые/закрытые дни (`openIndexes`)
- ✅ Активные шаги (`runningSteps`)
- ✅ Назначения курсов (`courseAssignments`)
- ✅ Ошибки назначений (`assignErrors`)

### 2. **`stepStore`** - Управление состоянием шагов

- ✅ Состояния шагов (`stepStates`)
- ✅ Инициализация, запуск, пауза, завершение, сброс
- ✅ Восстановление из localStorage
- ✅ Синхронизация времени
- ✅ Очистка устаревших данных

### 3. **`timerStore`** - Управление таймерами

- ✅ JavaScript таймеры (`setInterval`)
- ✅ Запуск/остановка таймеров
- ✅ Callback'и для обновления времени и завершения
- ✅ Серверные действия (start, finish, reset)

## 🔄 **Как использовать**

### В компонентах:

```tsx
import { useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useTrainingStore } from "@shared/stores/trainingStore";

function MyComponent() {
  // Управление шагами
  const { stepStates, startStep, pauseStep } = useStepStore();

  // Управление таймерами
  const { startTimer, stopTimer } = useTimerStore();

  // Управление днями
  const { setRunningIndex, getRunningIndex } = useTrainingStore();

  // ... логика компонента
}
```

## 🎯 **Преимущества новой архитектуры**

1. **Разделение ответственности** - каждый стор отвечает за свою область
2. **Лучшая тестируемость** - можно тестировать каждый стор отдельно
3. **Легче поддерживать** - изменения в одном сторе не влияют на другие
4. **Переиспользование** - таймеры можно использовать в других частях приложения
5. **Чистый код** - каждый стор имеет четкую цель и API

## 🔧 **Миграция**

Старый `trainingStore` был упрощен и теперь содержит только логику управления днями. Вся логика шагов и таймеров перенесена в соответствующие сторы.

## 📝 **Примеры использования**

### Запуск шага:

```tsx
const { startStep } = useStepStore();
const { startTimer } = useTimerStore();

// Запускаем шаг
startStep(courseId, day, stepIndex, durationSec);

// Запускаем таймер
startTimer(
  courseId,
  day,
  stepIndex,
  (timeLeft) => updateTimeLeft(timeLeft), // callback обновления
  () => finishStep(), // callback завершения
);
```

### Восстановление состояния:

```tsx
const { restoreStepFromLS } = useStepStore();

// Восстанавливаем шаг из localStorage
const restoredState = restoreStepFromLS(courseId, day, stepIndex);
if (restoredState) {
  // Шаг был активен, восстанавливаем таймер
}
```
