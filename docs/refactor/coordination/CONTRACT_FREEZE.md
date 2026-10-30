# GAFUS Refactor — заморозка API-поверхности и контрактные ворота G1

**Идентификатор:** `G0-static-1 / G0-2026-10-16-vite-5fc78081`. **Источник:** только локальные исходники Refactor; машинная фиксация `BASELINE.json`, операции `OPERATIONS.md`.
**Статус:** **G0 STATIC FROZEN; G1 SEMANTIC DTO/RBAC NOT YET FROZEN**. Это принципиальное разграничение: зафиксированы существующие пути и файлы, но не доказана полная эквивалентность бизнес-операций. Параллельные независимые задачи разрешены; новые API consumers и breaking changes блокируются до G1-DTO.

## 1. Что действительно подтверждено

| Срез | Проверенный факт | Источник | Граница подтверждения |
|---|---|---|---|
| API | Hono `apps/api/src/app.ts` монтирует 205 статических деклараций (включая wildcard) | `BASELINE.json.hono` | статический парсер; wildcard dispatch и Core требуют отдельного аудита |
| Legacy Web | 55 страниц, 109 API route, 73 server-action modules | `BASELINE.json.web` | Next route ≠ автоматически Hono DTO |
| Trainer | 29 страниц, 6 `/api/*` route, 1 прочий route, 50 server-action modules | `BASELINE.json.trainer` | Hono CRUD тренера преимущественно не подтверждён |
| Admin | 21 страница, 5 `/api/*` route, 20 server-action modules | `BASELINE.json.admin` | большинство административных операций требуют AG1 |
| Expo | 66 `.ts/.tsx` файлов маршрутов, 37 API adapter modules | `BASELINE.json.mobile` | число файлов включает layouts/служебные файлы |
| Vite Web | 13 explicit статических путей + динамические helper-функции | `apps/web-vite/src/shared/router/location.tsx` | частичный prototype, не полная URL parity |
| Next→Hono Web | 85 статических method/path совпадений, 24 wildcard-кандидата, 18 не найдено, 17 legacy non-v1 (**по HTTP операциям, не по файлам**) | `BASELINE.json.web.apiRoutes[].matches` | совпадение НЕ подтверждает request/response/auth |
| Workspace | в `pnpm-lock.yaml` нет importer `apps/web-vite` | read-only grep | clean frozen install BLOCKED до AG4 |

`docs/refactor/INVENTORY.md` проверен командой `python3 scripts/refactor/inventory.py --check`: PASS. Заморожены SHA-256 578 исходных файлов/контрактных точек в `BASELINE.json.hashes`. Эти хэши включают исходные незакоммиченные изменения ветки `vite`; HEAD сам по себе не описывает baseline.

## 2. Транспорт: текущий фактический контракт

**Браузер (будущие Web, Trainer, Admin):** только HTTPS trusted Origin для cookie mutations; `X-Gafus-Auth-Transport: cookie` на browser login/register/refresh/logout. Cookies `gafus_access` и `gafus_refresh`: HttpOnly, Secure, SameSite=Lax, Path=/api/v1; срок access 15 минут, refresh 30 дней по текущему коду. Browser JS получает `data.user`, но не `accessToken` и не `refreshToken` в ответе cookie-mode. Защищённые Hono mutations с cookie требуют `Origin` из HTTPS allowlist; 403 при недоверенном Origin. Источники: `apps/api/src/middleware/auth.ts` и `apps/api/src/lib/browser-auth.ts`. `apps/web-vite/src/shared/api/client.ts`: relative `/api/v1`, `credentials:include`, `cache:no-store`. Dev Vite только isolated mock `127.0.0.1:4174`; реального HTTPS E2E нет. Trainer/Admin пока NextAuth/Next.js; cookie-mode в панелях — **цель**, не подтверждённая функциональность.

**Expo Mobile (сохранить):** `Authorization: Bearer <accessToken>`; `SecureStore` для refresh, JSON body `{refreshToken}` на `POST /api/v1/auth/refresh`. `POST /api/v1/auth/login` и `register` возвращают `{success:true,data:{user,accessToken,refreshToken}}` в native режиме. Browser cookie-mode не навязывать Expo. В `apps/mobile/src/shared/lib/api/client.ts` есть single-flight refresh. При временной сетевой ошибке не стирать refresh token без подтверждения invalid/revoked. Native offline/HLS/notifications/store purchase не затрагиваются browser PWA cleanup.

## 3. Подтверждённые точки для первого параллельного цикла

| Метод / путь | Вход / auth | Успешный ответ / семантика | Негативные тесты | Владелец |
|---|---|---|---|---|
| `POST /api/v1/auth/login` | JSON username/password, browser header+trusted Origin либо native | browser `data.user`+Set-Cookie; native `data.user/accessToken/refreshToken` | 401 bad credentials; 403 Origin; 500 | AG1 |
| `POST /api/v1/auth/register` | Core `authRegisterBodySchema`: name/email/password/tempSessionId/consentPayload/channel/promo | cookie/native transport различается как login | 400 validation; 409 duplicate; 403 Origin | AG1 |
| `GET /api/v1/auth/me` | cookie или Bearer | `{success:true,data:{id,username,role}}`, `private,no-store` | 401 invalid; REGISTRATION_PENDING | AG1 |
| `POST /api/v1/auth/refresh` | browser HttpOnly cookie или native JSON refreshToken | browser cookie rotation без JS JWT; native JSON new tokens | 403 Origin, 401 expired/reused; single-flight | AG1 |
| `POST /api/v1/auth/logout` | transport-specific session | revoke/clear по Hono auth | 403 Origin, expired cookie, stale tab | AG1 |
| `GET /api/v1/public/courses` | guest | whitelist id,name,type,shortDesc,duration,isPaid,isPrivate=false,hasAccess,isFavorite=false,userStatus,trainingLevel; max-age=60 | private course hidden, 500 | AG1 |
| `GET /api/v1/courses` | protected | Core course/progress/entitlement | 401, user isolation, premium | AG1 |
| `POST /api/v1/courses/favorites` | protected; add/remove | идемпотентный server-owned favorite | duplicate/retry, 401, 500 | AG1 |
| `GET /api/v1/user/profile` | protected | server-owned profile, `private,no-store` | 401, 500 not 200-empty | AG1 |
| `PUT /api/v1/user/profile` | protected, optional Zod fields | omitted fields preserved; explicit empty clears eligible fields | 400, 401, partial update | AG1 |
| `GET /api/v1/pets`, `GET /api/v1/pets/:petId` | protected | owner-filtered Core data | чужой pet 403/404, DB failure 500 | AG1 |
| `GET /api/v1/articles`, `GET /api/v1/articles/:slug` | protected | Core entitlement; browser WEB_DESKTOP, native Bearer platform | paid, forged platform, XSS, 404 vs 500 | AG1 |
| `ALL /api/v1/questions/*`, `ALL /api/v1/feed/*`, `ALL /api/v1/gallery/*` | protected wildcard dispatcher | **отдельные actions/DTO НЕ заморожены** | ownership, 400/401/403/409/429/500, media | AG1 |
| `/api/v1/training/*`, `/api/v1/offline/course/*` | protected | существующие Hono routes для прогресса/native offline | idempotency, old Mobile JSON | AG1 |
| `/api/v1/consultations/trainer/*`, `/admin/*` | protected | часть endpoints есть, полная role/owner policy НЕ заморожена | USER 403, TRAINER-B 403, double slot | AG1 |
| `/api/v1/app-subscription/*` | protected + provider callback special rules | server-verified subscription | duplicate receipt, webhook signature | AG1 |
| `POST /api/v1/payments/create`, `POST /api/v1/payments/apple/verify`, `GET /api/v1/payments/apple/course-metadata` | legacy | **410 LEGACY_PURCHASES_DISABLED**, НЕ рабочие платежи | 410 + no charge | AG1 |

Эти ответы — **точечные наблюдения по исходникам**, не полный OpenAPI. Поля, не подтверждённые кодом, не выводить из UI или примеров.

## 4. Что ЗАПРЕЩЕНО считать замороженным

- Нет проверенной 1:1 таблицы всех 109 Next API routes и 143 server-action modules → Hono/Core. `OPERATIONS.md` содержит полный **статический** список, но большинство mappings требуют ручного подтверждения.
- Нет единого подтверждённого OpenAPI 3.1/Zod для всех 205 деклараций и response/error fixtures.
- Нет полного server-side RBAC/ownership proof для Trainer/Admin; `requireRole` на маршруте не заменяет resource-level check.
- Нет доказанного сохранения всех версий выпущенного Expo API; native contract fixtures получать только из Refactor тестов/исходников, не production.
- Нет реального browser HTTPS cookie E2E, DB/Redis/S3/worker integration, payment sandbox/device push tests.
- 85 `STATIC_PATH_ONLY` совпадений — не подтверждённые DTO; 24 `DISPATCH_REVIEW` — не гарантированные actions; 18 `NOT_MATCHED` — не автоматическое отсутствие реализации; 17 `LEGACY_NON_V1` — не разрешение удалить.
- Любой endpoint из примеров планов, которого нет в BASELINE, — **PROPOSED**, не использовать до AG1 contract checkpoint.

## 5. Карточка API-контракта — AG1 заполняет для КАЖДОЙ операции

```text
CONTRACT-ID: API-<DOMAIN>-NNN
Revision: G1-DTO-<N> / status DRAFT|FROZEN|SUPERSEDED
Source: Hono file:line + Core service + Next legacy file/action + Mobile adapter
METHOD / PATH / route priority / query:
Authentication: public | browser cookie | native Bearer | provider webhook
Roles: USER / PARTNER / TRAINER / MODERATOR / ADMIN (explicit)
Ownership: which resource owner/tenant? denial HTTP?
Request: Zod schema + required/optional/null/default + max size
Success: HTTP status + envelope + JSON fixture + cache headers
Errors: HTTP code + machine code + Retry-After
Side effects: DB/Redis/queue/S3/email/payment + transaction/idempotency key
Compatibility: old Web, Vite, Trainer, Admin, Expo old/new, deep links
Tests: positive, invalid, unauthenticated, wrong role, wrong owner,
       replay, concurrency, DB failure, old native fixture
Rollback: additive behavior and client version gate
Approvals: AG1 owner + AG2/AG3/AG4 affected consumers + AG4 coordinator
```

**Нет заполненной карточки и фактически запущенных contract tests → endpoint остаётся UNFROZEN.** UI может работать только с локальным read-only mock/fixture. AG1 меняет DTO в общем Backend, а не дублирует бизнес-логику в клиентах.

## 6. RBAC — обязательная матрица аудита, НЕ объявлять реализованной

| Операция | USER | TRAINER | MODERATOR | ADMIN | Серверное доказательство |
|---|---|---|---|---|---|
| Читать собственный профиль/питомца | own | own | own | own | JWT + ownerId |
| Создать/пройти тренировку | entitlement | entitlement | entitlement | entitlement | Core access |
| Создать/изменить курс тренера | deny | **только свой** | deny | по политике | role + trainer ownership |
| Управлять расписанием тренера | deny | **только свой** | deny | по политике | booking/trainerId |
| Модерировать жалобы | deny | deny | scoped | allowed | role + audit reason |
| Управлять ролями/банами | deny | deny | по политике, без эскалации | allowed | RBAC + audit |
| Финансы/выплаты/подписки | deny | deny | deny | finance-only permission | ledger + audit |
| Native offline/push | только свой аккаунт | по политике | по политике | по политике | entitlement + device |

Таблица задаёт **требуемую политику**, не факт реализации. До утверждения спорных действий — deny by default и BLOCKED_POLICY. Отдельно проверять PARTNER/MODERATOR, не предполагать наследование ADMIN.

## 7. Порядок G1-DTO и тестов

1. **AG1** берёт 205 Hono, 109 Next API, 143 Web/Panel server-action modules, 37 Mobile adapters. Каждому action назначает карточку, Core owner, реальные error codes; wildcard расписывает до action-level методов.
2. **AG2** подтверждает 55 Web URL, 109 Next API, 73 actions → feature и новый UI; прикладывает JSON fixtures, не добавляет фиктивные endpoint.
3. **AG3** закрепляет Mobile Bearer JSON fixtures, offline queue/refresh/push/IAP compatibility; breaking change без его approval запрещён.
4. **AG4** подтверждает Trainer 29 страниц/50 actions и Admin 21/20; role/ownership negative matrix, missing API с AG1.
5. AG1 запускает Hono contract tests; AG3 mobile fixture parse; AG2 Web adapter tests; AG4 panel role tests. Только при реальных PASS AG4 публикует G1-DTO-N как FROZEN в DECISIONS.md.
6. Новые/изменённые контракты проходят change request, additive rollout и повторную проверку четырёх клиентов. BASELINE.json не перезаписывать.

## 8. Статические проверки (без production)

```sh
cd /Users/asmtv1/Desktop/gafus-refactor
python3 scripts/refactor/inventory.py --check
python3 scripts/refactor/parallel_baseline.py --verify
node scripts/refactor/verify_parallel_freeze.mjs
git diff --check
```

Не запускать production DB migrations, deploy, реальные webhook/push/payment и root pnpm install ради G0/G1. Hono unit/contract tests — только с изолированными mock fixtures; DB E2E после AG4 подтверждения отдельной неproduction среды. Нет такого окружения = BLOCKED, не PASS.

