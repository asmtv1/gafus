# 🔔 @gafus/reminders - Универсальная система напоминаний

## Обзор

Система напоминаний для различных событий: тренировки, прививки, кормление и другие регулярные действия.

## Архитектура

### База данных

**Модель:** `Reminder`

```prisma
model Reminder {
  id           String    @id @default(cuid())
  userId       String
  type         String    // "training", "vaccination", "feeding"
  name         String    // "Утро", "День", "Вечер"
  enabled      Boolean   @default(false)
  reminderTime String    @default("09:00") // HH:MM
  reminderDays String?   // "1,2,3,4,5,6,7" или null
  timezone     String    @default("Europe/Moscow")
  metadata     Json?     // Дополнительные данные
  lastSentAt   DateTime?

  @@index([userId, type])
  @@index([enabled, type, reminderTime])
}
```

**Особенности:**

- Один пользователь может иметь несколько напоминаний одного типа (до 5 для "training")
- Каждое напоминание именуется пользователем
- Timezone определяется автоматически из браузера
- `lastSentAt` предотвращает дубли (не более 1 раз в день)

## Типы напоминаний

### Training (реализовано)

**Тип:** `"training"`  
**Назначение:** Напоминания о регулярных тренировках с питомцем  
**Текст:** "Напоминание о тренировке 🐕 - Пора заниматься с питомцем!"  
**Лимит:** 5 напоминаний на пользователя

### Vaccination (планируется)

**Тип:** `"vaccination"`  
**Назначение:** Напоминания о прививках  
**Metadata:** `{ petId, vaccineName, dueDate }`  
**Лимит:** 10 напоминаний (по количеству питомцев × прививки)

### Feeding (планируется)

**Тип:** `"feeding"`  
**Назначение:** Напоминания о кормлении  
**Metadata:** `{ petId, mealType: "breakfast" | "lunch" | "dinner" }`  
**Лимит:** 15 напоминаний (3 приёма × 5 питомцев)

## Server Actions

### getTrainingReminders()

Получить все напоминания о тренировках пользователя.

```typescript
const result = await getTrainingReminders();

if (result.success && result.data) {
  console.log(result.data); // TrainingReminderData[]
}
```

**Возвращает:**

```typescript
{
  success: boolean;
  data?: TrainingReminderData[];
  error?: string;
}

interface TrainingReminderData {
  id: string;
  name: string;
  enabled: boolean;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
}
```

### createTrainingReminder()

Создать новое напоминание.

```typescript
const result = await createTrainingReminder(
  "Утро", // name
  "08:00", // reminderTime
  "1,2,3,4,5", // reminderDays (Пн-Пт)
  "Europe/Moscow", // timezone
);
```

**Проверки:**

- ✅ Лимит: максимум 5 напоминаний типа "training"
- ✅ Новое напоминание создаётся включенным (`enabled: true`)

### updateTrainingReminder()

Обновить существующее напоминание.

```typescript
const result = await updateTrainingReminder(reminderId, {
  name: "Утренняя тренировка",
  enabled: true,
  reminderTime: "09:30",
  reminderDays: "1,2,3,4,5,6,7",
  timezone: "Asia/Vladivostok",
});
```

**Проверки:**

- ✅ Валидация владельца (userId должен совпадать)
- ✅ Все поля опциональны

### deleteTrainingReminder()

Удалить напоминание.

```typescript
const result = await deleteTrainingReminder(reminderId);
```

**Проверки:**

- ✅ Валидация владельца

## Worker для отправки

**Файл:** `packages/worker/src/training-reminders-sender.ts`

### Как работает

1. **Запуск:** Каждую минуту через cron (UTC в контейнере; сравнение времени — в timezone пользователя)
2. **Выборка:** Все включенные напоминания типа "training"
3. **Фильтрация:**
   - Проверка дня недели
   - Проверка времени (допуск ±5 мин, см. `training-reminder-schedule.ts`)
   - Проверка что не отправляли сегодня
4. **Отправка:** Push-уведомление через `PushNotificationService`
5. **Обновление:** `lastSentAt` = текущая дата

### Функции проверки

```typescript
// Совпадает ли день недели?
matchesDayOfWeek(reminderDays: string | null, currentDayOfWeek: number): boolean

// Совпадает ли время? (допуск из TRAINING_REMINDER_TIME_TOLERANCE_MINUTES)
matchesTime(reminderTime: string, hour: number, minute: number): boolean

// Уже отправляли сегодня?
wasAlreadySentToday(lastSentAt: Date | null, currentTime: Date): boolean
```

### Timezone

Worker использует timezone из настроек каждого напоминания:

```typescript
// Получаем текущее время в timezone пользователя
const currentTime = new Date(new Date().toLocaleString("en-US", { timeZone: reminder.timezone }));
```

Это гарантирует что:

- Пользователь из Москвы с временем 14:00 получит в 14:00 по Москве
- Пользователь из Владивостока с временем 14:00 получит в 14:00 по Владивостоку

## UI компонент

**Файл:** `apps/web/src/features/profile/components/TrainingReminders.tsx`

### Структура

```
TrainingReminders (главный компонент)
├── Список напоминаний
│   ├── ReminderItem (карточка напоминания)
│   │   ├── Переключатель вкл/выкл
│   │   ├── Редактируемое название
│   │   ├── Превью времени
│   │   ├── Кнопка развернуть/свернуть
│   │   ├── Кнопка удалить
│   │   └── Детали (при развёрнутом):
│   │       ├── Input type="time"
│   │       └── Чекбоксы дней недели
│   └── ...
├── Кнопка "+ Добавить напоминание (N/5)"
└── Информационный блок
```

### Состояния

- **Компактный вид:** Переключатель, название, время, кнопки
- **Развёрнутый вид:** + настройки времени и дней
- **Сохранение:** Автоматическое при любом изменении
- **Обратная связь:** Уведомления успеха/ошибки

## Примеры использования

### Пример 1: Рабочий график

```
Пользователь работает Пн-Пт, тренирует собаку утром и вечером:

1. "Утро перед работой" - 07:30, Пн-Пт
2. "Вечер после работы" - 19:00, Пн-Пт
3. "Выходные утром" - 10:00, Сб-Вс
```

### Пример 2: Интенсивный режим

```
Подготовка к соревнованиям - тренировки 3 раза в день:

1. "Утренняя тренировка" - 08:00, Все дни
2. "Дневная тренировка" - 14:00, Все дни
3. "Вечерняя тренировка" - 20:00, Все дни
```

### Пример 3: Напоминания для разных питомцев

```
У пользователя 2 собаки с разным графиком:

1. "Рекс - утро" - 08:00, Все дни
2. "Рекс - вечер" - 20:00, Все дни
3. "Шарик - день" - 14:00, Все дни
```

## Лучшие практики

### Для UI

✅ **Хорошо:**

- Давать понятные названия: "Утро", "После работы"
- Использовать чёткие временные интервалы (08:00, 14:00, 20:00)
- Настраивать дни в соответствии с режимом

❌ **Плохо:**

- Создавать все 5 напоминаний на одно время
- Называть "Напоминание 1", "Напоминание 2"
- Устанавливать слишком частые интервалы

### Для Worker

- Worker проверяет ±5 минут от указанного времени
- Каждое напоминание отправляется не чаще 1 раза в день
- Учитывается timezone пользователя
- Если пользователь из другой страны - время пересчитывается корректно

## Расширение

### Добавление нового типа напоминаний

1. Создать новые server actions (например, `vaccinationReminders.ts`)
2. Создать UI компонент (например, `VaccinationReminders.tsx`)
3. Создать sender в worker (например, `vaccination-reminders-sender.ts`)
4. Добавить в cron-scheduler
5. Использовать поле `metadata` для специфичных данных

```typescript
// Пример для прививок
await createReminder(
  userId,
  "vaccination",
  "Прививка от бешенства",
  "10:00",
  null, // все дни
  timezone,
  { petId: "pet-123", vaccineName: "Rabies", dueDate: "2025-11-15" },
);
```

## См. также

- [Worker Package](./worker.md) - Background jobs
- [WebPush Package](./webpush.md) - Push-уведомления
- [Queues Package](./queues.md) - BullMQ очереди
