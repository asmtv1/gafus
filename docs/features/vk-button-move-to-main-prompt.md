# Промпт: Перенос кнопки VK ID на главную страницу

**Статус:** Реализовано (см. `.cursor/agentplan/vk-button-move-to-main.md`).

## Цель

Вынести кнопку «Войти через VK ID» на главную страницу (landing) и удалить её со страниц login и register. Поведение кнопки на главной должно быть идентично текущему на login. Реализация на **web** и **mobile**.

---

## Текущее состояние (после реализации)

### Web

| Место | Компонент | Детали |
|-------|-----------|--------|
| Главная `page.tsx` | `MainAuthButtons` | Кнопки «войти», «регистрация», `VkIdOneTap`, обработка `vk_id_token` |
| Login | — | VK удалён |
| Register | — | VK удалён |

### Mobile

| Место | Файл | Детали |
|-------|------|--------|
| Welcome `app/(auth)/welcome.tsx` | `useVkLogin` | Кнопка «Войти через VK ID» |
| Login `app/(auth)/login.tsx` | — | VK удалён |

---

## Требования

1. **Добавить** кнопку VK ID на главную (web: `page.tsx`, mobile: `welcome.tsx`).
2. **Работа** — как на login: One Tap / redirect (web), PKCE + WebBrowser (mobile).
3. **Удалить** VK со страниц login и register (web и mobile).
4. **Почистить** формы и логику от VK-специфичного кода.

---

## План реализации

### 1. Web — главная страница

**Файл:** `apps/web/src/app/page.tsx`

- Главная — Server Component. Добавить Client Component-обёртку для кнопок (или отдельный `MainAuthButtons`) с:
  - `VkIdOneTap` (как в LoginForm)
  - обработкой `vk_id_token` из URL (useEffect, signIn, redirect на `/courses`)

**Обработка `vk_id_token` на главной**

- Callback VK ID редиректит на `returnPath?vk_id_token=...`. Сейчас `returnPath` — `/login` или `/register`.
- Расширить: добавить `returnPath="/"` (главная).
- Логика: cookie `vk_id_state` хранит `returnPath`. `prepareVkIdOneTap("/")` и `initiateVkIdAuth("/")` — передавать `"/"`.

**Изменения:**

1. `prepareVkIdOneTap`, `initiateVkIdAuth` в `auth.ts`: поддержать `returnPath === "/"` (safe return: `"/"`, `"/login"`, `"/register"`).
2. Callback `route.ts`: `returnPath === "/"` → редирект на `/?vk_id_token=...`.
3. Создать Client Component для главной: кнопки «войти», «регистрация» + `VkIdOneTap` + обработка `vk_id_token` из `useSearchParams()`.
4. `page.tsx` — рендерить этот Client Component вместо текущих Link-кнопок.

### 2. Web — удаление с login и register

**LoginForm.tsx**

- Убрать импорт и `<VkIdOneTap />`.
- Убрать useEffect с обработкой `vk_id_token` (это теперь на главной; callback будет редиректить на `/`).
- Удалить неиспользуемый `useSearchParams`, `usePathname`, если останутся лишними.

**RegisterForm.tsx**

- Убрать импорт и `<VkIdOneTap />`.
- Убрать обработку `vk_id_token` (signIn после redirect) — если была, аналогично перенесена на главную.

### 3. VkIdOneTap — returnPath

**Файл:** `apps/web/src/shared/components/auth/VkIdOneTap.tsx`

- Сейчас: `returnPath = pathname === "/register" ? "/register" : "/login"`.
- Изменить на: `returnPath = pathname === "/" ? "/" : pathname === "/register" ? "/register" : "/login"`.
- Тогда на главной VkIdOneTap будет вызывать `prepareVkIdOneTap("/")` и `initiateVkIdAuth("/")`.

### 4. Auth server actions

**Файл:** `apps/web/src/shared/server-actions/auth.ts`

- `prepareVkIdOneTap(returnPath)`:
  - `safeReturn = returnPath === "/" ? "/" : returnPath === "/register" ? "/register" : "/login"`.
- `initiateVkIdAuth(returnPath)` — без изменений, использует `prepareVkIdOneTap`.

### 5. Callback vk-id

**Файл:** `apps/web/src/app/api/auth/callback/vk-id/route.ts`

- Строка 54: `returnPath = parsedCookie.returnPath === "/register" ? "/register" : parsedCookie.returnPath === "/" ? "/" : "/login"`.
- Строка 144: редирект на `${returnPath}?vk_id_token=...` (уже работает, если `returnPath` корректен).

### 6. Mobile — главная (welcome)

**Файл:** `apps/mobile/app/(auth)/welcome.tsx`

- Добавить кнопку «Войти через VK ID» рядом с «Войти» и «Регистрация».
- Логика как в `login.tsx`: `handleVkLogin` (PKCE, WebBrowser.openAuthSessionAsync, `loginViaVk`).
- Вынести `handleVkLogin` в общий хук/утилиту или скопировать в `welcome.tsx`, чтобы не дублировать лишнее.

### 7. Mobile — удаление с login

**Файл:** `apps/mobile/app/(auth)/login.tsx`

- Убрать кнопку «Войти через VK ID» и блок «или».
- Убрать `handleVkLogin`, `isVkLoading`, `loginViaVk` из этого экрана.
- Удалить PKCE-функции (`generateCodeVerifier`, `generateCodeChallenge`, `generateState`) — если они больше нигде не используются. Иначе оставить (они используются в welcome).

### 8. Общие проверки

- Callback при ошибках редиректит на `/login?error=...`. После переноса VK на главную — при ошибке callback лучше редиректить на главную: `/?error=vk_id_auth_failed` и т.п. (по желанию; можно оставить `/login` для простоты).
- Документация: обновить `docs/apps/web.md`, `docs/features/vk-auth.md` — указать, что VK на главной.

---

## Чек-лист

- [ ] Web: поддержать `returnPath="/"` в `prepareVkIdOneTap`, `initiateVkIdAuth`, callback
- [ ] Web: Client Component на главной с `VkIdOneTap` и обработкой `vk_id_token`
- [ ] Web: убрать VK из LoginForm
- [ ] Web: убрать VK из RegisterForm
- [ ] Mobile: добавить кнопку VK на welcome
- [ ] Mobile: убрать кнопку VK с login
- [ ] Прогнать сборку: `pnpm run build`
- [ ] Проверить flow: главная → VK → callback → вход

---

## Связанные файлы

| Файл | Действие |
|------|----------|
| `apps/web/src/app/page.tsx` | Добавить Client Component с VK |
| `apps/web/src/app/(auth)/login/LoginForm.tsx` | Удалить VkIdOneTap, обработку vk_id_token |
| `apps/web/src/app/(auth)/register/RegisterForm.tsx` | Удалить VkIdOneTap |
| `apps/web/src/shared/components/auth/VkIdOneTap.tsx` | Поддержка returnPath="/" (если через props) |
| `apps/web/src/shared/server-actions/auth.ts` | returnPath="/" |
| `apps/web/src/app/api/auth/callback/vk-id/route.ts` | returnPath="/" |
| `apps/mobile/app/(auth)/welcome.tsx` | Добавить кнопку VK |
| `apps/mobile/app/(auth)/login.tsx` | Удалить кнопку VK |
