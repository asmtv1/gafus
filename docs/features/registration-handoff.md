# Регистрация и партнёрская атрибуция: release/admin handoff

Каноническое описание контракта после приёмки 2026-09-09. Документ отражает
проверенную локальную реализацию; production не менялся.

## Что считается контрактом

### Email/API

`POST /api/v1/auth/register` принимает `name`, `email`, `password`, UUID
`tempSessionId`, три обязательных `true` в `consentPayload`, необязательный
`registrationChannel` (`WEB`, `IOS`, `ANDROID`) и необязательный `promoCode`.
`tempSessionId` — только ключ идемпотентности, не credential. Core сам в одной
транзакции создаёт пользователя, `ConsentLog` со статусом `COMPLETED`, сохраняет
валидный промокод и создаёт атрибуцию, если код принадлежит текущему активному
партнёру. Email transport не создаёт и не помечает consent-строки отдельно.

Повтор с теми же нормализованными данными возвращает уже созданного пользователя;
изменённый пароль или fingerprint даёт `ATTEMPT_MISMATCH` и не должен повторно
использовать тот же ID. Временный сбой даёт `TEMPORARY_FAILURE` и допускает
неизменённый retry. Некорректный, неизвестный, неактивный или архивный код даёт
`PROMO_INVALID` (поле `promoCode`) до commit. Отсутствующий `promoCode` у старого
клиента допустим: регистрация без кода сохраняется.

Проверка кода без раскрытия eligibility: `POST
/api/v1/auth/registration-promo-preview` возвращает только нормализованный
`{ code }`. Она не меняет цену; окончательным остаётся transaction checkout.

### VK ID

OAuth создаёт серверный `VkRegistrationContext`: хеши opaque context/state,
server-only PKCE verifier, purpose и выбранный промокод. TTL — ровно 5 минут;
raw token, промокод, verifier, OAuth code и provider token нельзя помещать в URL,
cookie или логи. В браузере в HttpOnly cookie остаются только opaque state/context
и return destination; в mobile opaque данные и retry ID хранятся в SecureStore.

Новый или pending VK-пользователь не получает JWT/сессию до согласия. Completion
атомарно проверяет state/purpose/TTL, сохраняет consent и атрибуцию, снимает
`registrationPending`. Web получает только одноразовый `LOGIN` grant для
NextAuth; registration context не является login grant. Mobile получает обычные
токены только после commit. Pending-пользователь не должен проходить через
refresh/session fallback.

Старые `VkIdOneTimeLogin` consent tokens после миграции отклоняются: нужно заново
запустить OAuth. `CONTEXT_INVALID`, `CONTEXT_EXPIRED` и
`VK_CONTEXT_PURPOSE_INVALID` означают restart OAuth; временную ошибку можно
повторить без изменения формы. Повтор в пределах TTL с теми же данными
идемпотентен, изменённые данные дают `VK_COMPLETION_ATTEMPT_CONFLICT`. Истёкший
контекст не продлевается; mobile сохраняет введённый промокод для нового входа.

### Web/mobile UI

Web отправляет только последний явно применённый промокод; preview/ошибка видны до
перехода к оплате. Mobile передаёт `promoCode` в email/VK start и
`contextToken`, `state`, `tempSessionId`, `consentPayload`, `promoCode` в VK
completion. Пять минут — общий серверный deadline, локальный retry не продлевает
его. Сохранение паролей не допускается.

Offer может вернуть `savedRegistrationPromoCode` как `{ code, status }`. Неактивный
или архивный сохранённый код явно показывается как предупреждение и не подставляется
в оплату; цены и checkout contract не меняются.

Коды ошибок, которые transport должен сохранять в `{ success: false, code, error }`:

| Код | Действие клиента |
|---|---|
| `PROMO_INVALID` | Исправить/очистить код, не коммитить аккаунт |
| `ATTEMPT_MISMATCH` | Новый `tempSessionId`, проверить форму/пароль |
| `TEMPORARY_FAILURE` / `NETWORK_ERROR` | Повторить тот же запрос без изменения данных |
| `CONTEXT_INVALID` / `CONTEXT_EXPIRED` / `VK_CONTEXT_PURPOSE_INVALID` | Новый VK OAuth, сохранив форму где возможно |
| `VK_COMPLETION_ATTEMPT_CONFLICT` | Не перезаписывать promo/consent; начать новый context |
| `VK_TOKENS_MISSING` | Не считать вход успешным; повторить VK |
| `DEPRECATED_PARTNER_ATTRIBUTION_FLOW` (HTTP 410) | Не вызывать legacy attribution route |

## Партнёры и существующие промокоды

Атрибуция возникает только внутри регистрации/checkout transaction helper. Старый
post-auth `POST /api/v1/partners/attribution` отвечает HTTP 410 и не должен
вызываться. Клиенты, использующие этот flow, нужно обновить **до запуска партнёров**;
при этом регистрация без кода для старых клиентов остаётся рабочей.

Для назначения партнёра администратор открывает Users в admin panel, редактирует
пользователя, выбирает роль `Партнёр` и существующий свободный active, non-archived
promo code, затем сохраняет. В списке предлагаются только коды без
`partnerProfile`, назначение идемпотентно и один код нельзя выдать двум партнёрам.
Изменение роли/кода партнёра требует роли `ADMIN`; `MODERATOR` может редактировать
остальные поля по прежним правилам. Не создавайте код вручную и не меняйте
финансовые записи.

Legacy `PartnerProfile` с `promoCodeId = null` остаётся читаемым для истории, но
не может выдавать новые referrals, пока ADMIN не назначит ему существующий код.
Старый nullable `referralCode` сохраняется read-compatible и не конвертируется в
скидочный promo автоматически. Уже созданные `PartnerReferral`, commission,
payout и payment history не удаляются и не перепривязываются.

## Миграции и rollout

Выполнять migrations ровно в следующем порядке (Prisma deploy применяет pending
миграции по этому порядку):

1. `20260908090000_partner_program`
2. `20260908101500_vk_id_one_time_login`
3. `20260909113000_registration_contracts_data`
4. `20260909150000_vk_registration_completion`

Rollout: **DB → shared packages/core/auth/API/web → mobile → smoke**.
После каждого слоя проверяйте его health/build и не открывайте partner launch,
пока старые attribution clients не обновлены. Команды из текущих package scripts:

```bash
pnpm install --frozen-lockfile
pnpm --filter @gafus/prisma db:migrate:deploy
pnpm --filter @gafus/prisma db:generate
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/auth typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/api build
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/web build
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile test
```

Smoke должен включить email registration/retry, web registration + preview, VK
OAuth/consent на web и mobile, inactive/archived saved promo, а также checkout
preview и финальную транзакцию. Для локальной native-проверки в текущем
`apps/mobile/package.json` есть `pnpm --filter @gafus/mobile ios` и
`pnpm --filter @gafus/mobile android`; store release/EAS запускается только через
согласованный pipeline, не описанный в этом handoff.

## Monitoring, privacy, rollback

Мониторьте `TEMPORARY_FAILURE`, `ATTEMPT_MISMATCH`, context expiry/conflict,
pending VK accounts, HTTP 410 legacy calls, registration latency и ошибки
`/api/v1/auth/*`; сопоставляйте события по user ID/request correlation ID, не по
секретам. В логах и Tracer запрещены password, raw `tempSessionId`, context/state,
PKCE verifier, OAuth/provider tokens, login grants и полные email/promo payloads.
Логируйте только безопасные коды результата, route, channel, status и внутренний
user ID. См. [архитектуру логирования](../architecture/logging-architecture.md).

Rollback — это возврат UI/service layers по согласованному release plan и
остановка partner launch; DB rollback удалением migration не применять. Не удалять
`PartnerReferral`, commissions, payouts, payments или consent/history. Не включать
обратно legacy post-auth attribution, не делать pending VK account
аутентифицируемым и не принимать registration token как login-token bypass.

## Приёмка: что доказано и что ещё требуется

Выполнено по review report:

- обе аддитивные миграции применены на изолированной новой PostgreSQL БД, финальная
  Prisma schema/FK совпали; legacy users и historical referral сохранены;
- реальные PostgreSQL rollback/race сценарии, включая same-key concurrency;
- focused core 60/60, auth 4/4, API 2/2, web 2/2;
- typecheck `types`, `core`, `auth`, `api`, `web`, `mobile`; core/auth/API build;
  web production build с typecheck;
- web browser smoke `/register`; mobile 40 файлов/150 тестов, typecheck и загрузка
  текущего Metro bundle на iPhone 17 development client;
- `git diff --check` чист.

Открытые external release gates: реальный VK OAuth и mobile callback, YooKassa
sandbox/production checkout, production migration/deploy/SMTP, а также текущая
Expo native/device QA на iOS Simulator и Android AVD. В этом handoff не выполнялись
commit, deploy, production access или изменения financial/auth/transaction code.
