# API GAFUS

## Обзор

- **API Routes v1** — REST API для мобильного приложения (React Native) и внешних интеграций. Базовый путь: `/api/v1`. Спецификация: [v1-routes.md](./v1-routes.md).
- **Server Actions** — используются в Next.js-приложениях (web, trainer-panel) для мутаций и данных; валидация Zod, авторизация через `getCurrentUserId()` или `getServerSession(authOptions)`.
- **Web (Next.js)** — часть эндпоинтов реализована как Next.js API Routes в `apps/web/src/app/api/` (например `/api/v1/*`, `/api/video/*`, `/api/v1/payments/*`).

## Аутентификация и безопасность

- Сессия: NextAuth.js, JWT. В API v1: `getServerSession(authOptions)`.
- Мутации (POST/PUT/DELETE): защита CSRF (`withCSRFProtection`), заголовок `x-csrf-token`.
- Формат ответов: `{ success: boolean, data?: T, error?: string, code?: string }`. Коды ошибок: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_SERVER_ERROR`.

## Документация по доменам

Полный перечень эндпоинтов v1: [API Routes v1](./v1-routes.md) (auth, training, courses, user, pets, notifications, subscriptions, achievements, exam, video, offline).

Legacy/веб-специфичные маршруты (HLS-видео, трекинг презентаций, reengagement) перечислены в конце v1-routes.md.
