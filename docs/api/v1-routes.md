# API Routes v1 для React Native

**Дата создания:** 19 января 2026  
**Версия:** 1.0.0  
**Базовый URL:** `/api/v1`

---

## Обзор

Все API Routes используют:

- `getServerSession(authOptions)` для авторизации
- `withCSRFProtection` для мутирующих операций (POST/PUT/DELETE)
- JSON формат ответов: `{ success: boolean, data?: T, error?: string, code?: string }`

### Коды ошибок

| Код                     | HTTP Status | Описание                    |
| ----------------------- | ----------- | --------------------------- |
| `UNAUTHORIZED`          | 401         | Пользователь не авторизован |
| `FORBIDDEN`             | 403         | Недостаточно прав доступа   |
| `NOT_FOUND`             | 404         | Ресурс не найден            |
| `VALIDATION_ERROR`      | 400         | Ошибка валидации данных     |
| `INTERNAL_SERVER_ERROR` | 500         | Внутренняя ошибка сервера   |

---

## Auth — Аутентификация

### POST `/api/v1/auth/check-state`

Проверка состояния пользователя по username.

**Body:**

```json
{ "username": "string" }
```

**Response:**

```json
{ "success": true, "data": { "exists": boolean, "confirmed": boolean } }
```

---

### POST `/api/v1/auth/check-confirmed`

Проверка подтверждения аккаунта.

**Body:**

```json
{ "userId": "string" }
```

---

### POST `/api/v1/auth/password-reset-request`

Запрос на сброс пароля.

**Body:**

```json
{ "username": "string" }
```

---

### POST `/api/v1/auth/register`

Регистрация нового пользователя.

**Body:**

```json
{
  "username": "string",
  "password": "string",
  "phone": "string",
  "inviteCode": "string (optional)"
}
```

---

### POST `/api/v1/auth/reset-password`

Сброс пароля по токену.

**Body:**

```json
{
  "token": "string",
  "newPassword": "string"
}
```

---

### POST `/api/v1/auth/check-phone-match`

Проверка соответствия телефона и username.

**Body:**

```json
{
  "username": "string",
  "phone": "string"
}
```

---

## Training — Тренировки (ОСНОВНОЙ ФУНКЦИОНАЛ)

### GET `/api/v1/training/days`

Получить список дней тренировок курса.

**Query params:**

- `type` (optional) — тип курса (personal, group, etc.)

**Response:**

```json
{
  "success": true,
  "data": {
    "trainingDays": [...],
    "courseDescription": "string",
    "courseId": "uuid",
    "courseVideoUrl": "string",
    "courseEquipment": "string",
    "courseTrainingLevel": "string"
  }
}
```

---

### GET `/api/v1/training/day`

Получить день с шагами пользователя.

**Query params:**

- `courseType` (required) — тип курса
- `dayOnCourseId` (required) — UUID дня
- `createIfMissing` (optional) — "true"/"false"

**Response:**

```json
{
  "success": true,
  "data": {
    "trainingDayId": "uuid",
    "dayOnCourseId": "uuid",
    "title": "string",
    "type": "string",
    "steps": [...]
  }
}
```

---

### POST `/api/v1/training/step/start`

Начать выполнение шага тренировки.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "status": "IN_PROGRESS",
  "durationSec": 300
}
```

---

### POST `/api/v1/training/step/status`

Обновить статус шага.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "status": "COMPLETED",
  "stepTitle": "string (optional)",
  "stepOrder": 0
}
```

---

### POST `/api/v1/training/step/pause`

Поставить шаг на паузу.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "timeLeftSec": 120
}
```

---

### POST `/api/v1/training/step/resume`

Возобновить шаг после паузы.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0
}
```

---

### POST `/api/v1/training/step/reset`

Сбросить шаг (таймер) в NOT_STARTED. Обнуляет paused и remainingSec, пересчитывает статус дня.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "durationSec": 300
}
```

`durationSec` — опционально.

---

### POST `/api/v1/training/step/complete/theory`

Завершить теоретический шаг.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "stepTitle": "string (optional)",
  "stepOrder": 0
}
```

---

### POST `/api/v1/training/step/complete/practice`

Завершить практический шаг.

**Body:**

```json
{
  "courseId": "uuid",
  "dayOnCourseId": "uuid",
  "stepIndex": 0,
  "stepTitle": "string (optional)",
  "stepOrder": 0
}
```

---

## Courses — Курсы

### GET `/api/v1/courses`

Получить список курсов с прогрессом пользователя.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "type": "string",
      "progress": 0.75,
      ...
    }
  ]
}
```

---

### GET `/api/v1/courses/access`

Проверить доступ к курсу.

**Query params:**

- `courseType` (required) — тип курса

**Response:**

```json
{ "success": true, "data": { "hasAccess": true } }
```

---

### GET `/api/v1/courses/metadata`

Получить метаданные курса.

**Query params:**

- `courseId` (required) — UUID курса

---

### GET `/api/v1/courses/favorites`

Получить избранные курсы.

---

### POST `/api/v1/courses/favorites`

Переключить избранное.

**Body:**

```json
{ "courseId": "uuid" }
```

---

### GET `/api/v1/courses/reviews`

Получить отзывы о курсе.

**Query params:**

- `courseId` (required) — UUID курса

---

### POST `/api/v1/courses/reviews`

Создать/обновить отзыв.

**Body:**

```json
{
  "courseId": "uuid",
  "rating": 5,
  "comment": "string"
}
```

---

## User — Профиль пользователя

### GET `/api/v1/user/profile`

Получить профиль текущего пользователя.

---

### PUT `/api/v1/user/profile`

Обновить профиль.

**Body:**

```json
{
  "fullName": "string",
  "about": "string",
  "telegram": "string",
  "instagram": "string",
  "website": "string",
  "birthDate": "ISO date string"
}
```

---

### GET `/api/v1/user/profile/public`

Получить публичный профиль пользователя.

**Query params:**

- `userId` (required) — UUID пользователя

---

### POST `/api/v1/user/avatar`

Обновить аватар пользователя.

**Body:** `multipart/form-data`, поле `file`. Типы: JPEG, PNG, WebP, GIF. Макс. 5 МБ.

**Response:** `{ "success": true, "data": { "avatarUrl": "string" } }`

---

### GET `/api/v1/user/preferences`

Получить настройки пользователя.

---

### PUT `/api/v1/user/preferences`

Обновить настройки.

**Body:**

```json
{
  "notifications": true,
  "theme": "dark",
  ...
}
```

---

## Pets — Питомцы

### GET `/api/v1/pets`

Получить список питомцев пользователя.

---

### POST `/api/v1/pets`

Создать питомца.

**Body:**

```json
{
  "name": "string",
  "type": "DOG|CAT|OTHER",
  "breed": "string",
  "birthDate": "ISO date string",
  "heightCm": 50,
  "weightKg": 15,
  "photoUrl": "string",
  "notes": "string"
}
```

---

### POST `/api/v1/pets/[petId]/photo`

Загрузить фото питомца.

**Body:** `multipart/form-data`, поле `file`. Типы: JPEG, PNG, WebP, GIF. Макс. 2 МБ.

**Response:** `{ "success": true, "data": { "photoUrl": "string" } }`

---

### PUT `/api/v1/pets/[petId]`

Обновить питомца.

**Body:** Частичные поля из создания

---

### DELETE `/api/v1/pets/[petId]`

Удалить питомца.

---

## Notifications — Уведомления

### POST `/api/v1/notifications/step`

Создать уведомление для шага.

**Body:**

```json
{
  "day": 1,
  "stepIndex": 0,
  "durationSec": 300,
  "maybeUrl": "/trainings/personal/uuid",
  "stepTitle": "string"
}
```

---

### POST `/api/v1/notifications/step/pause`

Поставить уведомление на паузу.

**Body:**

```json
{ "notificationId": "uuid" }
```

---

### POST `/api/v1/notifications/step/resume`

Возобновить уведомление.

---

### POST `/api/v1/notifications/step/reset`

Сбросить уведомление.

---

### POST `/api/v1/notifications/step/toggle`

Переключить паузу уведомления.

---

## Subscriptions — Push подписки

### GET `/api/v1/subscriptions/push`

Получить push подписки пользователя.

---

### POST `/api/v1/subscriptions/push`

Сохранить push подписку.

**Body:**

```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "string",
    "auth": "string"
  }
}
```

---

### DELETE `/api/v1/subscriptions/push`

Удалить push подписку.

**Body:**

```json
{ "endpoint": "https://..." }
```

---

## Achievements — Достижения

### GET `/api/v1/achievements/training-dates`

Уникальные даты тренировок пользователя (для серий и календаря).

**Response:**

```json
{
  "success": true,
  "data": { "dates": ["2026-01-15T00:00:00.000Z", ...] }
}
```

### GET `/api/v1/achievements`

Полная статистика и достижения (то же, что на web): `totalCourses`, `completedCourses`, `inProgressCourses`, `totalCompletedDays`, `overallProgress`, `currentStreak`, `longestStreak`, массив `achievements` по категориям (courses, progress, streak, special).

**Response:** `{ "success": true, "data": AchievementData }`

---

## Exam — Экзамены

### GET `/api/v1/exam/result`

Получить результат экзамена.

**Query params:**

- `userStepId` (required) — UUID шага пользователя

---

### POST `/api/v1/exam/submit`

Отправить результат экзамена.

**Body:**

```json
{
  "userStepId": "uuid",
  "stepId": "uuid",
  "testAnswers": { "q1": 0, "q2": 1 },
  "testScore": 8,
  "testMaxScore": 10,
  "videoReportUrl": "string",
  "writtenFeedback": "string",
  "overallScore": 85,
  "isPassed": true
}
```

---

## Video — Видео

### GET `/api/v1/video/playback-url`

Получить URL для воспроизведения видео.

**Query params:**

- `videoUrl` (required) — исходный URL видео

**Response:**

```json
{
  "success": true,
  "data": { "playbackUrl": "https://..." }
}
```

---

## Offline — Офлайн режим

### GET `/api/v1/offline/course/version`

Получить версию курса для сравнения.

**Query params:**

- `courseType` (required) — тип курса

**Response:**

```json
{
  "success": true,
  "data": { "version": "2026-01-19T12:00:00.000Z" }
}
```

---

### GET `/api/v1/offline/course/updates`

Проверить наличие обновлений курса.

**Query params:**

- `courseType` (required) — тип курса
- `clientVersion` (required) — версия на клиенте (ISO date)

**Response:**

```json
{
  "success": true,
  "data": {
    "hasUpdates": true,
    "serverVersion": "2026-01-19T15:00:00.000Z"
  }
}
```

---

### GET `/api/v1/offline/course/download`

Скачать полные данные курса для офлайн режима. Доступ только к курсам, на которые у пользователя есть доступ (проверка через training days). При отсутствии доступа возвращается **403**.

**Query params:**

- `courseType` (required) — тип курса

**Response:**

```json
{
  "success": true,
  "data": {
    "course": { ... },
    "trainingDays": [ ... ],
    "mediaFiles": {
      "videos": ["url1", "url2"],
      "images": ["url1", "url2"],
      "pdfs": ["url1"]
    }
  }
}
```

---

## Legacy API Routes (не для RN)

Эти routes используются только веб-приложением и НЕ входят в v1:

| Путь                            | Описание                |
| ------------------------------- | ----------------------- |
| `/api/video/[videoId]/manifest` | HLS манифест с токенами |
| `/api/video/[videoId]/segment`  | HLS сегменты            |
| `/api/track-presentation`       | Трекинг презентаций     |
| `/api/track-presentation-event` | События презентаций     |
| `/api/track-reengagement-click` | Клики реактивации       |

---

## Changelog

### v1.0.0 (19.01.2026)

- Создание полного набора API Routes для React Native
- 38 эндпоинтов во всех доменах
