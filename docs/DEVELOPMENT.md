# Руководство разработчика

## Настройка окружения

### Требования
- Node.js 18+
- pnpm 8+
- PostgreSQL 14+
- Redis 6+

### Установка
```bash
# Клонирование репозитория
git clone <repository-url>
cd gafus

# Установка зависимостей
pnpm install

# Настройка переменных окружения
cp .env.example .env
# Отредактируйте .env файл

# Генерация Prisma клиента
pnpm db:generate

# Запуск миграций
pnpm db:migrate
```

## Структура проекта

### Приложения (apps/)
- **web** - основное веб-приложение
- **trainer-panel** - панель тренера
- **telegram-bot** - телеграм-бот
- **error-dashboard** - панель мониторинга
- **bull-board** - управление очередями

### Пакеты (packages/)
- **auth** - аутентификация и авторизация
- **prisma** - схема БД и миграции
- **types** - общие TypeScript типы
- **ui-components** - переиспользуемые UI компоненты
- **webpush** - push-уведомления
- **worker** - фоновые задачи
- **queues** - управление очередями
- **react-query** - состояние и кэширование
- **csrf** - защита от CSRF
- **error-handling** - обработка ошибок

## Команды разработки

```bash
# Разработка
pnpm dev                    # Запуск всех сервисов в режиме разработки
pnpm dev:env               # Запуск с переменными окружения

# Сборка
pnpm build                 # Сборка всех пакетов
pnpm build:packages        # Сборка только пакетов

# Тестирование
pnpm test                  # Запуск тестов
pnpm typecheck            # Проверка типов

# Линтинг
pnpm lint                  # Проверка кода
pnpm lint:fix             # Автоисправление

# Форматирование
pnpm format               # Форматирование кода
```

## Архитектурные решения

### Монорепозиторий
Используется Turbo для управления монорепозиторием с оптимизацией сборки и кэшированием.

### База данных
- Prisma ORM для работы с PostgreSQL
- Миграции для версионирования схемы
- Seed данные для тестирования

### Аутентификация
- NextAuth.js для веб-приложений
- JWT токены для API
- CSRF защита

### Очереди
- BullMQ для фоновых задач
- Redis как брокер сообщений
- Web Push и Telegram уведомления

### UI/UX
- Next.js 15 с App Router
- React 19 с Server Components
- Tailwind CSS для стилизации
- Material-UI компоненты

## Стандарты кода

### TypeScript
- Строгая типизация
- Общие типы в пакете @gafus/types
- JSDoc комментарии для сложных функций

### React
- Функциональные компоненты
- Hooks для состояния
- Server Components где возможно
- Client Components только при необходимости

### Стили
- Tailwind CSS utility-first
- Mobile-first подход
- Переиспользуемые компоненты в @gafus/ui-components

## Git workflow

1. Создайте feature ветку от main
2. Делайте коммиты с понятными сообщениями
3. Создайте Pull Request
4. После ревью и тестов - мерж в main

## Деплой

Проект настроен для деплоя через Docker:
- Отдельные Dockerfile для каждого сервиса
- docker-compose для локальной разработки
- CI/CD через GitHub Actions
