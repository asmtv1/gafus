# @gafus/analytics — product analytics (MVP)

## Назначение

Тонкий слой **продуктовой аналитики** (по умолчанию Яндекс.Метрика на web): единый контракт событий в `@gafus/types`, адаптер и клиент без зависимости от доменной логики `packages/core`. **Не смешивать** с мониторингом ошибок (Tracer, `reportClientError`) — см. [docs/monitoring/tracer.md](../monitoring/tracer.md).

## Экспорты

| Путь | Назначение |
|------|------------|
| `@gafus/analytics` | `trackEvent`, `identifyUser`, `resetAnalyticsUser`, `sanitizePath`, валидация имён событий — общий контракт (без привязки к RN/браузеру) |
| `@gafus/analytics/web` | `syncWebAnalyticsWithConsent`, псевдоним `initAnalyticsWeb` (= то же), `getOrCreateWebAnonymousId` — только из web-клиента; init после согласия на cookies (`NEXT_PUBLIC_YM_COUNTER_ID`) |
| `@gafus/analytics/mobile` | **F5:** тот же публичный API, что и в `client` (`trackEvent`, `trackScreenView`, `identifyUser`, `resetAnalyticsUser`, `flushQueuedEvents`, `isAnalyticsReady`) + `sanitizePath` + `initAnalyticsMobile` — mobile-приложения импортируют трекинг отсюда, не из корня `@gafus/analytics` |

Вендорские SDK подключаются опционально в приложениях, не в корне пакета.

## Web: согласие, очередь, порядок провайдеров (F2–F4, F3)

- **События согласия:** `CookieConsentBanner` / `resetCookieConsent` диспатчат `gafus:cookieConsentChange` (см. [cookie consent](../features/cookie-consent.md)). `AnalyticsProvider` подписывается и вызывает `syncWebAnalyticsWithConsent` с `NEXT_PUBLIC_YM_COUNTER_ID` (пустой ID — тихий no-op).
- **Очередь:** до появления адаптера события кладутся в очередь; при `declined` или сбросе согласия **после** уже инициализированного PostHog `syncWebAnalyticsWithConsent` очищает очередь (`clearAnalyticsEventQueue` внутри пакета), отключает capture и сбрасывает пользователя — накопленное не уходит при отказе/отзыве.
- **F3 (layout):** в корневом layout web `ClientLayout` оборачивает **всё содержимое, включая** `SessionWrapper` — аналитика **не** зависит от next-auth. Внутри `AnalyticsProvider` дети идут первыми, затем `Suspense` + `NavigationAnalytics` (использует `useSearchParams` для `page_view`).
- **Идентификация:** `AnalyticsIdentityBridge` в `UserProvider` — identify при входе, `resetAnalyticsUser` при выходе (в т.ч. из шапки).

## Контракт событий

Канонические имена (`page_view`, `button_click`, `register_success`, `login_success`, `booking_start`, `booking_confirm`, `course_open`) задаются в `packages/types/src/analytics.ts` и Zod в `packages/analytics/src/validate.ts`. Расширение только через PR.

На **web** событие `course_open` для экрана списка дней курса отправляется с клиента при смене курса (`courseType` / `courseId` в зависимостях), `pathOrScreen` вида `/trainings/{courseType}` — без лишних срабатываний при смене только pathname.

Политика данных: без сырого PII в `props`, лимит размера, строгие Zod-схемы в `validate.ts` — см. план `.cursor/agentplan/analytics-events-mvp.md` (F6).

## Связанные документы

- [Cookie consent и события согласия](../features/cookie-consent.md) — web: захват после `accepted`
- [apps/web](../apps/web.md), [apps/mobile](../apps/mobile-rn.md) — env и встраивание
