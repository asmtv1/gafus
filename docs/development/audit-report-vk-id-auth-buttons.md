# Отчёт: react-best-practices, security-review, code-simplifier

**Дата:** 5 марта 2026  
**Объём:** VK ID auth buttons fix (rateLimit.ts, VkIdOneTap.tsx, auth server actions).

---

## 1. React best practices

### 1.1 Сделано

| Правило | Где | Реализация |
|--------|-----|------------|
| **Unmount guard** | VkIdOneTap.tsx | `mountedRef` + `useEffect` cleanup — проверка перед `setState` после async (`prepareVkIdOneTap`, `import("@vkid/sdk")`, `initiateVkIdAuth`). Исключает предупреждение «state update on unmounted component». |
| **useCallback** | handleInitClick, handleFallbackClick | Оба обработчика обёрнуты в `useCallback` — стабильные ссылки, меньше лишних рендеров при передаче в дочерние компоненты (если появятся). |
| **Lazy init** | prepareVkIdOneTap | Вызов только по клику, не при монтировании — снижает расход rate limit. |

### 1.2 Рекомендации (низкий приоритет)

- При необходимости добавить `AbortController` в `prepareVkIdOneTap` / `initiateVkIdAuth` для отмены запроса при unmount — сейчас при unmount просто не обновляется state.

---

## 2. Security review

### 2.1 Rate limit bypass (isDevOrLocalhost)

| Проверка | Результат |
|----------|-----------|
| **NODE_ENV === "development"** | Bypass только в dev. В production NODE_ENV задаётся при старте процесса, не из запроса — безопасно. |
| **Пустой IP** | Пустая строка **не** в списке localhost — не bypass в production. |
| **Риск конфигурации** | Если в production случайно NODE_ENV=development — лимиты отключаются. Рекомендация: в CI/deploy проверять NODE_ENV. |

### 2.2 Open redirect

| Проверка | Результат |
|----------|-----------|
| **window.location.href = result.url** | URL формируется на сервере из `VK_CLIENT_ID`, `VK_WEB_REDIRECT_URI` — всегда `https://id.vk.ru/authorize?...`. Пользовательский ввод не участвует. Риска redirect-атаки нет. |
| **VK ID callback** | `redirect_uri` из env. `state` проверяется через `crypto.timingSafeEqual`. Использование PKCE — соответствует best practices. |

### 2.3 XSS

| Проверка | Результат |
|----------|-----------|
| **result.error** | Сообщения фиксированные: «Слишком много запросов...», «Не удалось инициализировать...», «VK ID не настроен» и т.п. Нет пользовательского ввода. |
| **container.innerHTML = ""** | Только очистка, не установка из внешних данных. |

### 2.4 Cookie (vk_id_state)

- `httpOnly: true` — недоступна из JS
- `secure: true` в production
- `sameSite: "lax"` — защита от CSRF
- `maxAge: 600` — 10 минут

---

## 3. Code-simplifier

### 3.1 Состояние

| Аспект | Оценка |
|--------|--------|
| **ViewState** | `idle | loading | success | error` — простая и понятная машина состояний. |
| **Дублирование** | Нет лишнего дублирования. |
| **Разделение ответственности** | Handlers разделены (`handleInitClick` / `handleFallbackClick`). |
| **Константы** | Ошибки захардкожены — допустимо для auth-компонента. |

### 3.2 Итог

Дополнительные упрощения не требуются.

---

## 4. Сводка действий

| Приоритет | Действие | Статус |
|-----------|----------|--------|
| **Высокий** | Unmount guard + useCallback в VkIdOneTap | ✅ Сделано |
| **Средний** | Security review (rate limit, redirect, XSS, cookies) | ✅ Проверено |
| **Низкий** | CI check NODE_ENV в production deploy | — |

---

*Отчёт: react-best-practices, security-review (OWASP/XSS, auth), code-simplifier для VK ID auth buttons fix.*
