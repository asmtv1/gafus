# API Service Secrets

## GitHub Secrets

Для работы API сервиса нужно добавить следующие секреты в GitHub (Settings → Secrets and variables → Actions):

### JWT Secrets

```bash
JWT_SECRET=<минимум 32 символа для HS256>
JWT_REFRESH_SECRET=<минимум 32 символа для HS256>
```

**Генерация безопасных секретов:**

```bash
# Вариант 1: OpenSSL
openssl rand -base64 32

# Вариант 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Вариант 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Требования к секретам

- ✅ Минимум 32 символа (рекомендуется 64+)
- ✅ Случайная генерация (не использовать словарные слова)
- ✅ Разные значения для `JWT_SECRET` и `JWT_REFRESH_SECRET`
- ✅ Не коммитить в репозиторий
- ✅ Хранить только в GitHub Secrets

## Локальная разработка

Для локальной разработки добавьте в `.env` в корне проекта:

```bash
# JWT Configuration
JWT_SECRET=your-local-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-local-refresh-secret-min-32-chars
```

## Проверка в CI/CD

GitHub Actions автоматически подставит эти секреты в docker-compose при деплое:

```yaml
# ci-cd/docker/docker-compose.prod.yml
api:
  environment:
    - JWT_SECRET=${JWT_SECRET} # Из GitHub Secrets
    - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET} # Из GitHub Secrets
```

## Ротация секретов

При необходимости смены JWT секретов:

1. Сгенерируйте новые секреты
2. Обновите в GitHub Secrets
3. Пересоберите и разверните API сервис
4. **ВАЖНО:** Все пользователи будут разлогинены и должны войти заново

## Список всех необходимых секретов

| Secret                 | Описание              | Требуется для     |
| ---------------------- | --------------------- | ----------------- |
| `JWT_SECRET`           | Access token secret   | API service       |
| `JWT_REFRESH_SECRET`   | Refresh token secret  | API service       |
| `DATABASE_URL`         | PostgreSQL connection | Все сервисы       |
| `REDIS_URL`            | Redis connection      | API, Worker       |
| `NEXTAUTH_SECRET`      | NextAuth secret       | Web apps          |
| `TELEGRAM_BOT_TOKEN`   | Telegram bot          | Bot, Worker       |
| `VAPID_PUBLIC_KEY`     | Web Push public       | Web apps          |
| `VAPID_PRIVATE_KEY`    | Web Push private      | Worker            |
| `YC_ACCESS_KEY_ID`     | Yandex Cloud CDN      | Apps with uploads |
| `YC_SECRET_ACCESS_KEY` | Yandex Cloud CDN      | Apps with uploads |
| `VIDEO_ACCESS_SECRET`  | HLS protection        | Apps with video   |
| `YOOKASSA_SHOP_ID`     | ЮKassa shop id        | Web + API (платежи) |
| `YOOKASSA_SECRET_KEY`  | ЮKassa secret key     | Web + API (платежи) |
| `WEB_APP_URL`          | Базовый URL web для return_url | API (платежи) |
| ~~`NEXT_PUBLIC_CONTACT_*`~~ | ~~Контакты~~ | **Не используются** — страница /contacts теперь статический public/contacts.html |

## Проверка конфигурации

После деплоя проверьте:

```bash
# Health check
curl https://api.gafus.ru/health

# Ready check (проверяет БД и Redis)
curl https://api.gafus.ru/ready
```

Если API не стартует, проверьте логи:

```bash
docker logs gafus-api
```

Типичные ошибки:

- `JWT_SECRET must be at least 32 characters` - секрет слишком короткий
- `JWT_SECRET is not defined` - секрет не передан в контейнер
