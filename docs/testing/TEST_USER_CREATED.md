# ✅ Тестовый пользователь создан!

## 👤 Данные для входа

**Username:** `asmtv1`  
**Password:** `2407041`  
**Телефон:** `89198031379` (подтвержден)  
**Роль:** `USER`

---

## 🧪 Как протестировать систему Re-engagement

### Вариант 1: Через существующие данные (если есть активность)

Если у пользователя уже есть завершенные шаги в каких-то курсах, выполните SQL:

```sql
-- Сделать последнюю активность 6 дней назад
UPDATE "UserStep"
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = (
    SELECT id FROM "User" WHERE username = 'asmtv1'
  )
)
AND status = 'COMPLETED';
```

### Вариант 2: Создать тестовые данные вручную

1. **Войдите как asmtv1** на http://localhost:3000/login
2. **Пройдите несколько шагов** в любом курсе (минимум 2)
3. **Выполните SQL** чтобы установить дату 6 дней назад:

```sql
UPDATE "UserStep"
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = (
    SELECT id FROM "User" WHERE username = 'asmtv1'
  )
);
```

### Вариант 3: Создать данные через SQL напрямую

Если в БД уже есть курсы с днями и шагами:

```sql
-- 1. Найти ID пользователя
SELECT id FROM "User" WHERE username = 'asmtv1';

-- 2. Найти первый курс и день
SELECT c.id as course_id, dc.id as day_id
FROM "Course" c
JOIN "DayOnCourse" dc ON dc."courseId" = c.id
LIMIT 1;

-- 3. Создать UserCourse (замените USER_ID и COURSE_ID)
INSERT INTO "UserCourse" ("userId", "courseId", "status", "startedAt", "createdAt", "updatedAt")
VALUES ('USER_ID', 'COURSE_ID', 'IN_PROGRESS', NOW(), NOW(), NOW())
ON CONFLICT ("userId", "courseId") DO NOTHING;

-- 4. Создать UserTraining (замените USER_ID и DAY_ID)
INSERT INTO "UserTraining" ("id", "userId", "dayOnCourseId", "status", "currentStepIndex", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'USER_ID', 'DAY_ID', 'IN_PROGRESS', 0, NOW(), NOW())
RETURNING id;

-- 5. Создать завершенные шаги (замените USER_TRAINING_ID и STEP_IDS)
-- Сначала найдите StepOnDay ID для дня
SELECT id FROM "StepOnDay" WHERE "trainingDayId" = 'DAY_ID' LIMIT 3;

-- Затем создайте UserStep для каждого (минимум 2)
INSERT INTO "UserStep" ("id", "userTrainingId", "stepOnDayId", "status", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'USER_TRAINING_ID', 'STEP_ID_1', 'COMPLETED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'USER_TRAINING_ID', 'STEP_ID_2', 'COMPLETED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), 'USER_TRAINING_ID', 'STEP_ID_3', 'COMPLETED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days');
```

---

## 🚀 Запуск теста

После подготовки данных:

1. Откройте админ-панель: http://localhost:3001/main-panel/reengagement
2. Войдите как ADMIN
3. Нажмите **"Запустить планировщик"**

**Ожидаемый результат:**

```
✅ Планировщик выполнен успешно!
🆕 Новых кампаний: 1
📨 Уведомлений запланировано: 1
✔️ Кампаний закрыто: 0
```

---

## 📝 Проверка в БД

```sql
-- Проверить кампанию
SELECT * FROM "ReengagementCampaign"
WHERE "userId" = (SELECT id FROM "User" WHERE username = 'asmtv1')
ORDER BY "createdAt" DESC LIMIT 1;

-- Проверить уведомление
SELECT * FROM "ReengagementNotification"
WHERE "campaignId" IN (
  SELECT id FROM "ReengagementCampaign"
  WHERE "userId" = (SELECT id FROM "User" WHERE username = 'asmtv1')
)
ORDER BY "createdAt" DESC;
```

---

## 📚 Дополнительная документация

- Полная инструкция: `docs/testing/REENGAGEMENT_TESTING.md`
- Изменения в коде: `docs/CHANGELOG_UX_IMPROVEMENTS.md`

Готово к тестированию! 🚀
