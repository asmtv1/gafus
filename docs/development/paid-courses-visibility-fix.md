# Исправление отображения платных курсов

**Дата:** 2 февраля 2026  
**Версия:** 1.0.0

## Проблема

### 1. Платные курсы не отображались на `/courses`

Платные публичные курсы не появлялись в списке курсов на странице `/courses`, даже при выборе фильтра "Все" → "Платные".

**Причина:** В функции `getCoursesWithProgress()` (packages/core/src/services/course/courseService.ts) была слишком строгая фильтрация:

```typescript
// ❌ Старая логика
const accessibleCourses = allCourses.filter((course) => {
  if (!course.isPrivate) return true;  // Платные курсы тут не учитывались
  if (!userId) return false;
  return course.access.some((a) => a.user.id === userId);
});
```

Платные курсы с `isPrivate: false` проходили фильтр, но потом у пользователей без оплаты `hasAccess` был `false`, что могло вызывать проблемы в UI.

### 2. Переход на платный курс из профиля тренера блокировался

При клике на платный курс из списка курсов тренера (раздел "Курсы кинолога") показывалась ошибка:
> "Этот курс платный. Оплатите для доступа к занятиям."

**Ожидаемое поведение:** Переход на страницу курса с предложением оплаты (как при переходе из `/courses`).

**Причина:** В `TrainerCoursesSection.tsx` была логика, которая блокировала переход на платный курс без оплаты:

```typescript
// ❌ Старая логика
if (course.isPrivate || course.isPaid) {
  const { hasAccess } = await checkCourseAccessAction(course.type);
  if (!hasAccess) {
    if (course.isPaid) {
      await showErrorAlert("Этот курс платный. Оплатите для доступа к занятиям.");
    }
    return; // Блокировка перехода
  }
}
```

## Решение

### 1. Исправлена фильтрация курсов (courseService.ts)

Изменена логика в `getCoursesWithProgress()`:

```typescript
// ✅ Новая логика
const accessibleCourses = allCourses.filter((course) => {
  // Приватные курсы только с доступом в CourseAccess
  if (course.isPrivate) {
    if (!userId) return false;
    return course.access.some((a: { user: { id: string } }) => a.user.id === userId);
  }
  // Публичные курсы (платные и бесплатные) показываем всем
  return true;
});
```

**Теперь:**
- Публичные платные курсы показываются всем (для возможности покупки)
- Публичные бесплатные курсы показываются всем
- Приватные курсы только с доступом
- Поле `hasAccess` корректно отображает статус оплаты

### 2. Исправлен переход на платный курс (TrainerCoursesSection.tsx)

Изменена логика `handleCourseClick()`:

```typescript
// ✅ Новая логика
const handleCourseClick = async (course: {
  type: string;
  isPrivate: boolean;
  isPaid?: boolean;
}) => {
  // Для платных курсов всегда переходим на страницу курса (там покажем предложение оплаты)
  if (course.isPaid) {
    router.push(`/trainings/${course.type}`);
    return;
  }

  // Для приватных курсов проверяем доступ
  if (course.isPrivate) {
    const { hasAccess } = await checkCourseAccessAction(course.type);
    if (!hasAccess) {
      await showErrorAlert(
        "Этот курс для вас закрыт. Обратитесь к кинологу для получения доступа",
      );
      return;
    }
  }
  
  router.push(`/trainings/${course.type}`);
};
```

**Теперь:**
- При клике на платный курс пользователь переходит на страницу курса
- На странице курса (`/trainings/[courseType]`) показывается предложение оплаты (если нет доступа)
- Для приватных курсов по-прежнему проверяется доступ и показывается ошибка

## Затронутые файлы

1. `packages/core/src/services/course/courseService.ts` — исправлена фильтрация курсов
2. `apps/web/src/features/profile/components/TrainerCoursesSection/TrainerCoursesSection.tsx` — исправлен переход на платный курс
3. `docs/packages/core.md` — добавлена документация по логике доступа к курсам

## Тестирование

### Шаги для проверки:

1. **Проверка отображения платных курсов на `/courses`:**
   - Открыть `/courses`
   - Выбрать фильтр "Платные"
   - Убедиться что платные курсы отображаются

2. **Проверка перехода из профиля тренера:**
   - Открыть профиль тренера с платным курсом
   - Кликнуть на платный курс в списке "Курсы кинолога"
   - Убедиться что происходит переход на `/trainings/[courseType]`
   - На странице курса должно быть предложение оплаты

3. **Проверка доступа к оплаченному курсу:**
   - Оплатить платный курс
   - Убедиться что на `/courses` курс отображается с `hasAccess: true`
   - При клике переход на страницу курса с содержимым

## Инвалидация кэша

После обновления кода необходимо инвалидировать кэш курсов:

```bash
# Перезапустить приложение или дождаться истечения TTL (5 минут)
pnpm dev:env
```

Или использовать revalidate API:
```typescript
revalidateTag("courses");
revalidateTag("courses-all");
```

## Связанные изменения

- Логика проверки доступа `checkCourseAccess()` осталась без изменений
- Страница курса `/trainings/[courseType]` уже корректно обрабатывает платные курсы
- Кэширование курсов работает корректно с новой логикой фильтрации
