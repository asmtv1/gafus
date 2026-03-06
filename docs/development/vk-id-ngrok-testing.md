# Тестирование VK ID через ngrok

Инструкция для локальной разработки и тестирования авторизации VK ID с использованием ngrok-туннеля.

## Зачем нужен ngrok

VK ID SDK и CORS работают только с доменами, зарегистрированными в настройках приложения. `web.gafus.localhost` и `localhost` часто не принимаются. ngrok даёт публичный HTTPS-домен, который можно добавить в VK ID.

---

## Шаг 1: Установка ngrok

```bash
# macOS (Homebrew)
brew install ngrok

# Или скачать с https://ngrok.com/download
```

Зарегистрируйся на [ngrok.com](https://ngrok.com) и получи authtoken в [Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).

```bash
ngrok config add-authtoken <YOUR_AUTH_TOKEN>
```

---

## Шаг 2: Запуск туннеля

Web-приложение слушает порт **3002**. Запусти туннель:

```bash
ngrok http 3002
```

В консоли появится строка вида:
```
Forwarding  https://a1b2c3d4e5f6.ngrok-free.app -> http://localhost:3002
```

Скопируй свой `https://XXXX.ngrok-free.app` — это твой временный публичный URL.

> Для фиксированного домена (например, `gafus-dev.ngrok.app`) нужна платная подписка ngrok. Бесплатный план выдаёт новый URL при каждом запуске.

---

## Шаг 3: Настройки VK ID

В [настройках приложения VK ID](https://vk.com/apps?act=manage) → «Данные для регистрации» добавь:

**Базовый домен:**
- `XXXX.ngrok-free.app` (подставь свой домен из ngrok)

**Доверенный Redirect URL:**
- `https://XXXX.ngrok-free.app/api/auth/callback/vk-id`

---

## Шаг 4: Переменные окружения

Создай или обнови `.env` в корне проекта:

```env
# Для тестирования VK ID через ngrok
NEXTAUTH_URL=https://XXXX.ngrok-free.app
NEXT_PUBLIC_APP_URL=https://XXXX.ngrok-free.app
```

Либо вынеси в `.env.ngrok` и подключай только при тестах:

```bash
cp .env .env.backup
cp .env.ngrok .env
```

---

## Шаг 5: Запуск приложения

1. Запусти dev-сервер (web на порту 3002):

```bash
pnpm dev:env
```

или только web:

```bash
pnpm --filter @gafus/web dev
```

2. Убедись, что ngrok туннель активен (`ngrok http 3002` в отдельном терминале).

3. Открывай приложение **через ngrok URL**, а не через `web.gafus.localhost`:

```
https://XXXX.ngrok-free.app
```

---

## Шаг 6: Проверка

1. Перейди на `https://XXXX.ngrok-free.app` (главная)
2. Нажми «Войти через VK»
3. Должен открыться VK ID без CORS-ошибок
4. После авторизации — redirect на callback и вход в приложение

---

## Смена ngrok URL (бесплатный план)

При каждом новом `ngrok http 3002` домен меняется. Нужно:

1. Обновить `NEXTAUTH_URL` и `NEXT_PUBLIC_APP_URL` в `.env`
2. Добавить новый домен в настройки VK ID
3. Перезапустить dev-сервер (если env менялся)

---

## Дополнительно: скрипт для копирования ngrok URL

Создай скрипт `scripts/ngrok-vk-dev.sh`:

```bash
#!/bin/bash
# Запуск ngrok для тестирования VK ID
# Использование: ./scripts/ngrok-vk-dev.sh

echo "Запуск ngrok на порт 3002..."
echo "После старта добавь URL из вывода в:"
echo "  1. .env -> NEXTAUTH_URL, NEXT_PUBLIC_APP_URL"
echo "  2. VK ID настройки -> Базовый домен, Redirect URL"
echo ""
ngrok http 3002
```

---

## Checklist перед тестом

- [ ] ngrok запущен (`ngrok http 3002`)
- [ ] Web приложение работает на 3002
- [ ] `NEXTAUTH_URL` и `NEXT_PUBLIC_APP_URL` указывают на ngrok URL
- [ ] Домен ngrok добавлен в VK ID (базовый домен и redirect URL)
- [ ] Открываешь именно `https://XXXX.ngrok-free.app`, не localhost
