# API Routes v1

**Актуализировано:** май 2026
**Base:** `/api/v1` для доменных групп, `/health` и `/ready` в корне API service.

API v1 реализован в `apps/api` на Hono. Mount points и middleware находятся в `apps/api/src/app.ts`, endpoint files - в `apps/api/src/routes/v1/`.

## Общие правила

- Формат ответа: `{ success: boolean, data?: T, error?: string, code?: string }`.
- Защищённые группы используют `Authorization: Bearer <access_token>`.
- Auth/public/health routes доступны без JWT, кроме явно защищённых auth endpoints.
- Validation выполняется через Zod и `@hono/zod-validator`, где schema задана в route file.
- Rate limits задаются в `apps/api/src/middleware/rate-limit.ts`.
- CSRF относится к Next.js web/panel endpoints, а не к Hono mobile API.

## Middleware по группам

| Base path                    | Auth                                                         | Rate limiter                                                                      |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/health`, `/ready`          | no                                                           | no                                                                                |
| `/api/v1/public/*`           | no                                                           | `apiRateLimiter`                                                                  |
| `/api/v1/auth/*`             | mixed                                                        | `authRateLimiter`, для `GET /username-available` - `usernameAvailableRateLimiter` |
| `/api/v1/user/*`             | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/articles/*`         | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/courses/*`          | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/pets/*`             | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/training/*`         | JWT, кроме HLS manifest/segment exceptions в auth middleware | `apiRateLimiter`                                                                  |
| `/api/v1/daily-course/*`     | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/exam/*`             | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/offline/*`          | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/achievements/*`     | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/subscriptions/*`    | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/notes/*`            | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/reminders/*`        | JWT                                                          | `apiRateLimiter`                                                                  |
| `/api/v1/payments/*`         | JWT                                                          | `paymentsRateLimiter` для create/apple verify                                     |
| `/api/v1/consultations/*`    | JWT, часть routes role-gated                                 | `apiRateLimiter` + booking limiter                                                |
| `/api/v1/app-subscription/*` | JWT                                                          | `paymentsRateLimiter`                                                             |

## Endpoint inventory

### Health

- `GET /health`
- `GET /ready`

### Public

- `GET /api/v1/public/mobile-app`

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/check-phone-match`
- `POST /api/v1/auth/password-reset-request`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/email-change-request`
- `POST /api/v1/auth/email-change-confirm`
- `POST /api/v1/auth/vk`
- `POST /api/v1/auth/vk-consent`
- `POST /api/v1/auth/vk-phone-set`
- `POST /api/v1/auth/vk-link`
- `POST /api/v1/auth/set-password`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/auth/username-available`
- `POST /api/v1/auth/username-change`

Password/phone reset flows that still depend on Telegram helpers are legacy: отдельного `apps/telegram-bot` в монорепе нет, helpers могут вернуть временную недоступность.

### User

- `GET /api/v1/user/profile/public`
- `GET /api/v1/user/profile`
- `GET /api/v1/user/onboarding-tour`
- `POST /api/v1/user/onboarding-tour/complete`
- `PUT /api/v1/user/profile`
- `POST /api/v1/user/avatar`
- `POST /api/v1/user/account/deletion-code`
- `POST /api/v1/user/account/delete`

### Articles

- `GET /api/v1/articles`
- `POST /api/v1/articles/:id/like`
- `POST /api/v1/articles/:slug/view`
- `GET /api/v1/articles/:slug`

### Courses

- `GET /api/v1/courses`
- `GET /api/v1/courses/access`
- `GET /api/v1/courses/favorites`
- `POST /api/v1/courses/favorites`
- `POST /api/v1/courses/personalization`
- `GET /api/v1/courses/metadata`
- `GET /api/v1/courses/reviews`
- `POST /api/v1/courses/reviews`
- `PATCH /api/v1/courses/reviews`
- `DELETE /api/v1/courses/reviews`

### Pets

- `GET /api/v1/pets`
- `POST /api/v1/pets`
- `GET /api/v1/pets/:petId`
- `PUT /api/v1/pets/:petId`
- `DELETE /api/v1/pets/:petId`
- `POST /api/v1/pets/:petId/photo`
- `GET /api/v1/pets/:petId/documents`
- `POST /api/v1/pets/:petId/documents`
- `PUT /api/v1/pets/:petId/documents/:documentId`
- `DELETE /api/v1/pets/:petId/documents/:documentId`
- `GET /api/v1/pets/:petId/documents/:documentId/download`
- `GET /api/v1/pets/:petId/prevention`
- `POST /api/v1/pets/:petId/prevention`
- `POST /api/v1/pets/:petId/prevention/batch`
- `PUT /api/v1/pets/:petId/prevention/:entryId`
- `DELETE /api/v1/pets/:petId/prevention/:entryId`

### Training

- `GET /api/v1/training/days`
- `GET /api/v1/training/day`
- `POST /api/v1/training/step/start`
- `POST /api/v1/training/step/pause`
- `POST /api/v1/training/step/resume`
- `POST /api/v1/training/step/reset`
- `POST /api/v1/training/step/complete/practice`
- `POST /api/v1/training/step/complete/theory`
- `POST /api/v1/training/diary`
- `GET /api/v1/training/diary`
- `POST /api/v1/training/video/url`
- `GET /api/v1/training/video/:videoId/manifest`
- `GET /api/v1/training/video/:videoId/manifest.m3u8`
- `GET /api/v1/training/video/:videoId/segment`

### Daily Course

- `GET /api/v1/daily-course/today`
- `GET /api/v1/daily-course/day`
- `POST /api/v1/daily-course/step/start`
- `POST /api/v1/daily-course/step/pause`
- `POST /api/v1/daily-course/step/resume`
- `POST /api/v1/daily-course/step/reset`
- `POST /api/v1/daily-course/step/complete`

### Exam

- `GET /api/v1/exam/result`
- `POST /api/v1/exam/submit`
- `POST /api/v1/exam/upload-video`

### Offline

- `GET /api/v1/offline/course/version`
- `GET /api/v1/offline/course/updates`
- `GET /api/v1/offline/course/download`

### Achievements

- `GET /api/v1/achievements/training-dates`
- `GET /api/v1/achievements`

### Subscriptions

- `GET /api/v1/subscriptions/push`
- `POST /api/v1/subscriptions/push`
- `POST /api/v1/subscriptions/push/device-status`
- `DELETE /api/v1/subscriptions/push`

### Notes

- `GET /api/v1/notes/student`

### Reminders

- `GET /api/v1/reminders`
- `POST /api/v1/reminders`
- `PUT /api/v1/reminders/:id`
- `DELETE /api/v1/reminders/:id`

### Payments

- `POST /api/v1/payments/create`
- `POST /api/v1/payments/apple/verify`
- `GET /api/v1/payments/apple/course-metadata`

### Consultations

- `GET /api/v1/consultations/cynologists`
- `GET /api/v1/consultations/cynologists/:cynologistUserId/slots`
- `GET /api/v1/consultations/cynologists/:cynologistUserId/slots/:slotId/verify`
- `POST /api/v1/consultations/book`
- `GET /api/v1/consultations/my`
- `POST /api/v1/consultations/bookings/:bookingId/cancel`
- `GET /api/v1/consultations/trainer/bookings`
- `POST /api/v1/consultations/trainer/bookings/:bookingId/confirm`
- `POST /api/v1/consultations/trainer/bookings/:bookingId/complete`
- `POST /api/v1/consultations/trainer/bookings/:bookingId/no-show`
- `POST /api/v1/consultations/trainer/bookings/:bookingId/reject`
- `GET /api/v1/consultations/trainer/availability`
- `PUT /api/v1/consultations/trainer/availability`
- `POST /api/v1/consultations/trainer/day-offs`
- `DELETE /api/v1/consultations/trainer/day-offs/:dayOffId`
- `POST /api/v1/consultations/trainer/exceptions`
- `DELETE /api/v1/consultations/trainer/exceptions/:exceptionId`
- `GET /api/v1/consultations/admin/cynologists`
- `PUT /api/v1/consultations/admin/cynologists/listed`
- `GET /api/v1/consultations/admin/bookings`

Trainer routes require one of `TRAINER`, `ADMIN`, `MODERATOR`. Admin routes require `ADMIN` or `MODERATOR`.

### App Subscription

- `GET /api/v1/app-subscription/status`
- `GET /api/v1/app-subscription/offer`
- `POST /api/v1/app-subscription/yookassa/start`
- `POST /api/v1/app-subscription/yookassa/cancel`
- `POST /api/v1/app-subscription/apple/verify`
- `POST /api/v1/app-subscription/apple/restore`

## Как обновлять этот документ

После изменения `apps/api/src/routes/v1/*.ts` сверяйте список командой:

```bash
python3 - <<'PY'
from pathlib import Path
import re
for f in sorted(Path("apps/api/src/routes/v1").glob("*.ts")):
    if f.name.endswith(".test.ts"):
        continue
    text = f.read_text()
    print(f"## {f.name}")
    for m in re.finditer(r"(\\w+Routes)\\.(get|post|put|patch|delete)\\(\\s*[\\n ]*([\\\"`'])(.*?)\\3", text, re.S):
        print(f"{m.group(2).upper()} {m.group(4)}")
PY
```
