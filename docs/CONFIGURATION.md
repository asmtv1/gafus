# Конфигурация и скрипты

## 🔧 Обзор

Проект Gafus содержит множество скриптов и конфигурационных файлов для автоматизации разработки, сборки, тестирования и развертывания. Все скрипты организованы в директории `scripts/` и покрывают полный жизненный цикл разработки.

## 📁 Структура скриптов

### Категории скриптов

```
scripts/
├── development/              # Скрипты разработки
│   ├── dev-with-env.js      # Запуск с переменными окружения
│   ├── dev-web-with-env.js  # Запуск веб-приложения
│   ├── dev-trainer-with-env.js # Запуск панели тренера
│   └── start-worker-watch.js # Запуск воркера в watch режиме
├── build/                    # Скрипты сборки
│   ├── build-local.sh       # Локальная сборка
│   ├── check-builds.js      # Проверка сборок
│   └── test-docker-build.sh # Тестирование Docker сборки
├── testing/                  # Скрипты тестирования
│   ├── check-all.sh         # Проверка всех компонентов
│   ├── check-types.sh       # Проверка типов
│   ├── check-lint.sh        # Проверка линтинга
│   └── test-start.js        # Тестирование запуска
├── deployment/               # Скрипты развертывания
│   ├── setup-server.sh      # Настройка сервера
│   ├── restart-apps.sh      # Перезапуск приложений
│   ├── renew-ssl.sh         # Обновление SSL сертификатов
│   └── backup-to-yandex.sh  # Резервное копирование
├── maintenance/              # Скрипты обслуживания
│   ├── clean.sh             # Очистка проекта
│   ├── reset-db.sh          # Сброс базы данных
│   ├── optimize-imports.js  # Оптимизация импортов
│   └── remove-unused-deps.js # Удаление неиспользуемых зависимостей
└── configuration/            # Конфигурационные файлы
    ├── nginx-web.conf       # Nginx для веб-приложения
    ├── nginx-error-dashboard.conf # Nginx для панели ошибок
    └── create-env.js        # Создание .env файлов
```

## 🚀 Скрипты разработки

### `dev-with-env.js` - Запуск с переменными окружения
```bash
pnpm dev:env
```

**Функциональность:**
- Загружает переменные окружения из `.env` файлов
- Запускает все приложения в режиме разработки
- Настраивает порты и конфигурацию
- Включает hot reload и watch режим

**Использование:**
```bash
# Запуск всех сервисов
node scripts/dev-with-env.js

# Запуск конкретного приложения
node scripts/dev-web-with-env.js
node scripts/dev-trainer-with-env.js
```

### `start-worker-watch.js` - Запуск воркера
```bash
pnpm start:worker:watch
```

**Функциональность:**
- Запускает фоновые воркеры
- Обрабатывает очереди задач
- Автоматический перезапуск при изменениях
- Логирование и мониторинг

## 🔨 Скрипты сборки

### `build-local.sh` - Локальная сборка
```bash
./scripts/build-local.sh
```

**Функциональность:**
- Сборка всех пакетов
- Сборка всех приложений
- Проверка зависимостей
- Генерация типов

**Этапы сборки:**
1. Очистка предыдущих сборок
2. Установка зависимостей
3. Генерация Prisma клиента
4. Сборка пакетов
5. Сборка приложений
6. Проверка результатов

### `check-builds.js` - Проверка сборок
```bash
node scripts/check-builds.js
```

**Функциональность:**
- Проверяет успешность сборки всех компонентов
- Валидирует выходные файлы
- Проверяет размеры бандлов
- Генерирует отчет о сборке

## 🧪 Скрипты тестирования

### `check-all.sh` - Комплексная проверка
```bash
./scripts/check-all.sh
```

**Функциональность:**
- Проверка типов TypeScript
- Линтинг кода
- Проверка сборок
- Тестирование приложений
- Проверка портов

**Использование:**
```bash
# Полная проверка
./scripts/check-all.sh

# Проверка конкретного компонента
./scripts/check-all.sh web
./scripts/check-all.sh trainer-panel
```

### `check-types.sh` - Проверка типов
```bash
./scripts/check-types.sh
```

**Функциональность:**
- Проверка типов во всех пакетах
- Проверка типов во всех приложениях
- Валидация общих типов
- Проверка совместимости

### `check-lint.sh` - Проверка линтинга
```bash
./scripts/check-lint.sh
```

**Функциональность:**
- ESLint проверка всех файлов
- Проверка форматирования Prettier
- Автоисправление простых ошибок
- Генерация отчета о качестве кода

## 🚀 Скрипты развертывания

### `setup-server.sh` - Настройка сервера
```bash
./scripts/setup-server.sh
```

**Функциональность:**
- Установка системных зависимостей
- Настройка Docker и Docker Compose
- Конфигурация Nginx
- Настройка SSL сертификатов
- Создание пользователей и групп

**Требования:**
- Ubuntu 20.04+ или CentOS 8+
- Root доступ
- Интернет соединение

### `restart-apps.sh` - Перезапуск приложений
```bash
./scripts/restart-apps.sh
```

**Функциональность:**
- Graceful остановка всех сервисов
- Очистка временных файлов
- Перезапуск Docker контейнеров
- Проверка состояния сервисов
- Логирование процесса

### `renew-ssl.sh` - Обновление SSL
```bash
./scripts/renew-ssl.sh
```

**Функциональность:**
- Автоматическое обновление Let's Encrypt сертификатов
- Проверка срока действия сертификатов
- Обновление Nginx конфигурации
- Перезапуск Nginx после обновления

## 🔧 Скрипты обслуживания

### `clean.sh` - Очистка проекта
```bash
./scripts/clean.sh
```

**Функциональность:**
- Удаление node_modules
- Очистка dist директорий
- Удаление временных файлов
- Очистка кэша
- Сброс Git состояния

### `reset-db.sh` - Сброс базы данных
```bash
./scripts/reset-db.sh
```

**Функциональность:**
- Удаление всех таблиц
- Применение миграций заново
- Запуск seed данных
- Создание тестовых пользователей
- Восстановление из бэкапа

**⚠️ Внимание:** Этот скрипт удаляет все данные!

### `optimize-imports.js` - Оптимизация импортов
```bash
node scripts/optimize-imports.js
```

**Функциональность:**
- Анализ неиспользуемых импортов
- Автоматическое удаление лишних импортов
- Оптимизация путей импортов
- Группировка импортов по типам

### `remove-unused-deps.js` - Удаление зависимостей
```bash
node scripts/remove-unused-deps.js
```

**Функциональность:**
- Анализ использования зависимостей
- Удаление неиспользуемых пакетов
- Обновление package.json
- Очистка pnpm-lock.yaml

## ⚙️ Конфигурационные файлы

### Nginx конфигурации

#### `nginx-web.conf` - Конфигурация для веб-приложения
```nginx
server {
    listen 80;
    server_name gafus.ru www.gafus.ru;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Статические файлы
    location /static/ {
        alias /var/www/gafus/web/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### `nginx-error-dashboard.conf` - Конфигурация для панели ошибок
```nginx
server {
    listen 80;
    server_name errors.gafus.ru;
    
    location / {
        proxy_pass http://localhost:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Базовая аутентификация
    auth_basic "Error Dashboard";
    auth_basic_user_file /etc/ci-cd/nginx/.htpasswd;
}
```

### Environment конфигурации

#### `create-env.js` - Создание .env файлов
```bash
node scripts/create-env.js
```

**Функциональность:**
- Создание .env файлов для всех приложений
- Генерация секретных ключей
- Настройка переменных окружения
- Валидация конфигурации

#### `env-loader.js` - Загрузчик переменных окружения
```javascript
// Использование в скриптах
const { loadEnv } = require('./env-loader');

const env = loadEnv({
  development: '.env.development',
  production: '.env.production',
  test: '.env.test'
});
```

## 🔐 Скрипты безопасности

### `generate-nextauth-secret.js` - Генерация NextAuth секрета
```bash
node scripts/generate-nextauth-secret.js
```

**Функциональность:**
- Генерация криптографически стойкого секрета
- Сохранение в .env файл
- Валидация секрета
- Ротация секретов

### `generate-vapid-keys.js` - Генерация VAPID ключей
```bash
node scripts/generate-vapid-keys.js
```

**Функциональность:**
- Генерация VAPID ключей для push уведомлений
- Сохранение в .env файл
- Валидация ключей
- Обновление конфигурации

### `setup-github-secrets.sh` - Настройка GitHub Secrets
```bash
./scripts/setup-github-secrets.sh
```

**Функциональность:**
- Настройка секретов для CI/CD
- Конфигурация переменных окружения
- Настройка доступа к репозиторию
- Валидация секретов

## 📊 Скрипты мониторинга

### `check-status.sh` - Проверка статуса сервисов
```bash
./scripts/check-status.sh
```

**Функциональность:**
- Проверка состояния всех сервисов
- Мониторинг портов
- Проверка здоровья приложений
- Генерация отчета о состоянии

### `check-ports.js` - Проверка портов
```bash
node scripts/check-ports.js
```

**Функциональность:**
- Проверка доступности портов
- Обнаружение конфликтов портов
- Рекомендации по настройке
- Автоматическое освобождение портов

## 🧪 Скрипты тестирования

### `test-start.js` - Тестирование запуска
```bash
node scripts/test-start.js
```

**Функциональность:**
- Тестирование запуска всех приложений
- Проверка доступности endpoints
- Валидация конфигурации
- Генерация отчета о тестах

### `test-caching.js` - Тестирование кэширования
```bash
node scripts/test-caching.js
```

**Функциональность:**
- Тестирование Redis кэширования
- Проверка производительности кэша
- Валидация стратегий кэширования
- Оптимизация настроек

### `test-docker-build.sh` - Тестирование Docker сборки
```bash
./scripts/test-docker-build.sh
```

**Функциональность:**
- Сборка Docker образов
- Тестирование контейнеров
- Проверка размеров образов
- Валидация конфигурации

## 🔄 Скрипты резервного копирования

### `backup-to-yandex.sh` - Резервное копирование в Yandex
```bash
./scripts/backup-to-yandex.sh
```

**Функциональность:**
- Создание резервных копий базы данных
- Загрузка в Yandex Object Storage
- Сжатие и шифрование данных
- Ротация старых бэкапов

**Конфигурация:**
```bash
# Переменные окружения
export YANDEX_ACCESS_KEY="your-access-key"
export YANDEX_SECRET_KEY="your-secret-key"
export YANDEX_BUCKET="gafus-backups"
```

## 📝 Скрипты документации

### `clean-duplicate-subscriptions.js` - Очистка дубликатов
```bash
node scripts/clean-duplicate-subscriptions.js
```

**Функциональность:**
- Поиск дублирующихся подписок
- Удаление дубликатов
- Валидация данных
- Генерация отчета

## 🚀 Использование скриптов

### Основные команды
```bash
# Разработка
pnpm dev:env                    # Запуск с переменными окружения
pnpm start:worker:watch         # Запуск воркера

# Сборка
pnpm build:ci                   # CI сборка
./scripts/build-local.sh        # Локальная сборка

# Тестирование
./scripts/check-all.sh          # Полная проверка
pnpm test:all                   # Все тесты

# Развертывание
./scripts/setup-server.sh       # Настройка сервера
./scripts/restart-apps.sh       # Перезапуск приложений

# Обслуживание
./scripts/clean.sh              # Очистка проекта
./scripts/reset-db.sh           # Сброс БД
```

### Переменные окружения для скриптов
```env
# Общие настройки
NODE_ENV=development
LOG_LEVEL=info
DEBUG=false

# База данных
DATABASE_URL="postgresql://user:password@localhost:5432/gafus"
REDIS_URL="redis://localhost:6379"

# Внешние сервисы
TELEGRAM_BOT_TOKEN="your-bot-token"
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"

# Развертывание
DEPLOY_HOST="your-server.com"
DEPLOY_USER="deploy"
DEPLOY_PATH="/var/www/gafus"
```

## 🔧 Кастомизация скриптов

### Создание собственных скриптов
```bash
# Создание нового скрипта
touch scripts/my-custom-script.js
chmod +x scripts/my-custom-script.js

# Добавление в package.json
{
  "scripts": {
    "my-script": "node scripts/my-custom-script.js"
  }
}
```

### Расширение существующих скриптов
```javascript
// scripts/custom-extension.js
const { loadEnv } = require('./env-loader');
const { checkStatus } = require('./check-status');

// Расширение функциональности
async function customCheck() {
  const env = loadEnv();
  const status = await checkStatus();
  
  // Дополнительная логика
  console.log('Custom check completed');
}

module.exports = { customCheck };
```
