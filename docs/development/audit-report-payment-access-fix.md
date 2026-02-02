# Отчёт: Исправление проблемы с открытием курса после оплаты

**Дата:** 2 февраля 2026  
**Статус:** ✅ Исправлено

## Описание проблемы

После успешной оплаты курса через ЮKassa курс не открывался для пользователя ни на проде, ни локально.

## Причина

В функциях проверки доступа к курсу (`checkCourseAccess` и `checkCourseAccessById` в `packages/core/src/services/course/courseService.ts`) для платных курсов выполнялась **неправильная проверка**:

### ❌ Было (неправильно)
```typescript
if (course.isPaid) {
  const paid = await prisma.payment.findFirst({
    where: { courseId: course.id, userId, status: "SUCCEEDED" },
    select: { id: true },
  });
  return { hasAccess: !!paid };
}
```

**Проблема:** Проверка доступа смотрела только на таблицу `Payment`, но webhook при успешной оплате создаёт доступ в таблице `CourseAccess`.

### ✅ Стало (правильно)
```typescript
// Для платных и приватных курсов проверяем наличие доступа в CourseAccess
if (course.isPaid || course.isPrivate) {
  return { hasAccess: course.access.length > 0 };
}

// Публичные бесплатные курсы доступны всем
return { hasAccess: true };
```

## Логика работы

1. **Создание платежа** (`/api/v1/payments/create`):
   - Создаётся запись в таблице `Payment` со статусом `PENDING`
   - Создаётся платёж в ЮKassa
   - Пользователь редиректится на страницу оплаты ЮKassa

2. **Webhook от ЮKassa** (`/api/v1/payments/webhook`):
   - При событии `payment.succeeded` вызывается `confirmPaymentFromWebhook()`
   - **Создаётся запись в таблице `CourseAccess`** (это даёт доступ к курсу)
   - Обновляется статус в таблице `Payment` на `SUCCEEDED`
   - Инвалидируется кэш

3. **Проверка доступа** (`checkCourseAccess`, `checkCourseAccessById`):
   - Для платных курсов проверяется наличие записи в **таблице `CourseAccess`**
   - Для приватных курсов тоже проверяется `CourseAccess`
   - Публичные бесплатные курсы доступны всем

## Изменённые файлы

### 1. `packages/core/src/services/course/courseService.ts`
- Исправлена функция `checkCourseAccess()` (строки 187-206)
- Исправлена функция `checkCourseAccessById()` (строки 225-244)
- Теперь обе функции проверяют таблицу `CourseAccess`, а не `Payment`

### 2. `docs/payments/yookassa.md`
- Добавлено пояснение о том, что проверка доступа выполняется по таблице `CourseAccess`
- Уточнено, что webhook создаёт запись в `CourseAccess`

## Сборка проекта

✅ Сборка пакета `@gafus/core` прошла успешно без ошибок

## Рекомендации по тестированию

1. **Локальное тестирование:**
   - Использовать ngrok для получения HTTPS URL
   - Указать webhook URL в тестовом магазине ЮKassa
   - Выполнить тестовую оплату
   - Проверить, что после успешной оплаты:
     - В БД появилась запись в `CourseAccess`
     - В БД обновился статус `Payment` на `SUCCEEDED`
     - Курс открылся для пользователя

2. **Production тестирование:**
   - Проверить, что webhook URL правильно настроен в боевом магазине ЮKassa
   - Выполнить тестовую оплату
   - Убедиться, что курс открывается сразу после оплаты

## Дополнительные проверки

- ✅ Линтер: ошибок нет
- ✅ TypeScript: компиляция успешна
- ✅ Документация обновлена

## Связанные файлы

- `packages/core/src/services/payments/paymentService.ts` — логика обработки webhook
- `apps/web/src/app/api/v1/payments/webhook/route.ts` — эндпоинт webhook
- `apps/web/src/app/api/v1/payments/create/route.ts` — создание платежа
- `apps/web/src/features/training/components/TrainingPageClient/TrainingPageClient.tsx` — UI страницы курса
