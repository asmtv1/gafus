# Cookie Consent Banner — согласие на использование cookies

## Обзор

В GAFUS используется переиспользуемый компонент **CookieConsentBanner** для уведомления пользователей об использовании cookies. Баннер соответствует требованиям GDPR: равный вес кнопок «Принять» и «Отклонить», явное согласие до использования аналитики, возможность отзыва в любой момент.

## Где используется

- **apps/web** — в `ClientLayout` (основной layout)
- **apps/trainer-panel** — в корневом `layout.tsx`
- **apps/admin-panel** — в корневом `layout.tsx`

## Формат баннера

- **Фиксированная плашка** внизу экрана (`position: fixed; bottom: 0`)
- Кнопки «Принять» и «Отклонить» — равный визуальный вес (оба крупные, доступные)
- Ссылка «Подробнее» на страницу политики cookies
- Уважает `prefers-reduced-motion` (без анимации при включённой настройке)

## Хранение: localStorage (ключ `gafus:cookieConsent:v1`)

### Почему localStorage, а не cookies?

| Критерий | localStorage | Cookies |
|----------|--------------|---------|
| **GDPR** | Не отправляется на сервер автоматически — меньше риска утечки | Отправляются с каждым запросом, требуют дополнительной обработки на бэкенде |
| **Простота** | Только клиентская логика | Нужна синхронизация сервер ↔ клиент |
| **Персистентность** | Сохраняется до явного удаления | Может иметь срок истечения, сложнее управлять |
| **Независимость** | Не влияет на размер заголовков запросов | Увеличивает объём HTTP-заголовков |

Решение: **localStorage** — достаточная персистентность для хранения согласия, минимальная сложность, отсутствие серверной логики.

### Значения

- `accepted` — пользователь принял cookies
- `declined` — пользователь отклонил
- `null` (отсутствует) — согласие ещё не получено, баннер показывается

## Кнопка «Управление cookies» (отзыв согласия)

В каждом приложении предусмотрена возможность **сбросить** согласие и снова увидеть баннер:

| Приложение | Расположение |
|------------|--------------|
| **apps/web** | Профиль → настройки → «Управление cookies» (`SettingsActions`) |
| **apps/trainer-panel** | Сайдбар → «Управление cookies» |
| **apps/admin-panel** | Сайдбар и мобильное меню → `CookieSettingsButton` |

При нажатии вызывается `resetCookieConsent()` — удаляется запись из localStorage и отправляется custom event `gafus:cookieConsentReset`. Баннер показывает себя снова без перезагрузки страницы.

## Переменные окружения

- `NEXT_PUBLIC_COOKIES_URL` — URL страницы политики cookies (по умолчанию `/cookies.html`)

## Примеры использования

### В layout приложения

```tsx
import { CookieConsentBanner } from "@gafus/ui-components";

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <CookieConsentBanner
          cookiePolicyUrl={
            process.env.NEXT_PUBLIC_COOKIES_URL ?? "/cookies.html"
          }
        />
      </body>
    </html>
  );
}
```

### Кнопка сброса в профиле/панели

```tsx
import { resetCookieConsent } from "@gafus/ui-components";

<button onClick={() => resetCookieConsent()} type="button">
  Управление cookies
</button>
```

### Проверка текущего статуса согласия

```tsx
import { COOKIE_CONSENT_STORAGE_KEY } from "@gafus/ui-components";

const raw =
  typeof window !== "undefined"
    ? localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    : null;
const consent = raw === "accepted" || raw === "declined" ? raw : null;
if (consent === "accepted") {
  // Запуск аналитики и т.п.
}
```

## Связанные документы

- [Consent at Registration](consent-registration.md) — сохранение согласий при регистрации (ConsentLog в БД)
- [@gafus/ui-components](../packages/ui-components.md) — API компонента и утилит
- `.cursor/rules/security.mdc` — архитектурное решение localStorage vs cookie
