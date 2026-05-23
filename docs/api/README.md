# API GAFUS

В проекте есть два типа HTTP-интерфейсов:

- `apps/api` - standalone Hono REST API v1, базовый путь `/api/v1`, основной API для mobile.
- Next.js Route Handlers в `apps/web`, `apps/trainer-panel`, `apps/admin-panel` - локальные web/panel endpoints для health, csrf, export, service routes и отдельных web-сценариев.

## Standalone API v1

Код:

- `apps/api/src/app.ts` - middleware и mount route groups.
- `apps/api/src/index.ts` - Node server и graceful shutdown.
- `apps/api/src/routes/v1/*.ts` - группы маршрутов.
- `apps/api/src/middleware/*` - auth, CORS, rate limits, error handler.

Базовые middleware:

- `requestId()`
- Hono logger
- secure headers
- CORS
- route-specific Redis rate limiting
- Bearer JWT auth для защищённых групп
- global error handler

Формат ответа: `{ success: boolean, data?: T, error?: string, code?: string }`.

## Route groups

| Base path                  | Auth       | Назначение                                              |
| -------------------------- | ---------- | ------------------------------------------------------- |
| `/health`, `/ready`        | no         | health/readiness                                        |
| `/api/v1/public`           | no         | публичная mobile-конфигурация                           |
| `/api/v1/auth`             | mixed      | login/register/refresh/VK/password/email/username flows |
| `/api/v1/user`             | JWT        | профиль, avatar, onboarding, account deletion           |
| `/api/v1/articles`         | JWT        | статьи, лайки, просмотры                                |
| `/api/v1/courses`          | JWT        | курсы, доступ, избранное, metadata, reviews             |
| `/api/v1/pets`             | JWT        | питомцы, фото, документы, профилактика                  |
| `/api/v1/training`         | JWT mostly | дни/шаги/дневник/video signed URLs/HLS                  |
| `/api/v1/daily-course`     | JWT        | ежедневный курс                                         |
| `/api/v1/exam`             | JWT        | результаты, submit, video upload                        |
| `/api/v1/offline`          | JWT        | версии/updates/download курса                           |
| `/api/v1/achievements`     | JWT        | достижения и training dates                             |
| `/api/v1/subscriptions`    | JWT        | push subscriptions                                      |
| `/api/v1/notes`            | JWT        | заметки ученика                                         |
| `/api/v1/reminders`        | JWT        | пользовательские reminders                              |
| `/api/v1/payments`         | JWT        | YooKassa и Apple course purchase verify                 |
| `/api/v1/consultations`    | JWT/role   | консультации, слоты, booking, trainer/admin actions     |
| `/api/v1/app-subscription` | JWT        | статус/offer/ЮKassa/Apple app subscription              |

Подробный перечень endpoint-ов: [v1-routes.md](./v1-routes.md).

## Auth

API v1 использует `Authorization: Bearer <access_token>`.

- Access token: короткоживущий JWT.
- Refresh token: используется в `/api/v1/auth/refresh`.
- Секреты: `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- Для role-gated consultation/admin routes используется проверка роли в route layer.

Next.js приложения используют NextAuth session/JWT и свои Server Actions/Route Handlers. Не переносите NextAuth session assumptions в standalone API.

## CSRF

CSRF относится к Next.js web/panel mutating endpoints/actions через `@gafus/csrf`. Standalone Hono API защищается Bearer JWT, CORS и rate limits; mobile не должен отправлять `x-csrf-token` в API v1, если конкретный endpoint не требует иного.

## Где добавлять новый API

- Mobile/external JSON contract: `apps/api/src/routes/v1`, вызов сервиса `@gafus/core`.
- Web form mutation: Server Action в соответствующем feature-модуле приложения.
- Web JSON для React Query/special headers: Next.js Route Handler рядом с feature.
- Shared бизнес-правила: `@gafus/core` или профильный package, не route file.
