# Промпт: Добавление haptic feedback в мобильное приложение

## Контекст

В GAFUS mobile уже есть:
- `apps/mobile/src/shared/lib/utils/haptics.ts` — утилита `hapticFeedback` (light, medium, heavy, success, error, warning, selection)
- Shared `Button` — haptic по умолчанию (`Haptics.impactAsync(Light)`)
- Успешные формы: login, register, reset-password, profile, pets — используют `hapticFeedback.success()`
- `StepTimer` — свои haptics для play/pause/reset

**Задача:** Добавить haptic в экраны и компоненты, где используются `Pressable`/`IconButton` напрямую (без shared Button).

---

## Приоритеты

### Высокий
- `confirm.tsx` — Pressable «Открыть Telegram», «mailto»
- `reminders.tsx` — «Добавить», удаление напоминания
- `training/[courseType]/index.tsx` — выбор дня, gender, paywall, offline
- `training/[courseType]/[dayId].tsx` — back, retry, export, close
- `CourseCard` — кнопка избранного (сердечко)

### Средний
- `FiltersModal` — вкладки, Apply, Reset, Close
- `AccordionStep` — toggle шага, IconButton таймера, diary save
- `TestQuestionsBlock` — выбор варианта, Submit
- `CourseSearch` — кнопка очистки поиска

---

## Правила использования hapticFeedback

| Ситуация | Метод |
|----------|-------|
| Нажатие кнопки (back, retry, add, close) | `hapticFeedback.light()` |
| Выбор опции (вкладка, gender, дата, day) | `hapticFeedback.selection()` |
| Toggle (accordion, switch) | `hapticFeedback.selection()` |
| Успешное действие (сохранение, добавление) | `hapticFeedback.success()` |
| Ошибка | `hapticFeedback.error()` |
| Открытие внешней ссылки (Telegram, mailto) | `hapticFeedback.light()` |

---

## Файлы для правки

```
apps/mobile/
├── app/(auth)/confirm.tsx
├── app/(main)/reminders.tsx
├── app/(main)/training/[courseType]/index.tsx
├── app/(main)/training/[courseType]/[dayId].tsx
└── src/features/
    ├── courses/components/
    │   ├── CourseCard.tsx
    │   ├── CourseSearch.tsx
    │   └── FiltersModal.tsx
    └── training/components/
        ├── AccordionStep.tsx
        └── TestQuestionsBlock.tsx
```

---

## Детали по каждому файлу

### 1. confirm.tsx
- `Pressable` «Открыть Telegram» (строка ~84): `onPress` → добавить `await hapticFeedback.light()` в начале
- `Pressable` mailto (строка ~101): аналогично
- `Button` «На стартовую» — уже с haptic через shared Button

### 2. reminders.tsx
- `Pressable` «Добавить» (handleCreate): `hapticFeedback.success()` после успешного добавления
- `Pressable` удаления напоминания: `hapticFeedback.light()` при onPress

### 3. training/[courseType]/index.tsx
- `Pressable` дня курса (`handleDayPress`): `hapticFeedback.selection()`
- `Pressable` back, retry: `hapticFeedback.light()`
- `Pressable` gender (male/female): `hapticFeedback.selection()`
- `Pressable` paywall (оплата, «Назад к курсам», «Оплатить на сайте»): `hapticFeedback.light()`
- `Pressable` offline (скачать, удалить, отменить, убрать из очереди): `hapticFeedback.light()`
- `Pressable` «Подставить склонения»: `hapticFeedback.light()`

### 4. training/[courseType]/[dayId].tsx
- `Pressable` back, retry, export path, close payment: `hapticFeedback.light()`

### 5. CourseCard.tsx
- `Pressable` `onToggleFavorite` (строка ~331): `hapticFeedback.selection()` или `hapticFeedback.light()` в начале onPress (до вызова `onToggleFavorite`). Т.к. колбэк приходит снаружи — обернуть в локальный handler или добавить haptic в `onPress` перед вызовом `onToggleFavorite`.

### 6. FiltersModal.tsx
- `Pressable` optionButton (вкладки tab, level, progress, rating): `hapticFeedback.selection()`
- `Pressable` reset, apply, close: `hapticFeedback.light()`

### 7. CourseSearch.tsx
- `Pressable` clear (очистка поиска): `hapticFeedback.light()`

### 8. AccordionStep.tsx
- `Pressable` onToggle (header): `hapticFeedback.selection()`
- `IconButton` таймера: `hapticFeedback.light()` или `selection` (play/pause — medium)
- `Pressable` diary save: `hapticFeedback.success()` при успешном сохранении
- `Pressable` «Следующий шаг» и подобные: `hapticFeedback.light()`

### 9. TestQuestionsBlock.tsx
- `Pressable` выбора варианта ответа: `hapticFeedback.selection()`
- `Pressable` Submit: `hapticFeedback.success()` при успешной отправке

---

## Импорт

```typescript
import { hapticFeedback } from "@/shared/lib/utils/haptics";
```

Вызовы — `await hapticFeedback.light()` или без await, если не нужно ждать.

---

## Порядок работ

1. Высокий приоритет: confirm → reminders → training index → training dayId → CourseCard
2. Средний: FiltersModal → CourseSearch → AccordionStep → TestQuestionsBlock
3. Сборка: `pnpm run build` (или `pnpm --filter mobile run build`)

---

## Замечания

- Не добавлять haptic в overlay backdrop (например `FiltersModal` overlay) — только в интерактивные кнопки
- Сохранять существующую логику onPress — haptic вызывать в начале или после успеха, не ломая flow
- На web `hapticFeedback` — no-op (проверка `Platform.OS !== "web"` уже в haptics.ts)
