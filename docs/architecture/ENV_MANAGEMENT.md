# Управление переменными окружения

## Решение проблемы с .env файлами

Используем комбинацию готовых решений для надежной загрузки переменных окружения:

1. **env-cmd** - для запуска команд с переменными из .env
2. **dotenv** в next.config.ts - для загрузки переменных в Next.js приложениях
3. Единый `.env` файл в корне проекта

## Как это работает

### 1. Единый .env файл

Все переменные окружения хранятся в корневом `.env` файле:

```bash
# .env (в корне проекта)
PROMETHEUS_URL=http://localhost:9090
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# ЮKassa (платные курсы, только для apps/web)
# В production подставляются из GitHub Secrets (ci-cd, deploy-only, build-single-container)
YOOKASSA_SHOP_ID=   # идентификатор магазина из ЛК ЮKassa
YOOKASSA_SECRET_KEY= # секретный ключ (не публиковать)

# Страница контактов — статический public/contacts.html (NEXT_PUBLIC_CONTACT_* не используются)

# ... остальные переменные
```

### 2. Автоматическая загрузка в Next.js

Все Next.js приложения автоматически загружают переменные из корневого `.env` через `next.config.ts`:

```typescript
// apps/*/next.config.ts
if (typeof require !== "undefined") {
  const dotenv = require("dotenv");
  const rootDir = path.resolve(__dirname, "../..");
  dotenv.config({ path: path.join(rootDir, ".env") });
  dotenv.config({ path: path.join(rootDir, ".env.local") });
}
```

### 3. env-cmd для запуска команд

Команды запускаются с автоматической загрузкой переменных:

```json
{
  "scripts": {
    "start:all": "env-cmd -f .env node scripts/start-all.js"
  }
}
```

## Преимущества

1. ✅ **Единый источник правды** - один .env файл в корне
2. ✅ **Автоматическая загрузка** - не нужно вручную подключать
3. ✅ **Работает везде** - в dev, production, через скрипты
4. ✅ **Готовое решение** - используем проверенные библиотеки
5. ✅ **Нет путаницы** - переменные всегда доступны

## Использование

### Добавление новой переменной

1. Добавьте в корневой `.env`:

```bash
MY_NEW_VAR=value
```

2. Используйте в коде:

```typescript
const value = process.env.MY_NEW_VAR;
```

3. Перезапустите приложение - переменная будет доступна автоматически

### Локальные переопределения

Для локальных переопределений создайте `.env.local` в корне:

```bash
# .env.local (не в git)
PROMETHEUS_URL=http://localhost:9090
```

`.env.local` имеет приоритет над `.env`.

## Приложения с автоматической загрузкой

- ✅ `apps/web/next.config.ts`
- ✅ `apps/trainer-panel/next.config.ts`
- ✅ `apps/admin-panel/next.config.ts`
- ✅ `apps/error-dashboard/next.config.ts`

Все эти приложения автоматически загружают переменные из корневого `.env`.

## Проверка переменных

```bash
# Проверить, что переменная загружена
node -e "require('dotenv').config(); console.log(process.env.PROMETHEUS_URL)"
```

## Примечания

- `.env.local` не должен быть в git (добавлен в .gitignore)
- `.env` может быть в git, но без секретов (только примеры)
- В production переменные устанавливаются через Docker environment или CI/CD
