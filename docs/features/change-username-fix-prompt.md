# Промпт: Исправление страницы смены логина (Web + Mobile)

**Статус:** Реализовано (план `.cursor/agentplan/change-username-fix.md`).

## Контекст

Страница смены логина (`/profile/change-username` на web, экран `profile/change-username` на mobile) работает некорректно. Нужно исправить UX, логику и синхронизацию состояния.

---

## Задачи

### 1. Проверка занятости логина до нажатия кнопки

**Проблема:** Проверка «Логин уже занят» выполняется только при submit — пользователь узнает об этом только после нажатия «Сохранить».

**Решение:**
- Добавить **live-проверку доступности** логина по мере ввода (debounced, после 3+ символов).
- Пользователь сразу видит индикатор: «Логин свободен» / «Логин занят» / «Проверка...».

**Реализация:**

**packages/core** — функция `isUsernameAvailable(username: string, currentUserId?: string): Promise<boolean>`:
- Валидация формата (3–50 символов, `[a-z0-9_]`).
- Проверка в БД: логин свободен ИЛИ совпадает с текущим пользователем.
- Экспорт из authService.

**apps/api** — эндпоинт `GET /api/v1/auth/username-available?username=xxx` (или POST с body):
- JWT обязателен (authMiddleware).
- Rate limit (например, 10 запросов/мин на IP).
- Возвращает `{ available: boolean }`.

**apps/web** — Server Action `checkUsernameAvailableAction(username: string)`:
- Вызов core, возврат `{ available: boolean }`.
- Использовать в `ChangeUsernameForm` с debounce 400–500 ms.
- Показывать под полем ввода: зелёная галочка / красный текст «Логин занят» / спиннер при проверке.
- Кнопка «Сохранить» disabled, если логин занят или идёт проверка.

**apps/mobile** — вызов API `GET /api/v1/auth/username-available?username=xxx`:
- Хук `useUsernameAvailability(username)` с debounce.
- Аналогичная индикация под полем.
- Кнопка disabled, если логин занят.

---

### 2. Кнопка под дизайн web

**Проблема:** На web форма использует голый `<button type="submit">Сохранить</button>` без стилей — не соответствует общему дизайну профиля.

**Решение:**
- Применить стили кнопок из профиля (см. `SettingsActions.module.css`, `Bio.module.css`, `PrivateProfileSection.module.css`).
- Использовать те же переменные: `#636128`, `#ece5d2`, `linear-gradient`, `border-radius: 12px`, `font-family: var(--font-impact)`, и т.д.
- Либо вынести кнопку в переиспользуемый класс (например, `.primaryButton`) и использовать в ChangeUsernameForm.
- Кнопка должна визуально совпадать с кнопками «Смена пароля», «Смена телефона» и т.п.

---

### 3. Логика обновления без перелогинивания

**Проблема:** После смены логина UI не обновляется до перезахода. После перелогина всё корректно.

**Причины (по коду):**

**Web:**
- `ChangeUsernameForm` делает `router.push("/profile")` — но страница `/profile` требует `?username=xxx` в URL. Без параметра — `notFound()`.
- Нужно: `router.push(\`/profile?username=${result.username}\`)` с **новым** логином.
- `updateSession({ username })` обновляет JWT и сессию — но редирект должен идти на URL с новым username, чтобы профиль загрузился с актуальными данными.
- Рекомендуемый порядок: `await updateSession({ username: result.username })` → `router.push(\`/profile?username=${result.username}\`)`.
- При необходимости вызвать `router.refresh()` после `updateSession`, чтобы layout (HeaderServerWrapper) перезапросил сессию с обновлённым JWT.
- Header получает `userName` из `getServerSession` в HeaderServerWrapper — после обновления cookie JWT новый username должен подхватиться.
- Добавить `revalidatePath(\`/profile?username=*\`)` или `revalidatePath("/profile")` в `changeUsernameAction` для инвалидации кэша.

**Mobile:**
- `userApi.changeUsername` возвращает `{ user: { id, username, role } }`.
- `setUser(updated)` и `queryClient.invalidateQueries({ queryKey: ["user-profile"] })` — проверить, что:
  - `useAuthStore` / `setUser` используется везде, где отображается username.
  - `queryKey: ["user-profile"]` соответствует ключу, которым загружается профиль (если используется React Query).
- Убедиться, что при возврате на экран профиля данные берутся из обновлённого store или инвалидированного query.

**Чек-лист для верификации:**
- [ ] Web: redirect на `/profile?username=${newUsername}`.
- [ ] Web: `await updateSession` перед `router.push`.
- [ ] Web: Header и прочие компоненты, показывающие username, получают его из `session.user.username` (через UserProvider → userStore).
- [ ] Mobile: `setUser` с новым username вызывается до `router.back()`.
- [ ] Mobile: при возврате на экран профиля показывается новый username (из AuthStore или из react-query после invalidate).
- [ ] API: токен JWT не содержит username — mobile использует свой auth. После смены логина API возвращает обновлённого user; mobile обновляет локальный store.

---

### 4. Прочие улучшения

- **Валидация на клиенте (web):** Использовать `usernameChangeSchema` из `@shared/lib/validation/authSchemas` — показывать ошибки Zod до submit.
- **Обработка ошибок:** Сообщения на русском, без раскрытия внутренних деталей.
- **Accessibility:** Правильные `aria-label`, `aria-invalid` для поля ввода при ошибке/занятости логина.
- **Документация:** Обновить `docs/api/v1-routes.md` — добавить описание `GET /api/v1/auth/username-available`.

---

## Файлы для изменения

| Область      | Файлы |
|-------------|-------|
| Core        | `packages/core/src/services/auth/authService.ts` — `isUsernameAvailable` |
| API         | `apps/api/src/routes/v1/auth.ts` — эндпоинт username-available |
| Web         | `apps/web/src/shared/server-actions/auth.ts` — `checkUsernameAvailableAction` |
| Web         | `apps/web/src/app/(main)/profile/change-username/ChangeUsernameForm.tsx` — live-check, кнопка, redirect |
| Web         | `apps/web/src/app/(main)/profile/change-username/` — при необходимости CSS module для кнопки |
| Mobile      | `apps/mobile/src/shared/lib/api/user.ts` — `checkUsernameAvailable` |
| Mobile      | `apps/mobile/app/(main)/profile/change-username.tsx` — live-check, обновление store |
| Документация| `docs/api/v1-routes.md` |

---

## Порядок реализации

1. Core: `isUsernameAvailable`.
2. API: эндпоинт + rate limit.
3. Web: Server Action `checkUsernameAvailableAction`.
4. Web: ChangeUsernameForm — debounced check, стили кнопки, правильный redirect, `await updateSession`.
5. Mobile: API-вызов + хук, экран смены логина.
6. Проверка: смена логина на web и mobile, убедиться, что username обновляется сразу без перелогинивания.
7. Обновить docs/api/v1-routes.md.

---

## Критерии приёмки

- Пользователь видит статус «Логин свободен» / «Логин занят» при вводе (после debounce).
- Кнопка на web оформлена в стиле профиля.
- После смены логина на web — редирект на `/profile?username=newusername`, профиль и хедер показывают новый логин без перелогинивания.
- После смены логина на mobile — экран профиля и хедер показывают новый логин без перелогинивания.
- Документация API обновлена.
