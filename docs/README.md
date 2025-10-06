# Документация проекта GAFUS

Добро пожаловать в документацию комплексной системы управления фитнес-тренировками GAFUS!

## 📋 Содержание

### 🏗️ Архитектура и обзор
- [Обзор проекта](./overview/README.md) - Общее описание системы
- [Архитектура](./architecture/README.md) - Архитектурные решения и паттерны
- [Технологический стек](./tech-stack/README.md) - Используемые технологии

### 📦 Пакеты (Packages)
- [@gafus/auth](./packages/auth.md) - Система аутентификации и авторизации
- [@gafus/prisma](./packages/prisma.md) - База данных и ORM
- [@gafus/types](./packages/types.md) - Общие типы TypeScript
- [@gafus/logger](./packages/logger.md) - Система логирования
- [@gafus/error-handling](./packages/error-handling.md) - Обработка ошибок
- [@gafus/csrf](./packages/csrf.md) - Защита от CSRF атак
- [@gafus/cdn-upload](./packages/cdn-upload.md) - Загрузка файлов в CDN
- [@gafus/queues](./packages/queues.md) - Система очередей
- [@gafus/react-query](./packages/react-query.md) - Управление состоянием
- [@gafus/webpush](./packages/webpush.md) - Push уведомления
- [@gafus/worker](./packages/worker.md) - Фоновые задачи
- [@gafus/ui-components](./packages/ui-components.md) - UI компоненты

### 🚀 Приложения (Apps)
- [Web приложение](./apps/web.md) - Основное веб-приложение для пользователей
- [Trainer Panel](./apps/trainer-panel.md) - Панель управления для тренеров
- [Telegram Bot](./apps/telegram-bot.md) - Telegram бот для уведомлений
- [Error Dashboard](./apps/error-dashboard.md) - Панель мониторинга ошибок
- [Bull Board](./apps/bull-board.md) - Мониторинг очередей

### 🛠️ Разработка
- [Настройка окружения](./development/setup.md) - Первоначальная настройка
- [Структура проекта](./development/project-structure.md) - Организация кода
- [Соглашения по коду](./development/coding-standards.md) - Стандарты разработки
- [Тестирование](./development/testing.md) - Стратегия тестирования

### 🚀 Развертывание
- [Конфигурация](./deployment/configuration.md) - Настройка переменных окружения
- [Docker](./deployment/docker.md) - Контейнеризация
- [CI/CD](./deployment/ci-cd.md) - Непрерывная интеграция и развертывание

### 📊 Мониторинг и обслуживание
- [Мониторинг](./monitoring/README.md) - Системы мониторинга
- [Логирование](./monitoring/logging.md) - Централизованное логирование
- [Обработка ошибок](./monitoring/error-handling.md) - Отслеживание ошибок

### 📚 API Документация
- [REST API](./api/rest.md) - RESTful API endpoints
- [Server Actions](./api/server-actions.md) - Next.js Server Actions
- [WebSocket](./api/websocket.md) - WebSocket соединения

## 🎯 Быстрый старт

1. **Клонирование репозитория**
   ```bash
   git clone <repository-url>
   cd gafus
   ```

2. **Установка зависимостей**
   ```bash
   pnpm install
   ```

3. **Настройка окружения**
   ```bash
   pnpm setup:env
   ```

4. **Запуск в режиме разработки**
   ```bash
   pnpm dev
   ```

## 📞 Поддержка

Если у вас есть вопросы или проблемы:
- Создайте issue в репозитории
- Обратитесь к команде разработки
- Проверьте раздел [Troubleshooting](./troubleshooting/README.md)

---

*Последнее обновление: $(date)*
