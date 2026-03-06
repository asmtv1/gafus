# Промпт: Проверка паритетности Web и Mobile относительно VK ID

**Цель:** Провести аудит и убедиться, что Web и Mobile имеют равнозначный функционал по всем сценариям, связанным с VK ID (вход, регистрация, привязка, профиль).

---

## Контекст

- **Web:** Next.js, NextAuth, Server Actions, callback `GET /api/auth/callback/vk-id`
- **Mobile:** React Native (Expo), JWT, API `POST /api/v1/auth/vk`, `POST /api/v1/auth/vk-link`
- **Общая логика:** `packages/core` — `findOrCreateVkUser`, `linkVkToUser`, автозаполнение профиля из VK

Документация: [vk-auth.md](vk-auth.md), [vk-account-linking-prompt.md](vk-account-linking-prompt.md), [profile-vk-buttons-prompt.md](profile-vk-buttons-prompt.md).

---

## Чек-лист паритетности

### 1. Вход через VK ID

| Аспект | Web | Mobile | Паритет? |
|--------|-----|--------|----------|
| Где доступен вход через VK | Главная `/` (MainAuthButtons, VkIdOneTap) | Welcome `/welcome` (useVkLogin) | Разные экраны входа — принять или выровнять? |
| На login/register | Нет VK (удалён) | Нет VK на login | ✓ |
| One Tap виджет | Есть (lazy init, fallback на redirect) | Нет (только redirect через WebBrowser) | Web богаче — допустимо |
| Redirect flow | initiateVkIdAuth → id.vk.ru → callback | WebBrowser.openAuthSessionAsync | ✓ |
| PKCE | code_verifier, code_challenge (S256) | expo-crypto, то же | ✓ |
| State проверка | timingSafeEqual в callback | useVkLogin проверяет state | ✓ |
| После успеха | signIn credentials → /courses | loginViaVk → JWT, навигация AuthProvider | ✓ |

**Проверить:**
- [x] Web: callback передаёт в `findOrCreateVkUser` те же поля, что и API
- [x] Mobile: `POST /api/v1/auth/vk` через `fetchVkProfile` (users.get lang=0) — `birthday`, `first_name`, `last_name`, `avatar` на русском
- [ ] Тексты: Web «Войти через VK ID» vs Mobile «Войти через VK ID» — единообразие

---

### 2. Регистрация через VK ID

| Аспект | Web | Mobile | Паритет? |
|--------|-----|--------|----------|
| Сценарий | VK ID создаёт пользователя при первом входе | То же | ✓ |
| Автозаполнение | fullName, birthDate, avatarUrl из VK | То же (findOrCreateVkUser) | ✓ |
| Пустые vs заполненные поля | Не перезаписывать уже заполненные | То же | ✓ |
| parseVkBirthday | DD.MM.YYYY → сохранить; DD.MM → не сохранять | То же (core) | ✓ |

**Проверить:**
- [ ] Обе платформы передают `birthday` в vkProfile
- [ ] Новый пользователь: UserProfile создаётся с fullName, birthDate, avatarUrl

---

### 3. needsPhone (VK без телефона)

| Аспект | Web | Mobile | Паритет? |
|--------|-----|--------|----------|
| После входа needsPhone: true | Redirect на /profile/change-phone | Redirect на /vk-set-phone | Разные маршруты |
| Форма ввода телефона | SetVkPhoneForm (profile) | /vk-set-phone (vk-set-phone.tsx, layout vk-set-phone) | ✓ |
| API | — (Server Action?) | POST /api/v1/auth/vk-phone-set | Mobile через API |
| Rate limit vk-phone-set | — | 10/15 мин (общий authRateLimiter) | ✓ |

**Проверить:**
- [ ] Web: как именно обрабатывается needsPhone — через callback redirect или отдельная страница?
- [ ] Есть ли на Web аналог POST /api/v1/auth/vk-phone-set или используется общая смена телефона?
- [x] Mobile: экран vk-set-phone.tsx создан, layout vk-set-phone ✓

---

### 4. Подключение VK к существующему аккаунту (Account Linking)

| Аспект | Web | Mobile | Паритет? |
|--------|-----|--------|----------|
| Где кнопка | Профиль → SettingsActions | Профиль → profile.tsx | ✓ |
| Требование | Авторизован (сессия) | Авторизован (JWT) | ✓ |
| Initiate | initiateVkIdLink() — cookie mode: "link" | useVkLink — state с префиксом `link_` | ✓ |
| Завершение | callback mode=link → linkVkToUser | POST /api/v1/auth/vk-link | ✓ |
| hasVkLinked | getUserWithTrainings, profile page | GET /api/v1/user/profile | ✓ |
| Ошибки | /profile?error=... | Alert/snackbar | Разный UX — принять |
| Успех | /profile?linked=vk | invalidateQueries + Alert «VK успешно подключён» | ✓ |

**Проверить:**
- [ ] Web callback при mode=link корректно вызывает linkVkToUser
- [ ] API vk-link: state с префиксом `link_` — валидация не режет префикс?
- [ ] hasVkLinked возвращается в GET /api/v1/user/profile и в web profile data

---

### 5. Скрытие кнопок профиля для VK-пользователей

| Кнопка | Web | Mobile | Паритет? |
|--------|-----|--------|----------|
| Установить пароль | session?.user?.passwordSetAt == null → /profile/set-password | !hasAppPassword → кнопка «Установить пароль» → /profile/set-password | ✓ |
| Сменить пароль | session?.user?.passwordSetAt != null → /profile/change-password | hasAppPassword === true → /reset-password | ✓ |
| Забыли пароль | Только при passwordSetAt != null (форма логина) | Нет (welcome не имеет формы) | OK |
| Сменить телефон | Всегда | Всегда | ✓ |
| Подключить VK | !hasVkLinked | !hasVkLinked | ✓ |
| Управление cookies | Всегда | Нет | Web-specific — OK |

**Проверить:**
- [x] Mobile: кнопка «Установить пароль» при `!hasAppPassword` → экран /profile/set-password, API `POST /api/v1/auth/set-password` ✓
- [x] Web: /profile/set-password вызывает Server Action или API set-password
- [ ] Соответствие passwordSetAt (web) и hasAppPassword (mobile) — одна логика

---

### 6. API эндпоинты (Mobile + общие)

| Эндпоинт | Назначение | Web-аналог |
|----------|------------|------------|
| POST /api/v1/auth/vk | Обмен code на токены, findOrCreateVkUser | callback /api/auth/callback/vk-id |
| POST /api/v1/auth/vk-link | linkVkToUser (JWT) | initiateVkIdLink + callback mode=link |
| POST /api/v1/auth/vk-phone-set | Установка телефона VK-пользователя | ? |
| POST /api/v1/auth/set-password | Установка пароля (VK-only) | Server Action setPassword |
| POST /api/v1/auth/change-password | Смена пароля | Server Action |
| GET /api/v1/user/profile | hasVkLinked, hasAppPassword | getUserWithTrainings, session |

**Проверить:**
- [ ] Все эндпоинты документированы в docs/api/v1-routes.md
- [ ] Валидация body (Zod) одинакова по строгости

---

### 7. Rate Limits

| Ключ | Лимит | Web | Mobile |
|------|-------|-----|--------|
| initiate-vk-id | 10/15 мин | initiateVkIdAuth, prepareVkIdOneTap | — |
| vk-id-link | 10/15 мин | initiateVkIdLink | vk-link через API |
| vk-id-callback | 5/15 мин | callback route | — |
| vk-phone-set | 10/15 мин | — | API (общий authRateLimiter) |
| set-password | 10/15 мин | Server Action | API (общий authRateLimiter) |
| change-password | 10/15 мин | Server Action | API |

**Проверить:**
- [x] API rate limit для vk-link совпадает с web (10/15 мин)
- [ ] Bypass для localhost описан и работает

---

### 8. Env / Конфиг

| Переменная | Web | Mobile |
|------------|-----|--------|
| VK_CLIENT_ID | Да | app.config.js extra.vkClientId |
| VK_WEB_REDIRECT_URI | https://gafus.ru/api/auth/callback/vk-id | — |
| VK_MOBILE_REDIRECT_URI | — | gafus://auth/vk |

**Проверить:**
- [ ] Redirect URI в VK ID приложении: оба добавлены
- [ ] Mobile fallback: `Linking.createURL("auth/vk")` если нет extra

---

### 9. Обработка ошибок

| Сценарий | Web | Mobile |
|----------|-----|--------|
| VK уже привязан к другому User | linkVkToUser error → /profile?error=... | API возвращает error, Alert |
| VK уже подключён к этому User | То же | То же |
| Ошибка сети при link | setLinkError | onError Alert |
| State mismatch | redirect error | onError «Ошибка привязки VK: некорректный ответ» |
| Rate limit | Fallback-кнопка «Войти через VK ID» (redirect) | Snackbar/Alert |

**Проверить:**
- [ ] Сообщения пользователю на русском на обеих платформах
- [ ] Не показывать внутренние детали (stack, код ошибки)

---

## Задачи для агента

1. **Проход по чек-листу** — для каждой строки проверить код и отметить ✓ или ✗.
2. **Выявить расхождения** — составить список отличий Web vs Mobile с приоритетом (блокирующие / желательные / косметические).
3. **Исправить блокирующие** — ✓ «Установить пароль» на mobile реализован (п. 5 чек-листа).
4. **Обновить документацию** — vk-auth.md, v1-routes.md, mobile-rn.md при изменениях.

---

## Ожидаемый результат

- Таблица паритетности с галочками.
- Список расхождений с рекомендациями.
- Коммит с исправлениями (если потребуются).
