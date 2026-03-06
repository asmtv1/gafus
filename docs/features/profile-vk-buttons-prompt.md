# Скрытие нерелевантных кнопок профиля для VK ID пользователей

**Статус:** Реализовано (март 2026).

## Контекст

При входе через VK ID в профиле часть кнопок нерелевантна для пользователей без прикладного пароля.

**Признак «нет прикладного пароля»:** `passwordSetAt === null` (web — из сессии) или `hasAppPassword === false` (mobile — из `GET /api/v1/user/profile`).

## Реализованное поведение

| Кнопка              | Условие показа                         |
|--------------------|----------------------------------------|
| Управление cookies | Всегда                                 |
| Установить пароль  | Web: при `passwordSetAt == null`        |
| Сменить пароль     | Web: при `passwordSetAt != null`; Mobile: при `hasAppPassword === true` |
| Забыли пароль      | Web: при `session?.user?.passwordSetAt != null` |
| Сменить телефон    | При `needsPhone` (SetVkPhoneForm)       |
| Сменить логин      | Всегда                                 |

## Ключевые файлы

- **packages/core** — `profileService.ts`: `UserProfileForApi.hasAppPassword`, `getUserProfileForApi` (деструктуризация `passwordSetAt` для исключения даты из ответа)
- **apps/web** — `SettingsActions.tsx`: «Забыли пароль» только при `session?.user?.passwordSetAt != null`
- **apps/mobile** — `profile.tsx`: «Сменить пароль» только при `profileData?.data?.hasAppPassword ?? user?.hasAppPassword`
- **apps/mobile** — `auth.ts`: тип `User` с `hasAppPassword?: boolean`
- **docs/api/v1-routes.md** — схема ответа `GET /api/v1/user/profile` с `hasAppPassword`
