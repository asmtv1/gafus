# Необратимое удаление аккаунта (Web + Mobile)

Соответствие Apple Guideline 5.1.1(v): пользователь может инициировать удаление в приложении и на сайте.

## Поведение

- **Доступно** только ролям `USER` и `PREMIUM`. Тренеры/админы с созданным контентом получают понятную ошибку и путь в поддержку.
- **Пароль обязателен:** пункт «Удалить аккаунт» в настройках показывается только при `passwordSetAt != null`. Иначе — сначала установка пароля (`/profile/set-password` на web, экран set-password в mobile).
- **Подтверждение:** ввод текущего пароля и финальная кнопка «Удалить навсегда».
- **Сервер:** `@gafus/core` — `deleteUserAccount`: проверки роли/пароля/счётчиков авторского контента; в транзакции `refreshToken.updateMany` (отзыв) затем `user.delete` (каскады Prisma).

## Web (`apps/web`)

- Маршрут: `/profile/delete-account` — предупреждение, список последствий, форма.
- Server Action: `shared/lib/user/deleteUserAccount.ts` → после успеха `revalidatePath`, очистка cookie NextAuth, `redirect("/login")`.
- Вход из профиля: `SettingsActions` — ссылка «Удалить аккаунт» (красная кнопка).

**Переменная для App Review / ссылок:** `NEXT_PUBLIC_ACCOUNT_DELETION_URL` (см. `apps/web/.env.example`).

## Mobile (`apps/mobile`)

- Экран: `(main)/profile/delete-account` — тот же смысл копирайта и потока.
- API: `userApi.deleteAccount(password)` → `POST /api/v1/user/account/delete`.
- После успеха: `useAuthStore.getState().logout()` (локальные токены и сторы).
- Кнопка в табе профиля над «Выйти из аккаунта» при `passwordSetAt != null`.

**Переменная:** `EXPO_PUBLIC_ACCOUNT_DELETION_URL` (см. `apps/mobile/.env.example`).

## REST API (`apps/api`)

- `POST /api/v1/user/account/delete` — JWT обязателен, body: `{ "password": "string" }`.
- Ответы: `200` при успехе; коды ошибок маппятся на 400/401/403/409/500 по полю `code` и текстам из core.

## Связанные файлы

- `packages/core/src/services/user/deleteUserAccount.ts`, тесты `deleteUserAccount.test.ts`
- `apps/api/src/routes/v1/user.ts`
- План: `.cursor/agentplan/irreversible-account-deletion-web-mobile.md`
