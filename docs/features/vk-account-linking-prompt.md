# Промпт: Подключение VK к существующему аккаунту

**Статус:** Реализовано (06.03.2026). План: `.cursor/agentplan/vk-account-linking.md`.

---

## Цель

Пользователи, зарегистрировавшиеся **без** VK (телефон/пароль), должны иметь возможность:

1. **Подключить VK** к своему профилю в настройках.
2. После подключения **входить любым способом**: через VK ID или через логин/пароль.

**Реализовать на Web и Mobile** — обе платформы обязательны.

---

## Контекст

### Текущее состояние

- **VK-пользователи:** создаются через `findOrCreateVkUser` при первом входе; запись в `Account` (provider: `vk`, providerAccountId).
- **Обычные пользователи:** `Account` с provider `vk` отсутствует.
- **User.accounts** — связь один-ко-многим: у пользователя может быть несколько Account (credentials + vk и т.д.).
- **Web:** `initiateVkIdAuth` → cookie `vk_id_state` { state, codeVerifier, returnPath } → redirect на id.vk.ru → callback `/api/auth/callback/vk-id` → `findOrCreateVkUser` → signIn.
- **Mobile:** `POST /api/v1/auth/vk` с code → `findOrCreateVkUser` → JWT.

### Сценарий «подключить VK»

Пользователь **уже авторизован** (web: сессия, mobile: JWT). Нажимает «Подключить VK» в профиле → проходит VK OAuth → создаётся `Account` с `userId` текущего пользователя (не создаётся новый User).

---

## Задачи

### 1. packages/core — linkVkToUser

**packages/core** — `services/auth/vkAuth.ts` (или новый файл `linkVkAccount.ts`):

- Функция `linkVkToUser(userId: string, vkProfile: VkProfile): Promise<{ success: true } | { success: false; error: string }>`:
  - Проверить: `Account` с `provider=vk`, `providerAccountId=vkProfile.id` **уже существует** — если да и `userId` другой → `{ success: false, error: "Этот аккаунт VK уже привязан к другому пользователю" }`.
  - Если `Account` для этого User уже есть (provider=vk) → `{ success: false, error: "VK уже подключён" }`.
  - Иначе: `prisma.account.create({ data: { userId, type: "oauth", provider: "vk", providerAccountId: vkProfile.id } })` → `{ success: true }`.
  - При необходимости обновить `UserProfile` (avatar, fullName, birthDate) по логике из vk-profile-autofill — только пустые поля.
- Экспорт из `@gafus/core/services/auth`.

### 2. Web — Server Action и callback

**initiateVkIdLink** — аналог `initiateVkIdAuth`, но:
- Требует активной сессии (getServerSession). Без сессии → ошибка.
- Cookie `vk_id_state`: `{ state, codeVerifier, mode: "link", returnPath: "/profile" }`.
- Rate limit: тот же `initiate-vk-id` или отдельный `vk-id-link` (10/15 мин).

**Callback** `GET /api/auth/callback/vk-id`:
- Парсить cookie. Если `mode === "link"`:
  - `getServerSession()` — без сессии → redirect `/login?error=session_required`.
  - Обмен code на token, `user_info` (user_id, first_name, last_name, avatar, birthday).
  - `linkVkToUser(session.user.id, vkProfile)`.
  - При успехе → redirect `/profile?linked=vk`; при ошибке → `/profile?error=vk_link_failed` (или с текстом).
- Если `mode !== "link"` — текущая логика (findOrCreateVkUser, signIn).

### 3. Mobile — POST /api/v1/auth/vk-link

**apps/api** — новый эндпоинт `POST /api/v1/auth/vk-link`:
- **Auth:** JWT (authMiddleware) — обязателен.
- **Body:** `{ code, code_verifier, device_id, state }` — тот же schema, что и для `POST /api/v1/auth/vk`.
- Обмен code на token → `user_info` → `linkVkToUser(c.get("user").id, vkProfile)`.
- Ответ: `{ success: true }` или `{ success: false, error: string }`.
- Rate limit: `vk-id-link` 5/15 мин.

### 4. UI — кнопка «Подключить VK»

**Web** — `SettingsActions.tsx` (или секция «Безопасность и вход»):
- Добавить `hasVkLinked` в данные, доступные на странице профиля. Варианты:
  - Расширить `getServerSession` / JWT — включить `hasVkLinked`.
  - Или: Server Component профиля вызывает `prisma.account.findFirst({ where: { userId, provider: "vk" } })` — проще, т.к. профиль уже server-rendered.
- Если `!hasVkLinked`:
  - Кнопка «Подключить VK» → Server Action `initiateVkIdLink()` → `window.location.href = result.url`.
- Если `hasVkLinked`:
  - Текст «VK подключён» (или иконка + статус). Опционально: кнопка «Отключить VK» (см. п. 6).

**Mobile** — `profile.tsx`:
- В `GET /api/v1/user/profile` добавить `hasVkLinked: boolean`.
- **packages/core** — `getUserProfileForApi`: включить в запрос `accounts: { where: { provider: "vk" }, select: { id: true } }`, вернуть `hasVkLinked: accounts.some(a => a.provider === "vk")` или проще: `accounts: { select: { provider: true } }` и проверить на клиенте.
- Если `!hasVkLinked`:
  - Кнопка «Подключить VK» → `useVkLink()` (по аналогии с `useVkLogin`): PKCE, WebBrowser.openAuthSessionAsync, callback URL с code → `POST /api/v1/auth/vk-link` с JWT + code/code_verifier/device_id/state.
  - Redirect URI: тот же `gafus://auth/vk` — VK возвращает code в URL. Нужно отличить flow: при «link» mobile открывает `gafus://auth/vk?code=...&state=...` — приложение обрабатывает, видит что это link (по state или флагу в AsyncStorage), отправляет на vk-link, а не на vk.
- Если `hasVkLinked`:
  - «VK подключён».

**Отличие mobile link от login:** при link пользователь уже залогинен. Открывается WebBrowser, после OAuth URL `gafus://auth/vk?code=...`. Приложение ловит deep link. В useVkLogin при неавторизованном пользователе идёт вызов `POST /api/v1/auth/vk`. При link — `POST /api/v1/auth/vk-link` с тем же code. State можно использовать: при link в state зашить `link_` + random, при callback проверять префикс.

### 5. hasVkLinked в API

**packages/core** — `getUserProfileForApi`:
- В select добавить `accounts: { where: { provider: "vk" }, select: { id: true } }` (или `select: { provider: true }` без where).
- Вернуть `hasVkLinked: (user.accounts?.length ?? 0) > 0`.
- Тип `UserProfileForApi`: добавить `hasVkLinked: boolean`.

### 6. Отключить VK (опционально)

Если реализовать «Отключить VK»:
- Разрешать отключение только если `hasAppPassword === true` (иначе пользователь заблокирует себе вход).
- Эндпоинт `DELETE /api/v1/auth/vk-unlink` (JWT) — удаляет `Account` с provider=vk для текущего user.
- Web: Server Action `unlinkVkAction` → вызов API или прямой prisma.

---

## Файлы для изменения (Web + Mobile)

| Файл | Изменения |
|------|-----------|
| `packages/core/src/services/auth/` | `linkVkToUser`, экспорт |
| `packages/core/src/services/user/profileService.ts` | `hasVkLinked` в getUserProfileForApi |
| **Web:** `apps/web/src/shared/server-actions/auth.ts` | `initiateVkIdLink` |
| **Web:** `apps/web/src/app/api/auth/callback/vk-id/route.ts` | Обработка mode=link |
| **Web:** SettingsActions или profile | Кнопка «Подключить VK», `hasVkLinked` |
| **API (Mobile):** `apps/api/src/routes/v1/auth.ts` | `POST /vk-link` |
| **Mobile:** `profile.tsx`, хук `useVkLink` | Кнопка «Подключить VK», `hasVkLinked` из profile |

---

## Безопасность

- **Link:** только для авторизованного пользователя (session/JWT).
- **Конфликт:** VK уже привязан к другому User → отказ, не перепривязка.
- **Rate limit** на vk-link.
- **State** при link flow — проверять, как при логине (CSRF).

---

## Тестирование

Проверить на **Web и Mobile**:

- Web: войти по логину → Профиль → «Подключить VK» → OAuth → возврат на /profile?linked=vk → выход → войти через VK — успех.
- Mobile: войти по логину → Профиль → «Подключить VK» → OAuth → возврат в приложение → выход → войти через VK — успех.
- Попытка подключить VK, уже привязанный к другому аккаунту — ошибка.
- Повторное «Подключить VK» при уже подключённом — ошибка «VK уже подключён».

---

## Ссылки

- [vk-auth.md](vk-auth.md) — текущий VK flow.
- [vk-profile-autofill-prompt.md](vk-profile-autofill-prompt.md) — автозаполнение профиля из VK.
