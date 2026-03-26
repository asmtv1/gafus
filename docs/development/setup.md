# Руководство по настройке окружения

## 📋 Требования

### Системные требования

- **Node.js** 18.0.0 или выше
- **pnpm** 8.0.0 или выше
- **PostgreSQL** 14.0 или выше
- **Redis** 6.0 или выше
- **Docker** (опционально, для контейнеризации)

### Рекомендуемые инструменты

- **VS Code** с расширениями:
  - TypeScript
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - Prisma

## 🚀 Быстрая установка

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd gafus
```

### 2. Установка зависимостей

```bash
# Установка pnpm (если не установлен)
npm install -g pnpm

# Установка всех зависимостей
pnpm install
```

### 3. Настройка окружения

```bash
# Автоматическая настройка переменных окружения
pnpm setup:env
```

### 4. Запуск базы данных

```bash
# Запуск PostgreSQL и Redis через Docker
docker-compose up -d postgres redis
```

### 5. Инициализация базы данных

```bash
# Генерация Prisma клиента
pnpm db:generate

# Применение миграций
pnpm db:migrate

# Заполнение тестовыми данными
pnpm db:seed
```

### 6. Запуск в режиме разработки

```bash
# Запуск всех сервисов с переменными окружения (рекомендуется)
pnpm dev:env

# Или запуск через turbo (без переменных окружения)
pnpm dev

# Или запуск конкретного приложения
pnpm --filter @gafus/web dev
pnpm --filter @gafus/trainer-panel dev
```

**💡 Оптимизация производительности:**

- `dev:env` оптимизирован для быстрого запуска (без проверки сборок)
- ESLint и TypeScript проверки отключены в dev режиме для ускорения
- Используются все CPU и worker threads для компиляции
- При медленной работе проверьте, что не запущены лишние процессы

## 🔧 Детальная настройка

### Переменные окружения

#### Основные переменные

```env
# .env (хранится локально, не в git)
# Приложение
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# База данных
DATABASE_URL=postgresql://postgres:password@localhost:5432/gafus

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Telegram (опционально, legacy — приложение telegram-bot удалено из монорепо)
# TELEGRAM_BOT_TOKEN=

# AWS S3 (для загрузки файлов)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

#### Переменные для каждого приложения

**Web App (.env)**

```env
# Web App
PORT=3002
NEXT_PUBLIC_API_URL=http://localhost:3002/api
```

**Trainer Panel (.env)**

```env
# Trainer Panel
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001/api

# URL web-приложения для инвалидации кэша
NEXT_PUBLIC_WEB_APP_URL=http://localhost:3002
# Или используйте WEB_APP_URL (без NEXT_PUBLIC_)
WEB_APP_URL=http://localhost:3002

# Секретный токен для межсервисных вызовов (опционально)
REVALIDATE_SECRET_TOKEN=your-secret-token-here
```

**Bull Board (.env)**

```env
# Bull Board
BULL_BOARD_PORT=3003
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=secure-password
```

### Настройка базы данных

#### PostgreSQL

```bash
# Создание базы данных
createdb gafus

# Подключение к базе данных
psql gafus

# Создание пользователя (опционально)
CREATE USER gafus_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE gafus TO gafus_user;
```

#### Prisma миграции

```bash
# Создание новой миграции
npx prisma migrate dev --name migration_name

# Применение миграций в продакшене
npx prisma migrate deploy

# Сброс базы данных (только для разработки)
npx prisma migrate reset

# Просмотр базы данных
npx prisma studio
```

### Настройка Redis

```bash
# Запуск Redis локально
redis-server

# Проверка подключения
redis-cli ping
```

### Локальный nginx (домены \*.gafus.localhost)

Чтобы открывать приложения по адресам вида `http://web.gafus.localhost/` (вместо `http://localhost:3002`), нужен локальный nginx.

1. **Установка (Homebrew):**

   ```bash
   brew install nginx
   ```

2. **Подключение конфига проекта:**

   Создайте директорию `servers` и симлинк на конфиг из репозитория (путь для Apple Silicon; для Intel замените `opt/homebrew` на `usr/local`):

   ```bash
   sudo mkdir -p /opt/homebrew/etc/nginx/servers
   sudo ln -sf "$(pwd)/ci-cd/nginx/gafus-localhost.conf" /opt/homebrew/etc/nginx/servers/gafus-localhost.conf
   ```

   Если в основном `nginx.conf` нет строки `include servers/*;` внутри блока `http`, добавьте её или положите конфиг в уже подключаемую директорию (например `conf.d`).

3. **Директория для логов** (указана в конфиге):

   ```bash
   mkdir -p /Users/asmtv1/nginx-logs
   ```

4. **Проверка и запуск:**

   ```bash
   nginx -t
   sudo nginx
   # или через Homebrew:
   brew services start nginx
   ```

5. **Доступ:** после запуска nginx порт 80 будет отдавать приложения по доменам:
   - http://web.gafus.localhost → порт 3002  
   - http://trainer.gafus.localhost → 3001  
   - http://admin.gafus.localhost → 3006  
   - http://errors.gafus.localhost → 3005  
   - http://queues.gafus.localhost → 3004  
   - http://api.gafus.localhost → API

Домен `*.localhost` на macOS по умолчанию резолвится в `127.0.0.1`, отдельная запись в `/etc/hosts` не нужна.

## 🐳 Docker настройка

### Docker Compose для разработки

```yaml
# docker-compose.dev.yml
version: "3.8"

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: gafus
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Запуск через Docker

```bash
# Запуск инфраструктуры
docker-compose -f docker-compose.dev.yml up -d

# Остановка
docker-compose -f docker-compose.dev.yml down
```

## 🛠️ Настройка IDE

### VS Code настройки

```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.validate": ["javascript", "typescript", "typescriptreact"],
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

### VS Code расширения

```json
// .vscode/extensions.json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "Prisma.prisma",
    "ms-vscode.vscode-json"
  ]
}
```

## 🔍 Проверка установки

### Проверка зависимостей

```bash
# Проверка версий
node --version
pnpm --version
docker --version

# Проверка подключения к базе данных
npx prisma db push

# Проверка подключения к Redis
redis-cli ping
```

### Проверка приложений

```bash
# Проверка сборки всех пакетов
pnpm build:packages

# Проверка типов
pnpm typecheck:all

# Проверка линтера
pnpm lint:all

# Запуск тестов
pnpm test:all
```

## 🚨 Решение проблем

### Частые проблемы

#### Ошибка подключения к базе данных

```bash
# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Перезапуск PostgreSQL
sudo systemctl restart postgresql

# Проверка подключения
psql -h localhost -U postgres -d gafus
```

#### Ошибки с портами

```bash
# Проверка занятых портов
lsof -i :3000
lsof -i :3001
lsof -i :3002

# Остановка процессов на портах
kill -9 <PID>
```

#### Проблемы с зависимостями

```bash
# Очистка кэша
pnpm store prune

# Переустановка зависимостей
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

#### Большой размер проекта (10-15GB)

Проект может занимать много места из-за кэша:

- **`.turbo`** (9-10GB) - кэш Turborepo для ускорения сборок
- **`.next`** (2-3GB) - кэш Next.js для dev режима
- **`node_modules`** (1.5GB) - зависимости

**Решение:** Очистка кэша без удаления зависимостей:

```bash
# Очистка только кэша (безопасно, не удаляет node_modules и .next)
pnpm clean:cache

# Или полная очистка (удаляет всё, включая node_modules)
pnpm clean:all
```

**Рекомендация:** Запускайте `pnpm clean:cache` периодически (раз в неделю/месяц) для освобождения места. Кэш пересоздастся автоматически при следующей сборке.

#### Проблемы с Prisma

```bash
# Перегенерация клиента
npx prisma generate

# Сброс и повторное применение миграций
npx prisma migrate reset
```

#### Медленная работа dev:env (страницы грузятся 20-30 секунд)

**Причины:**

- Проверка сборки перед запуском (исправлено в последней версии)
- ESLint/TypeScript проверки в dev режиме (отключены)
- Ограничения CPU/worker threads (убраны)
- Standalone режим в dev (отключен)

**Решение:**

1. Убедитесь, что используете последнюю версию кода
2. Очистите кэш: `pnpm clean:cache`
3. Проверьте, что не запущены лишние процессы: `lsof -i :3001 -i :3002 -i :3005 -i :3006`
4. Перезапустите dev сервер: `pnpm dev:env`

**Оптимизации уже применены:**

- ✅ Убрана проверка сборки из `dev:env`
- ✅ ESLint проверки отключены в dev режиме
- ✅ TypeScript проверки отключены в dev режиме
- ✅ Worker threads включены для ускорения компиляции
- ✅ Standalone режим только для production

### Логи и отладка

#### Включение подробных логов

```env
# .env
DEBUG=*
LOG_LEVEL=debug
```

#### Просмотр логов приложений

```bash
# Логи веб-приложения
pnpm --filter @gafus/web dev 2>&1 | tee web.log

# Логи панели тренера
pnpm --filter @gafus/trainer-panel dev 2>&1 | tee trainer.log
```

## 📚 Дополнительные ресурсы

### Полезные команды

```bash
# Анализ размера bundle
pnpm analyze:web
pnpm analyze:trainer
```

### Скрипты разработки

```bash
# Очистка кэша (без удаления node_modules и .next)
pnpm clean:cache

# Полная очистка проекта
pnpm clean:all

# Проверка портов
pnpm check:ports

# Проверка сборок
pnpm check:builds
```

---

_Это руководство поможет вам быстро настроить окружение разработки для проекта GAFUS._
