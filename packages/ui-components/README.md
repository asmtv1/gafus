# @gafus/ui-components

Переиспользуемые UI-компоненты для приложений GAFUS (web, trainer-panel, admin-panel).

## Установка

Пакет используется через workspace в монорепо:

```json
{
  "dependencies": {
    "@gafus/ui-components": "workspace:*"
  }
}
```

## Экспорты

### Компоненты

- **LoginForm** — форма входа
- **CookieConsentBanner** — баннер согласия на использование cookies (GDPR-compliant)

### Cookie consent (утилиты)

- **resetCookieConsent** — сброс согласия, повторный показ баннера
- **COOKIE_CONSENT_STORAGE_KEY** — ключ localStorage `gafus:cookieConsent:v1`
- **ConsentValue** — тип `"accepted" | "declined"`

## Примеры

### CookieConsentBanner

```tsx
import { CookieConsentBanner } from "@gafus/ui-components";

<CookieConsentBanner
  cookiePolicyUrl={process.env.NEXT_PUBLIC_COOKIES_URL ?? "/cookies.html"}
/>
```

### Сброс согласия

```tsx
import { resetCookieConsent } from "@gafus/ui-components";

<button onClick={() => resetCookieConsent()}>Управление cookies</button>
```

## Документация

- [docs/packages/ui-components.md](../../docs/packages/ui-components.md) — полный API
- [docs/features/cookie-consent.md](../../docs/features/cookie-consent.md) — фича cookie consent
