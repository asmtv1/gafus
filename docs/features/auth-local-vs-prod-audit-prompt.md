# Промпт: Аудит авторизации Local vs Production

## Доступ к production

```bash
ssh -i ~/.ssh/gafus_server_key root@185.239.51.125
```

---

## Задача

Локально (через ngrok) работают:
- авторизация и регистрация через VK ID;
- вход по логину и паролю;
- подвязка VK к существующему профилю.

На production (gafus.ru) — ничего из этого не работает.

Нужно:
1. **Сверить** локальную конфигурацию с production и выявить, чего не хватает на проде.
2. **Внести изменения**, чтобы на проде всё работало так же, как локально.

---

## Чеклист для сверки (Local vs Prod)

### 1. Переменные окружения Web-приложения

| Переменная | Локально (ngrok) | Production | Источник на проде |
|------------|------------------|------------|-------------------|
| `NEXTAUTH_URL` | `https://XXXX.ngrok-free.app` | `https://gafus.ru` | deploy-only.yml, секреты |
| `NEXTAUTH_SECRET` | dev-secret | production secret | secrets.NEXTAUTH_SECRET |
| `AUTH_COOKIE_DOMAIN` | не задаётся (undefined для ngrok) | `.gafus.ru` | hardcoded в deploy |
| `VK_CLIENT_ID` | из .env | — | secrets.VK_CLIENT_ID |
| `VK_WEB_REDIRECT_URI` | подставляется из Host: `https://${host}/api/auth/callback/vk-id` | из vars | **vars.VK_WEB_REDIRECT_URI** (проверить!) |
| `AUTH_TRUST_HOST` | — | `true` | docker-compose |

**Важно:** На prod `VK_WEB_REDIRECT_URI` берётся из `vars.VK_WEB_REDIRECT_URI`. Если в GitHub Variables не задано — будет пустая строка, VK callback не сработает.

Ожидаемое значение: `https://gafus.ru/api/auth/callback/vk-id`.

---

### 2. VK ID — настройки приложения (id.vk.com)

В разделе «Доверенные Redirect URL» приложения VK ID должны быть:

- **Локально:** `https://XXXX.ngrok-free.app/api/auth/callback/vk-id` (меняется при каждом ngrok)
- **Production:** `https://gafus.ru/api/auth/callback/vk-id` — **обязательно**

Без этого URI VK ID не примет callback с production.

---

### 3. Cookie и secure-режим

| Аспект | Локально (ngrok) | Production |
|--------|------------------|------------|
| `cookieDomain` | undefined (ngrok в NEXTAUTH_URL) | `.gafus.ru` |
| `useSecureCookies` | false (если NEXTAUTH_URL без https) | true |
| Имя cookie сессии | `next-auth.session-token` | `__Secure-next-auth.session-token` |

Middleware (`apps/web/src/middleware.ts`): `getToken` вызывается с `cookieName: "next-auth.session-token"` для явного поиска plain-cookie (ngrok). На prod с HTTPS NextAuth ставит `__Secure-next-auth.session-token`, но `getToken` с `secureCookie: true` находит её автоматически.

---

### 4. Rate limiting

- **Локально:** bypass для `NODE_ENV=development` или IP `127.0.0.1`, `::1`, `localhost`.
- **Production:** rate limit всегда действует, IP из `X-Forwarded-For` или `X-Real-IP`.

Проверить:
- nginx передаёт `X-Forwarded-For` и `X-Real-IP` в web (уже настроено в gafus.ru.conf).
- Если за Cloudflare — IP может приходить как `CF-Connecting-IP`; web использует `X-Forwarded-For` (Cloudflare его заполняет).

---

### 5. API (mobile VK auth, vk-link)

В `docker-compose.prod.yml` сервис `api` получает VK-переменные:

```yaml
api:
  environment:
    - VK_CLIENT_ID=${VK_CLIENT_ID}
    - VK_MOBILE_REDIRECT_URI=${VK_MOBILE_REDIRECT_URI:-gafus://auth/vk}
```

Для mobile VK (`POST /api/v1/auth/vk`, `POST /api/v1/auth/vk-link`) эти переменные обязательны. Web VK идёт через Next.js callback и не зависит от API.

---

### 6. Nginx и проксирование

В `ci-cd/nginx/conf.d/gafus.ru.conf` для основного домена:

- `proxy_set_header X-Forwarded-Proto $scheme;`
- `proxy_set_header X-Forwarded-Host $host;`
- `proxy_set_header Cookie $http_cookie;`

Это нужно для корректной работы callback и cookie.

---

### 7. CSP (Content Security Policy)

В nginx для gafus.ru уже есть:

- `frame-src ... https://id.vk.ru https://vk.com https://login.vk.com ...`
- `script-src` — `https://cdn.jsdelivr.net`, `https://unpkg.com` (VK ID SDK).

Ограничений для VK быть не должно.

---

## Рекомендуемые действия для production

### Шаг 1. GitHub Actions Variables / Secrets

В GitHub → Repo → Settings → Secrets and variables → Actions:

1. **Secrets:**
   - `VK_CLIENT_ID` — ID приложения VK ID.
   - `NEXTAUTH_SECRET` — секрет для NextAuth.

2. **Variables (Repository variables):**
   - `VK_WEB_REDIRECT_URI` = `https://gafus.ru/api/auth/callback/vk-id` — если не задано, деплой создаёт пустое значение.

### Шаг 2. VK ID (id.vk.com)

В настройках приложения → Redirect URI:

- Добавить: `https://gafus.ru/api/auth/callback/vk-id`

### Шаг 3. API — переменные для mobile VK — ✅ Выполнено

См. раздел 5 выше: `VK_CLIENT_ID` и `VK_MOBILE_REDIRECT_URI` добавлены в `docker-compose.prod.yml` и в `.env` при деплое.

### Шаг 4. Fallback для VK_WEB_REDIRECT_URI в деплое — ✅ Выполнено

В `deploy-only.yml`, `ci-cd.yml`, `build-single-container.yml` используется:

```yaml
echo "VK_WEB_REDIRECT_URI=${{ vars.VK_WEB_REDIRECT_URI || 'https://gafus.ru/api/auth/callback/vk-id' }}"
```

При отсутствии `vars.VK_WEB_REDIRECT_URI` подставляется fallback.

### Шаг 5. Проверка после деплоя

1. В контейнере web: `docker exec gafus-web printenv | grep -E 'VK_|NEXTAUTH_URL|AUTH_COOKIE'`
2. Войти на https://gafus.ru по логину/паролю.
3. Проверить вход через VK ID (One Tap или redirect).
4. Проверить подвязку VK в профиле (если есть кнопка «Подключить VK»).
5. При ошибках — проверить логи: `docker logs gafus-web`, Seq на monitor.gafus.ru.

---

## Итоговый список «чего может не хватать на проде»

1. ~~`VK_WEB_REDIRECT_URI`~~ — ✅ fallback в deploy-only, ci-cd, build-single-container.
2. **`VK_CLIENT_ID`** — должен быть в secrets; без него VK auth не работает.
3. **Redirect URI в VK ID** — обязательно добавить `https://gafus.ru/api/auth/callback/vk-id` и `gafus://auth/vk`.
4. ~~API VK-переменные~~ — ✅ `VK_CLIENT_ID`, `VK_MOBILE_REDIRECT_URI` добавлены в docker-compose и .env при деплое.
5. **Куки** — проверить `AUTH_COOKIE_DOMAIN=.gafus.ru`, `NEXTAUTH_URL=https://gafus.ru`, HTTPS. Middleware использует `cookieName: "next-auth.session-token"` для ngrok.
6. **Rate limit** — при частых попытках возможно срабатывание лимитов; проверить по логам и при необходимости временно ослабить (например, через env) для диагностики.
