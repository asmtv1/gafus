# @gafus/ui-components — UI компоненты

## 📋 Обзор

Пакет `@gafus/ui-components` содержит переиспользуемые UI компоненты для всех приложений в экосистеме GAFUS.

## 🎯 Основные функции

- **Переиспользуемые компоненты** для всех приложений
- **Единообразный дизайн** во всей экосистеме
- **Типобезопасность** с TypeScript
- **Доступность** (a11y) компонентов
- **Cookie consent** — GDPR-совместимый баннер согласия

## 📦 Экспорты

| Экспорт | Описание |
|---------|----------|
| `LoginForm` | Форма входа |
| `CookieConsentBanner` | Баннер согласия на cookies (см. ниже) |
| `resetCookieConsent` | Сброс согласия, повторный показ баннера |
| `COOKIE_CONSENT_STORAGE_KEY` | Ключ localStorage: `gafus:cookieConsent:v1` |
| `ConsentValue` | Тип: `"accepted" \| "declined"` |

## CookieConsentBanner

Баннер уведомления о cookies. Фиксированная плашка внизу экрана, кнопки «Принять» и «Отклонить» с равным весом (GDPR-compliant).

### Props

| Prop | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `cookiePolicyUrl` | `string` | `"/cookies.html"` | URL страницы политики cookies |
| `storageKey` | `string` | `COOKIE_CONSENT_STORAGE_KEY` | Ключ в localStorage |

### Пример

```tsx
import { CookieConsentBanner } from "@gafus/ui-components";

<CookieConsentBanner
  cookiePolicyUrl={process.env.NEXT_PUBLIC_COOKIES_URL ?? "/cookies.html"}
/>
```

### Утилиты cookie consent

```tsx
import {
  resetCookieConsent,
  COOKIE_CONSENT_STORAGE_KEY,
} from "@gafus/ui-components";

// Сбросить согласие — баннер появится снова без перезагрузки
resetCookieConsent();

// Проверить текущий статус (вручную)
const raw = typeof window !== "undefined"
  ? localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
  : null;
const consent = raw === "accepted" || raw === "declined" ? raw : null;
```

Подробнее: [Cookie consent — документация фичи](../features/cookie-consent.md).

## 📦 Базовые компоненты

```typescript
import { Button, Input, Card } from '@gafus/ui-components';

function MyComponent() {
  return (
    <Card>
      <Input placeholder="Введите текст" />
      <Button variant="primary">Сохранить</Button>
    </Card>
  );
}
```

## 🔧 API (дополнительные компоненты)

- `Button` — Кнопка с различными вариантами
- `Input` — Поле ввода
- `Card` — Карточка контента
- `UserAvatar` — Аватар пользователя
- `CourseCard` — Карточка курса
- `TrainingProgress` — Прогресс тренировки
