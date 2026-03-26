# Telegram Bot — удалено из монорепо

Приложение `apps/telegram-bot`, образ `ci-cd/docker/Dockerfile-telegram-bot-optimized` и сервис в production compose **удалены** (март 2026) в рамках перехода на регистрацию по email/паролю без отдельного бота.

**Сейчас:**

- Регистрация и сессии: web (NextAuth + server actions), mobile (JWT через `apps/api`).
- Функции `sendTelegramPasswordResetRequest`, `sendTelegramPhoneChangeRequest`, `sendTelegramUsernameChangeNotification` в `@gafus/auth` остаются как **заглушки** с понятной ошибкой для пользователя, пока не появится замена канала (email/SMS и т.д.).

**Документация:** [Docker](../deployment/docker.md), [конфигурация](../deployment/configuration.md), [API v1](../api/v1-routes.md), [@gafus/auth](../packages/auth.md).
