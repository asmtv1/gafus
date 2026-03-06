# Промпт: Автозаполнение «О себе» данными из VK ID

**Статус: реализовано.** Детали — в [vk-auth.md](vk-auth.md) (раздел «Автозаполнение профиля из VK»).

---

## Цель

При входе через VK ID автоматически подставлять в блок «О себе» профиля:
- **Имя и фамилия** — из VK (`first_name`, `last_name`) → поле «Имя» (`fullName`);
- **Дата рождения** — из VK (`birthday`) → поле «Дата рождения» (`birthDate`).

Реализовать на **web** и **mobile**.

---

## Контекст

### Текущее состояние

- **VK ID `user_info`** возвращает (scope `vkid.personal_info` по умолчанию): `user_id`, `first_name`, `last_name`, `avatar`, `sex`, `verified`, `birthday`.
- Проект использует `user_id`, `first_name`, `last_name`, `avatar`, `birthday`. `sex` не используется.
- **Web:** callback `GET /api/auth/callback/vk-id` → `user_info` → `findOrCreateVkUser`.
- **Mobile:** `POST /api/v1/auth/vk` → обмен code на token → `user_info` → `findOrCreateVkUser`.
- **Профиль:** `UserProfile` (Prisma) — поля `fullName`, `birthDate`, `avatarUrl`, `about`, `telegram`, `instagram`, `website`.

### Формат VK birthday

- `DD.MM.YYYY` — полная дата (использовать).
- `DD.MM` — без года (не сохранять, год отсутствует).
- Поле может отсутствовать, если скрыто в настройках приватности.

### Требования к сохранению

- **Новые пользователи:** при создании `UserProfile` сразу заполнять `fullName` и `birthDate` из VK.
- **Существующие пользователи:** обновлять только пустые поля — не перезаписывать уже заполненные данные пользователем.

---

## Задачи

### 1. Расширить VkProfile и парсинг

**packages/core** — `services/auth/vkAuth.ts`:
- Добавить в `VkProfile`: `birthday?: string`.
- Внутри `findOrCreateVkUser` вычислять:
  - `fullName` = `[first_name, last_name].filter(Boolean).join(" ").trim()` или `null`;
  - `birthDate` = `parseVkBirthday(birthday)` (см. п. 5).

### 2. Web callback

**apps/web** — `src/app/api/auth/callback/vk-id/route.ts`:
- Расширить тип ответа `user_info`: добавить `birthday?: string`.
- Собрать `vkProfile` с полями `id`, `first_name`, `last_name`, `avatar`, `birthday`.

### 3. Mobile API

**apps/api** — `src/routes/v1/auth.ts` (POST `/api/v1/auth/vk`):
- Расширить тип ответа `user_info`: добавить `birthday?: string`.
- Передать в `findOrCreateVkUser` тот же набор полей, что и на web.

### 4. findOrCreateVkUser — обновление логики

**packages/core** — `vkAuth.ts`:

**Новый пользователь:**
- При `tx.userProfile.create` передавать: `fullName`, `birthDate`, `avatarUrl`.
- `fullName` = `[first_name, last_name].filter(Boolean).join(" ").trim()` или null.
- `birthDate` = результат `parseVkBirthday(birthday)`.

**Существующий пользователь (account уже есть):**
- Получить текущий профиль: `prisma.userProfile.findUnique({ where: { userId } })`.
- Собрать объект `update`: всегда `avatarUrl`; `fullName` и `birthDate` — только если в профиле `null` и из VK есть значение.
- Вызвать `prisma.userProfile.update` с этим объектом.

### 5. Вспомогательная функция парсинга birthday

**packages/core** — утилита (например, в `utils/` или внутри vkAuth):
- `parseVkBirthday(birthday: string | undefined): Date | null`
- Регулярка или `split(".")`: ожидать 3 части (день, месяц, год).
- Валидация: год 1900–текущий, месяц 1–12, день 1–31.
- Возвращать `new Date(year, month - 1, day)` или ISO-строку для Prisma.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `packages/core/src/services/auth/vkAuth.ts` | VkProfile.birthday, parseVkBirthday, fullName/birthDate в create/upsert |
| `apps/web/src/app/api/auth/callback/vk-id/route.ts` | Тип user_info + vkProfile.birthday |
| `apps/api/src/routes/v1/auth.ts` | Тип user_info + vkProfile.birthday |

---

## Тестирование

- **Web:** войти через VK ID → проверить профиль «О себе» — имя, фамилия, дата рождения заполнены.
- **Mobile:** то же через VK ID на welcome → профиль.
- **Существующий пользователь:** если `fullName`/`birthDate` уже заданы — не перезаписывать.
- **VK без birthday:** профиль создаётся, birthDate = null.
- **VK birthday DD.MM:** birthDate не сохраняется.

---

## Ссылки

- [VK ID user_info](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/api-description) — поля `birthday`, `first_name`, `last_name`.
- [VK auth](docs/features/vk-auth.md) — flow web и mobile.
