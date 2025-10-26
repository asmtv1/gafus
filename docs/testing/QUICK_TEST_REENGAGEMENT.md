# ⚡ Быстрый тест системы Re-engagement

## 🎯 Цель
Проверить что система отправляет уведомления ВСЕМ неактивным пользователям (без проверки настроек).

---

## 📝 Быстрый тест за 5 минут

### 1️⃣ Подготовка данных (SQL)

```sql
-- Найдите любого пользователя
SELECT id, username FROM "User" WHERE role = 'USER' LIMIT 1;

-- Скопируйте его ID, используйте вместо USER_ID_HERE ниже

-- Сделайте его неактивным (6 дней назад)
UPDATE "UserStep" 
SET "updatedAt" = NOW() - INTERVAL '6 days'
WHERE "userTrainingId" IN (
  SELECT id FROM "UserTraining" WHERE "userId" = 'USER_ID_HERE'
)
AND status = 'COMPLETED';
```

### 2️⃣ Запуск планировщика

1. Откройте админ-панель: http://localhost:3001/main-panel/reengagement
2. Войдите как ADMIN
3. Нажмите **"Запустить планировщик"**

### 3️⃣ Проверка результата

**Ожидаемый ответ:**
```
✅ Планировщик выполнен успешно!
🆕 Новых кампаний: 1
📨 Уведомлений запланировано: 1
✔️ Кампаний закрыто: 0
```

### 4️⃣ Проверка в БД

```sql
-- Проверить кампанию
SELECT * FROM "ReengagementCampaign" 
WHERE "userId" = 'USER_ID_HERE' 
ORDER BY "createdAt" DESC LIMIT 1;

-- Проверить уведомление
SELECT * FROM "ReengagementNotification" 
WHERE "campaignId" = (
  SELECT id FROM "ReengagementCampaign" 
  WHERE "userId" = 'USER_ID_HERE' 
  ORDER BY "createdAt" DESC LIMIT 1
);
```

**Что должно быть:**
- Кампания создана (`isActive` = true, `currentLevel` = 1)
- Уведомление создано (`sent` = false, `level` = 1)

---

## ✅ Критерий успеха

Система работает правильно если:
- ✅ Кампания создалась для неактивного пользователя
- ✅ НЕ проверялась настройка `reengagementSettings.enabled`
- ✅ Уведомление добавлено в БД
- ✅ Задача есть в очереди BullMQ (http://localhost:3007)

---

## 🔧 Если не работает

### Проблема 1: "Новых кампаний: 0"

**Причина:** У пользователя < 2 завершенных шагов

**Решение:**
```sql
-- Проверить количество завершений
SELECT COUNT(*) FROM "UserStep" us
JOIN "UserTraining" ut ON us."userTrainingId" = ut.id
WHERE ut."userId" = 'USER_ID_HERE' AND us.status = 'COMPLETED';

-- Если меньше 2, создать еще один завершенный шаг
-- (см. полную инструкцию в REENGAGEMENT_TESTING.md)
```

### Проблема 2: "Ошибка запуска планировщика"

**Проверить:**
1. Worker запущен? (`pnpm run start` из корня проекта)
2. БД доступна? (`psql` подключение работает?)
3. Логи в консоли админ-панели (F12 → Console)

---

## 📚 Полная документация

Для детального тестирования см. `docs/testing/REENGAGEMENT_TESTING.md`

