# Gafus - Система управления фитнес-тренировками

## 🎯 Описание проекта

Gafus - это комплексная система для управления фитнес-тренировками, построенная как монорепозиторий. Система включает веб-приложение для пользователей, панель управления для тренеров, телеграм-бот для уведомлений и систему мониторинга ошибок.

## 🏗️ Архитектура

Проект состоит из 5 основных приложений и 9 общих пакетов:

### Приложения (apps/)
- **[Web App](apps/web/README.md)** - основное веб-приложение для пользователей
- **[Trainer Panel](apps/trainer-panel/README.md)** - панель управления для тренеров  
- **[Telegram Bot](apps/telegram-bot/README.md)** - бот для уведомлений и взаимодействия
- **[Error Dashboard](apps/error-dashboard/README.md)** - панель мониторинга ошибок
- **[Bull Board](apps/bull-board/README.md)** - интерфейс для управления очередями

### Пакеты (packages/)
- **[Auth](packages/auth/README.md)** - система аутентификации и авторизации
- **[Prisma](packages/prisma/README.md)** - ORM, схема БД и миграции
- **[Types](packages/types/README.md)** - общие TypeScript типы
- **[UI Components](packages/ui-components/README.md)** - переиспользуемые UI компоненты
- **[WebPush](packages/webpush/README.md)** - система push-уведомлений
- **[Worker](packages/worker/README.md)** - фоновые задачи и обработчики
- **[Queues](packages/queues/README.md)** - управление очередями задач
- **[React Query](packages/react-query/README.md)** - управление состоянием и кэширование
- **[CSRF](packages/csrf/README.md)** - защита от CSRF-атак
- **[Error Handling](packages/error-handling/README.md)** - централизованная обработка ошибок

## 🚀 Быстрый старт

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

# Запуск всех сервисов
pnpm start
```

## 📚 Документация

- **[Руководство разработчика](DEVELOPMENT.md)** - настройка окружения и разработка
- **[API Документация](API.md)** - описание всех API endpoints
- **[Архитектура системы](ARCHITECTURE.md)** - детальное описание архитектуры
- **[Развертывание](DEPLOYMENT.md)** - инструкции по деплою
- **[Конфигурация](CONFIGURATION.md)** - настройка всех компонентов

## 🛠️ Технологический стек

### Frontend
- **Next.js 15** - React фреймворк с App Router
- **React 19** - UI библиотека с Server Components
- **TypeScript** - типизированный JavaScript
- **Tailwind CSS** - utility-first CSS фреймворк
- **Material-UI** - компоненты интерфейса

### Backend
- **Node.js** - серверная платформа
- **Prisma** - ORM для работы с БД
- **PostgreSQL** - основная база данных
- **Redis** - кэширование и очереди
- **BullMQ** - управление фоновыми задачами

### Инфраструктура
- **Docker** - контейнеризация
- **Turbo** - управление монорепозиторием
- **pnpm** - менеджер пакетов
- **ESLint/Prettier** - линтинг и форматирование

## 🎯 Основные функции

### Для пользователей
- 📱 Управление тренировками и программами
- 🏆 Система достижений и прогресса
- 📊 Статистика и аналитика
- 🔔 Push-уведомления и Telegram уведомления
- 👤 Персональный профиль и настройки

### Для тренеров
- 👥 Управление клиентами
- 📋 Создание тренировочных программ
- 📈 Мониторинг прогресса клиентов
- 💬 Коммуникация через Telegram
- 📊 Аналитика и отчеты

### Системные функции
- 🔐 Безопасная аутентификация
- 📱 Push-уведомления
- 🤖 Telegram бот интеграция
- 📊 Мониторинг ошибок
- ⚡ Фоновые задачи и очереди

## 📁 Структура проекта

```
gafus/
├── apps/                    # Приложения
│   ├── web/                # Веб-приложение
│   ├── trainer-panel/      # Панель тренера
│   ├── telegram-bot/       # Телеграм-бот
│   ├── error-dashboard/    # Панель ошибок
│   └── bull-board/         # Управление очередями
├── packages/               # Общие пакеты
│   ├── auth/              # Аутентификация
│   ├── prisma/            # База данных
│   ├── types/             # Типы
│   ├── ui-components/     # UI компоненты
│   ├── webpush/           # Push-уведомления
│   ├── worker/            # Фоновые задачи
│   ├── queues/            # Очереди
│   ├── react-query/       # Состояние
│   ├── csrf/              # CSRF защита
│   └── error-handling/    # Обработка ошибок
├── docs/                  # Документация
├── scripts/               # Скрипты сборки
├── nginx/                 # Nginx конфигурация
└── docker-compose*.yml    # Docker конфигурации
```

## 🔧 Команды разработки

```bash
# Разработка
pnpm dev                    # Запуск всех сервисов
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

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте feature ветку (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 📞 Поддержка

Если у вас есть вопросы или проблемы, создайте issue в репозитории или свяжитесь с командой разработки.