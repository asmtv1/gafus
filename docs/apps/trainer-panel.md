# Trainer Panel (@gafus/trainer-panel)

`apps/trainer-panel` - Next.js панель для тренеров, администраторов и модераторов. Назначение: управление обучающим контентом, проверка экзаменов, консультации, ежедневный курс, видео и статистика.

## Стек

- Next.js 15 App Router
- React 19
- NextAuth.js
- Material UI
- Zod
- `@gafus/core`
- `@gafus/statistics`
- `@gafus/cdn-upload`
- `@gafus/video-access`
- `@gafus/queues`

## Доступ

Доступ к `/main-panel/*` ограничен ролями:

- `TRAINER`
- `ADMIN`
- `MODERATOR`

Проверка сессии и роли выполняется в приложении через NextAuth/middleware/layout-level checks. Бизнес-сервисы не должны зависеть от Next.js session.

## Текущие routes

```text
app/
├── login/
├── api/
│   ├── auth/[...nextauth]/
│   ├── chat/
│   ├── csrf-token/
│   ├── health/
│   └── video/[videoId]/
│       ├── manifest/
│       └── segment/
└── (main)/main-panel/
    ├── page.tsx
    ├── articles/
    │   └── new/
    ├── consultations/
    │   └── availability/
    ├── courses/
    │   └── new/
    ├── daily-course/
    │   ├── bundles/
    │   ├── import/
    │   ├── statistics/
    │   └── steps/
    ├── days/
    │   └── new/
    ├── exam-results/
    ├── faq/
    ├── my-videos/
    │   └── upload/route.ts
    ├── notes/
    ├── statistics/
    ├── steps/
    │   └── new/
    └── templates/
```

## Feature modules

```text
src/features/
├── ai-chat/
├── articles/
├── consultations/
├── courses/
├── daily-course/
├── exam-results/
├── faq/
├── notes/
├── statistics/
├── steps/
├── trainer-videos/
└── users/
```

`features/users` используется как вспомогательная логика поиска/отображения учеников, а не как отдельный `/main-panel/users` раздел.

## Архитектурные правила

Trainer Panel - тонкий слой поверх shared packages:

1. Проверить session/role.
2. Распарсить FormData/JSON.
3. Провалидировать вход через Zod/core schemas.
4. Выполнить CDN/file operation в app, если нужен upload/delete.
5. Вызвать `@gafus/core` или `@gafus/statistics`.
6. При успехе вызвать `revalidatePath`, `revalidateTag`, `invalidateCoursesCache` или `invalidateTrainingDaysCache`.

Бизнес-правила не должны жить в компонентах и server actions. Для новых доменных правил сначала ищите подходящий core service.

## Core services

Основные сервисы, используемые панелью:

- `trainerCourse`
- `trainerStep`
- `trainingDay`
- `trainerVideo`
- `notes`
- `exam`
- `user`
- `course`
- `dailyCourse`
- `consultation`
- `cache`
- `common`
- `video`

Статистика и authored course analytics - через `@gafus/statistics`.

## Критические гарантии

- При обновлении курса нельзя терять связи `DayOnCourse`, иначе ломается пользовательский прогресс.
- CDN upload должен иметь rollback/delete path при ошибке после загрузки файла.
- Проверка экзамена должна оставаться транзакционной: `UserStep` и `ExamResult` обновляются согласованно.
- Для видео используйте `trainerVideo`, `video-access` и текущие HLS routes, не выдавайте постоянные storage URL клиенту.

## Основные сценарии

- Courses: создание/редактирование курсов, guide-course, paid course, Apple IAP Product ID, логотипы.
- Days/Steps/Templates: дни тренировок, шаги, DIARY/exam/practice/theory, шаблоны.
- Daily Course: расписания, bundles, import, statistics, steps.
- Articles/FAQ/Notes: контентные разделы.
- Exam Results: проверка и зачёт экзаменов.
- My Videos: загрузка видео тренера в CDN, metadata, signed playback.
- Consultations: доступность тренера и консультации.
- Statistics: аналитика курсов и учеников.
- AI Chat: остаётся в приложении, потому что содержит UI/session-specific работу с API keys и OpenRouter.

## Env

Часто используемые переменные:

```env
DATABASE_URL=
REDIS_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3001
AUTH_COOKIE_DOMAIN=
NEXT_PUBLIC_WEB_APP_URL=http://localhost:3002
WEB_APP_URL=http://localhost:3002
REVALIDATE_SECRET_TOKEN=
AI_API_KEY_ENCRYPTION_KEY=
AI_API_KEY_ENCRYPTION_SALT=
OPENROUTER_API_KEY=
VIDEO_ACCESS_SECRET=
```

## Команды

```bash
pnpm --filter @gafus/trainer-panel dev
pnpm --filter @gafus/trainer-panel build
pnpm --filter @gafus/trainer-panel start
pnpm --filter @gafus/trainer-panel lint
pnpm --filter @gafus/trainer-panel typecheck
```

Локальный порт по скрипту: `3001`. Он конфликтует с `apps/api`, если API запущен с дефолтным `API_PORT=3001`.

## Docker

Production image: `ci-cd/docker/Dockerfile-trainer-panel-optimized`.
