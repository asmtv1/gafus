# 🧪 Инструкция по тестированию системы Re-engagement

## Обзор

После изменения логики системы re-engagement (напоминания отправляются ВСЕМ неактивным пользователям), нужно протестировать работу системы.

---

## 📋 Что тестируем

✅ **Анализатор неактивных пользователей** - правильно ли находит пользователей без активности 5+ дней  
✅ **Создание кампаний** - создаются ли кампании для всех неактивных (без проверки настроек)  
✅ **Отправка уведомлений** - работает ли отправка push-уведомлений  
✅ **Персонализация** - используется ли имя питомца и достижения  
✅ **Закрытие кампаний** - закрываются ли кампании при возврате пользователя  
✅ **Метрики** - корректно ли собирается статистика

---

## 🎯 Способ 1: Тестирование через админ-панель (РЕКОМЕНДУЕТСЯ)

### Шаг 1: Подготовка тестовых данных

Создайте тестового пользователя с неактивностью:

```sql
-- В PostgreSQL (psql или pgAdmin)

-- 1. Найти пользователя для теста
SELECT id, username, email FROM "User" WHERE role = 'USER' LIMIT 5;

-- 2. Создать завершенные шаги у этого пользователя
-- (минимум 2 шага, чтобы пройти фильтр MIN_COMPLETED_STEPS)

-- 3. Установить дату последней активности на 6 дней назад
UPDATE "UserStep"
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = 'USER_ID_HERE'
)
AND status = 'COMPLETED';
```

### Шаг 2: Запуск планировщика

1. Откройте админ-панель: `http://localhost:3001/main-panel/reengagement`
2. Войдите как ADMIN
3. Нажмите кнопку **"Запустить планировщик"**
4. Дождитесь результата (5-10 секунд)

**Ожидаемый результат:**

```
✅ Планировщик выполнен успешно!
🆕 Новых кампаний: 1
📨 Уведомлений запланировано: 1
✔️ Кампаний закрыто: 0
```

### Шаг 3: Проверка метрик

На странице мониторинга проверьте:

- **Всего кампаний** - должно увеличиться на 1
- **Активных кампаний** - должно увеличиться на 1
- **Последние кампании** - новая кампания должна появиться в таблице

### Шаг 4: Проверка в БД

```sql
-- Проверить созданную кампанию
SELECT * FROM "ReengagementCampaign"
WHERE "userId" = 'USER_ID_HERE'
ORDER BY "createdAt" DESC
LIMIT 1;

-- Проверить уведомление
SELECT * FROM "ReengagementNotification"
WHERE "campaignId" IN (
  SELECT id FROM "ReengagementCampaign"
  WHERE "userId" = 'USER_ID_HERE'
)
ORDER BY "createdAt" DESC;
```

**Ожидаемые данные:**

- `isActive` = `true`
- `currentLevel` = `1`
- `nextNotificationDate` = дата через 5 дней от последней активности
- `totalNotificationsSent` = `0` (задача в очереди, но еще не отправлена)

### Шаг 5: Проверка очереди BullMQ

1. Откройте Bull Board: `http://localhost:3003`
2. Перейдите в очередь `reengagement`
3. Проверьте наличие задачи `send-reengagement-notification`

**Ожидаемые данные задачи:**

```json
{
  "campaignId": "...",
  "userId": "...",
  "level": 1
}
```

---

## 🔬 Способ 2: Тестирование через скрипты Node.js

### Создайте тестовый скрипт

**Файл:** `scripts/test-reengagement.js`

```javascript
const { PrismaClient } = require("@prisma/client");
const { findInactiveUsers } = require("@gafus/reengagement");

const prisma = new PrismaClient();

async function testReengagement() {
  try {
    console.log("🔍 Поиск неактивных пользователей...\n");

    const inactiveUsers = await findInactiveUsers();

    console.log(`📊 Найдено неактивных пользователей: ${inactiveUsers.length}\n`);

    inactiveUsers.forEach((user, index) => {
      console.log(`${index + 1}. User ID: ${user.userId}`);
      console.log(`   Дней неактивности: ${user.daysSinceActivity}`);
      console.log(`   Всего завершений: ${user.totalCompletions}`);
      console.log(`   Активная кампания: ${user.hasActiveCampaign ? "Да" : "Нет"}`);
      console.log("");
    });

    console.log("✅ Тест завершен");
  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testReengagement();
```

### Запуск:

```bash
cd /Users/asmtv1/Desktop/gafus\ \(zod\)
node scripts/test-reengagement.js
```

---

## 🧪 Способ 3: Полное E2E тестирование

### Сценарий: Пользователь ушел и вернулся

**1. Создание неактивного пользователя**

```sql
-- Установить последнюю активность на 6 дней назад
UPDATE "UserStep"
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = 'TEST_USER_ID'
);
```

**2. Запуск планировщика** (через админ-панель)

- Должна создаться кампания уровня 1
- Задача должна добавиться в очередь

**3. Имитация возврата пользователя**

```sql
-- Завершить новый шаг
INSERT INTO "UserStep" ("id", "userTrainingId", "dayNumber", "stepIndex", "status", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'USER_TRAINING_ID',
  1,
  1,
  'COMPLETED',
  NOW(),
  NOW()
);
```

**4. Повторный запуск планировщика**

- Кампания должна закрыться (`isActive` = `false`, `returned` = `true`)

---

## 📊 Способ 4: Проверка персонализации

### Проверка использования имени питомца

```sql
-- Найти пользователя с питомцем
SELECT u.id, u.username, p.dogName
FROM "User" u
LEFT JOIN "Profile" p ON u.id = p."userId"
WHERE p."dogName" IS NOT NULL
LIMIT 5;

-- Сделать пользователя неактивным
UPDATE "UserStep"
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = 'USER_WITH_DOG_ID'
);
```

После запуска планировщика проверить в уведомлении:

```sql
SELECT title, body FROM "ReengagementNotification"
WHERE "campaignId" IN (
  SELECT id FROM "ReengagementCampaign"
  WHERE "userId" = 'USER_WITH_DOG_ID'
);
```

**Ожидаемый результат:** Имя питомца должно быть в тексте уведомления.

---

## 🔍 Проверочный чек-лист

### Основные проверки

- [ ] Планировщик находит пользователей с неактивностью 5+ дней
- [ ] НЕ проверяется настройка `reengagementSettings.enabled` (отправляем всем)
- [ ] Создаются кампании только для пользователей с минимум 2 завершенными шагами
- [ ] Для пользователей с активной кампанией новая НЕ создается
- [ ] Задачи добавляются в очередь BullMQ
- [ ] Кампании закрываются при возврате пользователя

### Проверка уровней

- [ ] Уровень 1: через 5 дней неактивности
- [ ] Уровень 2: через 12 дней неактивности
- [ ] Уровень 3: через 20 дней неактивности
- [ ] Уровень 4: через 30 дней неактивности

### Проверка персонализации

- [ ] Используется имя питомца (если есть)
- [ ] Используются данные о завершенных курсах
- [ ] Не повторяются варианты сообщений для одного пользователя

### Проверка метрик

- [ ] Click rate рассчитывается корректно
- [ ] Return rate рассчитывается корректно
- [ ] Метрики по уровням корректны
- [ ] Метрики по типам сообщений корректны

---

## 🐛 Типичные проблемы

### Проблема: Планировщик не находит пользователей

**Причины:**

- Нет пользователей с неактивностью 5+ дней
- Все пользователи уже имеют активные кампании
- Пользователи не прошли фильтр MIN_COMPLETED_STEPS (< 2 завершений)

**Решение:**

```sql
-- Проверить количество завершенных шагов
SELECT ut."userId", COUNT(*) as completed_steps
FROM "UserStep" us
JOIN "UserTraining" ut ON us."userTrainingId" = ut.id
WHERE us.status = 'COMPLETED'
GROUP BY ut."userId"
HAVING COUNT(*) >= 2;
```

### Проблема: Уведомления не отправляются

**Причины:**

- Очередь BullMQ не запущена
- Worker не обрабатывает задачи
- У пользователя нет push-подписки

**Решение:**

```bash
# Проверить работу worker
cd packages/worker
pnpm start

# Проверить подписки пользователя
SELECT * FROM "PushSubscription" WHERE "userId" = 'USER_ID';
```

### Проблема: Кампании не закрываются при возврате

**Причины:**

- Функция `checkAndCloseReturnedCampaigns()` не вызывается
- Дата в `updatedAt` не после `campaignStartDate`

**Решение:**
Убедиться, что планировщик запускается регулярно (в боевом окружении - через cron).

---

## 📈 Мониторинг в продакшене

### Настройка cron для автоматического запуска

```bash
# Запускать планировщик ежедневно в 8:00 MSK
0 8 * * * cd /path/to/project && node -e "require('@gafus/reengagement').scheduleReengagementCampaigns()"
```

### Алерты для мониторинга

Настроить уведомления если:

- Click rate < 5% (плохая вовлеченность)
- Return rate < 10% (система неэффективна)
- Нет новых кампаний > 7 дней (проблемы с планировщиком)

---

## ✅ Успешное тестирование

Система работает корректно если:

1. ✅ Планировщик находит неактивных пользователей
2. ✅ Создаются кампании для ВСЕХ неактивных (независимо от настроек)
3. ✅ Уведомления добавляются в очередь
4. ✅ Персонализация работает (имя питомца, достижения)
5. ✅ Кампании закрываются при возврате пользователя
6. ✅ Метрики собираются корректно
7. ✅ Админ-панель показывает актуальные данные

---

## 🆘 Помощь

Если что-то не работает:

1. Проверьте логи worker: `packages/worker/logs/`
2. Проверьте Bull Board: `http://localhost:3003`
3. Проверьте БД на наличие данных
4. Проверьте настройки окружения (`.env`)

**Логи находятся в:**

- Worker: консоль worker процесса
- Admin-panel: консоль браузера (F12)
- БД: серверные логи → docker logs
