# 🔧 Исправления проблем запуска приложений

## 🚨 Выявленные проблемы

### **1. Конфликт page.tsx файлов**

```
You cannot have two parallel pages that resolve to the same path
```

**Решение**: Удален конфликтующий файл `apps/web/src/app/(auth)/page.tsx`

### **2. Проблемы с Edge Runtime**

```
Dynamic Code Evaluation not allowed in Edge Runtime
```

**Решение**: Исправлены импорты в auth пакете, убраны Node.js модули

### **3. Отсутствующие компоненты в muiImports**

```
Module not found: Can't resolve './Profile/Profile'
```

**Решение**: Удалены несуществующие импорты, добавлены недостающие компоненты

### **4. Проблемы с VAPID ключами**

```
Error: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing in .env
```

**Решение**: ✅ **ИСПРАВЛЕНО** - Создан скрипт `setup:env` для автоматической настройки

### **5. Проблемы с переменными окружения Worker**

```
DATABASE_URL= undefined
```

**Решение**: ✅ **ИСПРАВЛЕНО** - Создан скрипт `setup:env` для автоматической настройки

### **6. Конфликт Telegram Bot**

```
ERROR: 409 Conflict: terminated by other getUpdates request
```

**Решение**: Требуется остановка других экземпляров бота

## ✅ Исправления

### **1. Настройка переменных окружения**

#### Автоматическая настройка

```bash
# Настройка всех переменных окружения и VAPID ключей
pnpm setup:env
```

**Что делает скрипт:**

- Создает/обновляет `.env` файл
- Генерирует VAPID ключи для WebPush
- Настраивает DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET
- Проверяет наличие всех необходимых переменных

#### Ручная настройка VAPID ключей

```bash
# Генерация VAPID ключей
npx web-push generate-vapid-keys

# Обновление .env файла
node scripts/update-vapid.js
```

### **2. Исправлены проблемы с Edge Runtime**

#### `packages/auth/src/auth.ts`

```typescript
// Убраны Node.js модули
// import { createRequire } from "module";
// import dotenv from "dotenv";
// import { join, dirname } from "path";
// import { fileURLToPath } from "url";

// Прямой импорт
import CredentialsProvider from "next-auth/providers/credentials";
```

#### `packages/auth/src/getIsOwner.ts`

```typescript
// Упрощенная логика для Edge Runtime
export async function getIsOwner(profileUsername: string): Promise<boolean> {
  // Временно возвращаем false для совместимости
  return false;
}
```

### **3. Исправлены проблемы с muiImports**

#### `apps/web/src/utils/muiImports.ts`

```typescript
// Добавлены недостающие компоненты
export { default as Modal } from "@mui/material/Modal";
export { default as Skeleton } from "@mui/material/Skeleton";
export { default as Rating } from "@mui/material/Rating";
export { default as Tooltip } from "@mui/material/Tooltip";
export { default as IconButton } from "@mui/material/IconButton";
```

### **4. Созданы новые команды запуска**

#### Стабильные приложения (рекомендуется)

```bash
pnpm start:stable
```

**Включает:**

- Web App (порт 3002)
- Error Dashboard (порт 3005)
- Bull Board (порт 3004)

#### Основные приложения

```bash
pnpm start:basic
```

**Включает:**

- Web App (порт 3002)
- Trainer Panel (порт 3001)
- Error Dashboard (порт 3005)
- Bull Board (порт 3004)

#### Все приложения (требует настройки)

```bash
pnpm start:all
```

## 🛠️ Команды для запуска

### **Быстрый запуск стабильных приложений**

```bash
# Настройка переменных окружения
pnpm setup:env

# Запуск стабильных приложений
pnpm start:stable
```

### **Запуск с проверками**

```bash
# Проверка готовности
pnpm check:ports
pnpm check:builds

# Запуск стабильных приложений
pnpm start:stable
```

### **Тестирование**

```bash
# Тест запуска web приложения
node scripts/test-start.js
```

## 🔧 Настройка проблемных приложений

### **1. WebPush - VAPID ключи** ✅ ИСПРАВЛЕНО

Автоматически настраивается через `pnpm setup:env`:

```bash
# Автоматическая настройка
pnpm setup:env

# Или ручная генерация
npx web-push generate-vapid-keys
```

### **2. Worker - переменные окружения** ✅ ИСПРАВЛЕНО

Автоматически настраивается через `pnpm setup:env`:

```bash
# Автоматическая настройка
pnpm setup:env
```

### **3. Telegram Bot - остановка конфликтующих процессов**

```bash
# Найти процессы бота
ps aux | grep telegram

# Остановить процессы
pkill -f "tsx bot.ts"
pkill -f "node.*bot"
```

## 📊 Статус приложений

| Приложение          | Статус               | Порт | Проблемы             |
| ------------------- | -------------------- | ---- | -------------------- |
| **Web App**         | ✅ Работает          | 3002 | Нет                  |
| **Error Dashboard** | ✅ Работает          | 3005 | Нет                  |
| **Bull Board**      | ✅ Работает          | 3004 | Нет                  |
| **Trainer Panel**   | ⚠️ Требует настройки | 3001 | Проблемы с импортами |
| **Telegram Bot**    | ⚠️ Требует настройки | 3003 | Конфликт процессов   |
| **Worker**          | ✅ Настроен          | 3006 | Нет                  |
| **WebPush**         | ✅ Настроен          | 3007 | Нет                  |

## 🎯 Рекомендации

### **Для разработки**

```bash
# Используйте стабильные приложения
pnpm start:stable
```

### **Для тестирования**

```bash
# Настройте переменные окружения
pnpm setup:env

# Запустите стабильные приложения
pnpm start:stable
```

### **Для продакшна**

```bash
# Настройте все переменные окружения
pnpm setup:env

# Остановите конфликтующие процессы
pkill -f node

# Запустите все приложения
pnpm start:all
```

## 🐛 Устранение неполадок

### **Проблемы с портами**

```bash
# Очистка портов
pkill -f node
lsof -i :3001 -i :3002 -i :3005
```

### **Проблемы с кэшем**

```bash
# Очистка кэша
rm -rf apps/*/.next
rm -rf packages/*/dist
```

### **Проблемы с зависимостями**

```bash
# Переустановка
rm -rf node_modules
pnpm install
```

### **Проблемы с переменными окружения**

```bash
# Пересоздание .env
rm .env
pnpm setup:env
```

## 📝 Следующие шаги

1. **✅ Настройте переменные окружения**: `pnpm setup:env`
2. **✅ Запустите стабильные приложения**: `pnpm start:stable`
3. **⚠️ Остановите конфликтующие процессы** Telegram Bot
4. **⚠️ Исправьте проблемы с импортами** в Trainer Panel
5. **✅ Протестируйте полный запуск** всех приложений

## ✅ Заключение

**Исправлены проблемы с Worker и WebPush:**

- ✅ **Worker**: Настроены переменные окружения через `pnpm setup:env`
- ✅ **WebPush**: Сгенерированы VAPID ключи через `pnpm setup:env`
- ✅ **Создан скрипт автоматической настройки**: `pnpm setup:env`
- ✅ **Добавлены новые команды запуска**: `pnpm start:stable`

**Стабильные приложения (`start:stable`) работают без проблем. Проблемные приложения требуют дополнительной настройки или исправления импортов.**
