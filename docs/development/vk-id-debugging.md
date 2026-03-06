# Отладка кнопки VK ID

Пошаговая инструкция: как понять, где ломается цепочка, и как протестировать.

## Логи в консоль

При **localhost** или **ngrok** клиентские логи `[VK ID]` автоматически выводятся в DevTools → Console.

Для **серверных** логов (терминал при `pnpm start:all`) добавь в `.env`:

```
VK_ID_DEBUG=true
```

Перезапусти приложения — в терминале появятся `[VK ID server]` и `[VK ID callback]`.

## Как работает цепочка

1. **Клик** → вызывается `prepareVkIdOneTap()` (Server Action)
2. **Успех** → инициализируется VK ID SDK (виджет One Tap) или fallback → redirect на `id.vk.ru`
3. **Пользователь входит во VK** → VK редиректит на `https://ваш-домен/api/auth/callback/vk-id?code=...&state=...&device_id=...`
4. **Callback** → обмен code на токен, создание сессии, redirect на `returnPath?vk_id_token=...` (returnPath: `/`, `/login` или `/register`)
5. **MainAuthButtons** (главная) → обнаруживает токен, вызывает `signIn("credentials", ...)` → вход. VK только на главной; callback редиректит на `/?vk_id_token=...`.

## Где может ломаться

| Шаг | Что проверить | Как проверить |
|-----|---------------|---------------|
| 1 | prepareVkIdOneTap возвращает ошибку | DevTools → Network: POST / (главная) — смотреть ответ |
| 1 | `VK ID не настроен` | `VK_CLIENT_ID` и `VK_WEB_REDIRECT_URI` в .env |
| 2 | One Tap не рендерится / ошибка SDK | DevTools → Console, искать CORS или ошибки @vkid/sdk |
| 3 | VK не редиректит обратно | Настройки VK ID: домен и Redirect URL должны **точно совпадать** |
| 4 | Callback возвращает error | DevTools → Network: запрос к `/api/auth/callback/vk-id` — смотреть куда редиректит (error=?) |

---

## Тестирование на production (gafus.ru)

### 1. Открой DevTools

Chrome/Firefox: F12 → вкладки **Network** и **Console**.

### 2. Очисти фильтры

В Network оставь «All» или «Fetch/XHR», убери фильтр по домену.

### 3. Перейди на https://gafus.ru (главная)

### 4. Нажми «Войти через VK ID»

### 5. Разберись по шагам

**Вариант A: Кнопка «Загрузка…» и ничего не происходит**

- В Network найди POST к `/` (главная страница, Server Action prepareVkIdOneTap).
- Клик по запросу → вкладка **Response**.
- Если видишь `success: false` и `error: "VK ID не настроен"` → не заданы `VK_CLIENT_ID` / `VK_WEB_REDIRECT_URI` на сервере.
- Если `success: false` и `error: "Слишком много запросов"` → сработал rate limit, подожди ~15 минут.

**Вариант B: Появляется виджет VK или окно VK**

- Войти во VK.
- После входа VK должен редиректить на `https://gafus.ru/api/auth/callback/vk-id?...`.
- Если вместо этого — белый экран или редирект на другой URL:
  - В [настройках VK ID](https://id.vk.com/about/business/) проверь:
    - Базовый домен: `gafus.ru`
    - Доверенный Redirect URL: `https://gafus.ru/api/auth/callback/vk-id`
  - URL должен совпадать **символ в символ** (протокол, домен, путь).

**Вариант C: Редирект на /login?error=...**

- В Network найди запрос `GET /api/auth/callback/vk-id`.
- В итоговом redirect URL смотри параметр `error`:
  - `vk_id_auth_failed` — не прошла проверка state/code или проблема с callback.
  - `vk_id_token_failed` — не удалось обменять code на токен.
  - `rate_limit` — превышен лимит запросов.

---

## Тестирование локально (ngrok)

VK ID не работает с `localhost` — нужен публичный HTTPS-домен. Используй ngrok.

### Быстрый чеклист

```
1. ngrok http 3002                    # в отдельном терминале
2. Скопировать https://XXXX.ngrok-free.app из вывода
3. В VK ID: добавить домен и Redirect URL
4. В .env: NEXTAUTH_URL, NEXT_PUBLIC_APP_URL, VK_WEB_REDIRECT_URI
5. pnpm dev:env
6. Открыть https://XXXX.ngrok-free.app (главная, не localhost!)
7. Нажать «Войти через VK ID»
```

Подробности: `docs/development/vk-id-ngrok-testing.md`.

### Важно

- На бесплатном ngrok домен меняется при каждом запуске.
- После нового `ngrok http 3002` нужно заново обновить:
  - настройки VK ID;
  - `.env` (NEXTAUTH_URL и т.п.).

---

## Проверка env на сервере

```bash
ssh -i ~/.ssh/gafus_server_key root@185.239.51.125 \
  "docker exec gafus-web printenv | grep -E 'VK_|NEXTAUTH_URL'"
```

Должны быть:
- `VK_CLIENT_ID` — число (ID приложения из VK ID)
- `VK_WEB_REDIRECT_URI=https://gafus.ru/api/auth/callback/vk-id`
- `NEXTAUTH_URL=https://gafus.ru`

---

## Быстрый тест callback

Проверка, что роут `/api/auth/callback/vk-id` доступен:

```bash
curl -sI "https://gafus.ru/api/auth/callback/vk-id?code=x&state=y&device_id=z"
```

Ожидаем редирект (302/303) на `/login?error=vk_id_auth_failed` — значит маршрут вызывается. Другое поведение (404, 500) указывает на проблему с роутингом или приложением.
