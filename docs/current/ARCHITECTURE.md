# Архитектура GAFUS Refactor

Сверка исходников: 30.10.2026 (локальный Agent 3 scope; не общий релизный PASS). Целевая архитектура — **React/Vite + Hono + Expo**, не Next.js. Наличие модулей не означает подтверждённый PASS.

## Компоненты и владение

| Компонент | Ответственность | Код |
|---|---|---|
| Web | «Моменты», курсы, тренировки, профиль, питомцы, вопросы, статьи, чат и консультации | `apps/web-vite/src` |
| Admin Panel | Пользователи, модерация, статистика, настройки, подписки, контент | `apps/admin-panel/src/admin-live` |
| Trainer Panel | Курсы, дни, шаги, экзамены, заметки, статистика | `apps/trainer-panel/src/trainer-vite` |
| Mobile | Expo/React Native iOS/Android, офлайн-данные и синхронизация | `apps/mobile` (в том числе `apps/mobile/ios`) |
| API | Hono, REST v1, auth/permission middleware, internal callbacks | `apps/api/src/app.ts` |
| Core | Бизнес-правила и domain services | `packages/core` |
| Data | PostgreSQL, Prisma schema/migrations | `packages/prisma` |
| Async | Redis/BullMQ, воркеры и recovery | `packages/queues`, `packages/worker` |
| Media | Cloud.ru Container Jobs, S3 и Beget CDN | `apps/feed-cloud`, `apps/gallery-cloud`, `packages/*-storage` |
| Integration | SMTP, mobile push, payments, Voximplant | `packages/mailer`, `packages/webpush`, `apps/api/src/routes/v1` |
| Delivery | CI/CD, containers, infra definitions | `.github/workflows`, `infra`, `docker` |

## Поток данных

1. Клиент обращается к `/api/v1/*`; внутренние worker callbacks используют `/internal/*`.
2. Middleware в `apps/api/src/app.ts` проверяет права, авторизацию, CORS, rate limits; скрытие кнопки в UI не заменяет серверный ACL.
3. Services в `packages/core` реализуют доменные операции. Prisma работает с PostgreSQL, BullMQ/Redis — с асинхронными задачами, outbox и retries.
4. Обработка media: backend → queue/job → FFmpeg/Sharp → Cloud.ru S3 → CDN Beget, с доменными вариантами и ограничениями.
5. Офлайн Mobile синхронизирует разрешённые операции по серверным правилам/версиям.

## Источники истины

- [Подключённые API и методы](../reference/API_ROUTERS.md) — Hono router mounts, метод-пути.
- [Все workspace и команды](../reference/WORKSPACES_AND_COMMANDS.md).
- [Все Prisma модели и enum](../reference/PRISMA_MODELS.md).
- [Исходники приложений](../reference/FRONTEND_SOURCE_MAP.md).
- [CI/scripts](../reference/CI_SCRIPTS.md).
- [Контракты media](../contracts/MEDIA_PIPELINE_NO_VM.md).
- [Текущий статус QA](../qa/CURRENT_RELEASE_STATUS.md).
- [Единая архитектурная приёмка 8 направлений (30.10.2026)](../architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md) — уровни source/unit/real HTTP+PG/browser/native/image/CI, владельцы и незакрытые release gates; READY=NO.

Справочники генерируются статически, динамические пути/гейты требуется дополнительно сверять с runtime и тестами.

## Пакет контрактов, отложенная загрузка и модульные границы UI (30.10.2026)

- Общие DTO/валидация небольших API-контрактов: `packages/types/src/contracts/`; сквозной owner-scoped `GET /api/v1/auth/username-available` проверяется фактическим Hono route-test и Web/Mobile consumer тестами. Исходная валидация и auth остаются в Hono; результат availability — только подсказка, а не резервирование логина. История проверок и ограничения: [NIGHT_AGENT_3_2026-10-30](../architecture/NIGHT_AGENT_3_2026-10-30.md).
- После чистой сборки `@gafus/types` текущий публичный `.` entrypoint экспортирует `contracts/usernameAvailability`; Hono, Web и Mobile импортируют через `@gafus/types` вместо относительных путей к исходникам. Agent 1 отделил серверный logger в `@gafus/types/logger`: собранный `dist/index.js` и его транзитивный клиентский chunk не импортируют `@gafus/logger`, root `dist/index.d.ts` сохраняет контракт. `pnpm check:core-boundaries` — PASS (780 модулей в core client/server graph). Это проверка текущей сборки, а **не** универсальное разрешение всех будущих runtime импортов из root barrel.
- В Web тяжёлые экраны загружаются через `React.lazy` и `DeferredReadRoute` с общим `Loading` и error-boundary. Гостевые `/`, `/login`, `/register`, `/passwordReset`, `/reset-password`, `/vk-consent`, `/profile/confirm-email` также вынесены в отдельные chunks. Замер main JS после локальной сборки: 335 753 → 281 931 B (gzip 101 483 → 86 023 B, финальная сборка после Types-импортов); это **не** LCP/INP. Детали: [WEB_BUNDLE_CODE_SPLITTING_2026-10-29](../maintenance/WEB_BUNDLE_CODE_SPLITTING_2026-10-29.md) и [NIGHT_AGENT_3](../architecture/NIGHT_AGENT_3_2026-10-30.md).
- Для owner-only истории посещений питомца Web `PetVetVisitsConnected` сохраняет fetch/state/fence, а `PetVetVisitDetails` содержит отображение вложений и действия; `petVetVisitDomain` — поля и проверку даты. В изолированном synthetic Chromium 1280/390 проверены details, PDF, кнопки, реальные confirm-диалоги отмены удаления, несохранённая форма, защита навигации, отсутствие overflow. Права и HTTP-маршруты не менялись; synthetic transport **не** подтверждает production-бэкенд.
- Mobile `AccordionStep.tsx` (прежде 1700 строк) разделён на `AccordionStep.presentation.ts` (448 строк неизменённых стилевых токенов и status palette) и connected component (1261 строк). Mounted 15/15 + presentation 2/2 и отдельно synthetic React Native Web Chromium 1280/390 проходят; нативные iOS/Android экраны и offline-тренировки этим browser preview не подтверждены.
- Lazy-route test lifecycle: проверять реальный DOM выбранного маршрута после `Suspense`, не считать заранее установленную задержку доказательством готовности. Исходный полный Web run 30.10 обнаружил тестовый `NAV-C03` timeout (безусловное ожидание) и шесть последующих `act`/DOM failures в `FavoritesDeepLink`, тогда как пять файлов из прежнего отчёта агента 1 прошли 86/86 в том же наборе. Исправлена синхронизация теста; повторный полный `pnpm --filter @gafus/web-vite test` **exit 0**: 3041 passed / 0 failed / 6 skipped, 287 файлов; исходный был 3034 passed / 7 failed / 6 skipped. Совмещённый targeted 5 старых проблемных файлов + Favorites **97/97 PASS**, Web typecheck/lint **exit 0**. См. [NIGHT_AGENT_3](../architecture/NIGHT_AGENT_3_2026-10-30.md); release gate от этого не отменяется.
- Статус release READY остаётся **NO** до независимых gates; см. [QA_AND_RELEASE](./QA_AND_RELEASE.md) и [CURRENT_RELEASE_STATUS](../qa/CURRENT_RELEASE_STATUS.md).

## Архитектурные границы и безопасный release

- Web импортирует browser-safe Core только через approved utils/training и services/mediaDelivery. Проверка: scripts/check-web-core-boundary.mjs; Mobile проверяется отдельным guard.
- Чаты Web выделены в lazy chunk. Hono Chat2 и Worker выключены до отдельного cutover. Centrifugo находится в опциональном Compose-профиле.
- Все production-операции требуют явного cutover approval, QA READY=YES и Chat2 provider config. Проверки: scripts/refactor/check-release-index.mjs и scripts/refactor/check-chat2-prod-boundary.mjs.
- Детали и нерешённые ограничения: [ARCHITECTURE_HARDENING_2026-10-29](../maintenance/ARCHITECTURE_HARDENING_2026-10-29.md).

### Завершающая архитектурная сверка — 30.10.2026

Свежий `df -h` даёт **47 GiB свободно**: старое ограничение места для OCI снято, но **Agent 2 image/runtime IN PROGRESS**: Worker local `linux/arm64` job `04e91cf4…` **running** (без exit 0), API/Worker image digest и isolated startup receipts пока не подтверждены; release `linux/amd64` отдельно не проверен. Блокирующий release-inclusion review: package manifests всех девяти новых extracted packages и часть CI/checker файлов ещё **вне Git index**; `docs/current` имеет **7 index/0 HEAD**. Web **3048 PASS / 6 SKIP**, Mobile **2345 PASS / 1 SKIP**, точечные native token-sub отрицательные **59/59** — приняты ранее и не повторялись. Статус **READY=NO**. Точная [матрица 8 направлений с image gate и минимальным перечнем файлов](../architecture/ARCHITECTURE_ACCEPTANCE_2026-10-30.md).
