# Технический план: недельная подписка Gafus через YooKassa и Apple IAP

## 1. Senior Review PLAN.md

Текущий `PLAN.md` правильный по направлению, но недостаточно подробный для безопасной реализации платежей “с первого раза”. Критичные доработки:

- Нельзя переиспользовать текущую модель `Payment`: она привязана к `courseId` и разовым оплатам курсов/статей. Для общей подписки нужны отдельные модели `AppSubscription*`.
- Нельзя полагаться на клиентский paywall. Доступ к платным действиям должен закрываться сервером: Hono API, Next server routes/pages, core-сервисы.
- Нужно развести названия: текущие `subscriptions` в API/core означают push-подписки. Новую логику называем только `appSubscription`.
- Для денег обязательны идемпотентность на трех уровнях: БД unique constraints, provider `Idempotence-Key`, webhook/event dedupe.
- Admin manual grant должен быть отдельным ADMIN-only действием, не через существующий update user, где сейчас есть доступ у `MODERATOR`.
- Webhook нельзя делать “только UI-кэши потом”. Сначала надежно фиксируем платеж/событие в БД, затем инвалидируем кэш.
- iOS YooKassa-кнопка должна быть скрыта по умолчанию, управляться remote flag и не влиять на стандартный Apple IAP.

Документация, на которую опираемся:
- YooKassa recurring/autopay: https://yookassa.ru/docs/support/payments/extra/autopayment
- YooKassa сохранение способа оплаты: https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/save-payment-method/save-during-payment
- YooKassa API payments/idempotence: https://yookassa.ru/developers/api#create_payment
- Apple auto-renewable subscriptions: https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers/implementing_auto-renewable_subscriptions
- Apple App Store Server Notifications: https://developer.apple.com/documentation/appstoreservernotifications
- Apple App Store Server API subscription statuses: https://developer.apple.com/documentation/appstoreserverapi/get-all-subscription-statuses
- Apple Node server library: https://github.com/apple/app-store-server-library-node
- expo-iap: https://hyochan.github.io/expo-iap/docs/

## 2. Зафиксированные решения

- Подписка недельная. YooKassa цена по умолчанию `200.00 RUB`, меняется в админке. Apple цена задается в App Store Connect, в админке храним только `appleProductId`.
- Android не Google Play: Android и Web используют YooKassa.
- iOS по умолчанию использует Apple IAP. Кнопка “Оплатить картой РФ” использует YooKassa, скрыта по умолчанию и включается из админки.
- Новые пользователи после завершения экскурсии получают paywall. Если закрыли paywall, стартовые/free экраны доступны, платные действия снова открывают paywall.
- Существующие пользователи после релиза тоже требуют подписку сразу. Миграцией бесплатный доступ им не выдаем.
- Free scope: профиль, настройки аккаунта, смена email/пароля/username, удаление аккаунта, базовый CRUD питомцев и фото питомца.
- Gated scope: документы питомца, профилактика питомца, reminders, courses/training/daily course/exam/offline, articles detail/actions, consultations, notes, achievements/favorites.
- Admin может поставить manual paid until, lifetime или clear. Moderator только видит статус.
- В v1 ничего не удаляем из существующих разовых оплат курсов/статей.
- `UserRole.PREMIUM` не считается app subscription в v1. Доступ дает только `AppSubscription` (`YOOKASSA`, `APPLE`, `MANUAL`), чтобы не выдать бесплатный доступ существующим пользователям случайно.

## 2.1. Правило качества по шагам (обновлено)

Для каждого шага реализации (`## 4`-`## 12`) обязательна одинаковая последовательность:

1. Реализация шага.
2. Локальная верификация (`superpowers:verification-before-completion`): тесты, линт, typecheck и профильные проверки шага.
3. Code review (`superpowers:requesting-code-review`) сразу после завершения шага.
4. Только после review шаг помечается как “готово”.

`superpowers:requesting-code-review` выполняется после каждого шага, а не только перед merge.

## 2.2. Definition of Done для каждого шага

Шаг (`## 4`-`## 12`) считается завершенным только если есть все пункты:

1. Код и миграции для шага внесены.
2. Targeted tests шага зеленые.
3. Typecheck/линт для затронутых пакетов зеленые.
4. Выполнен `superpowers:requesting-code-review`, замечания закрыты или явно зафиксированы как follow-up.
5. В `PLAN2.md` у шага добавлен короткий execution note: что сделано, какие команды запускались, какие ограничения остались.

## 2.3. Feature flags для безопасного rollout

Добавить явные semantic aliases в `packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts`:

```ts
export const APP_FEATURE_APP_SUBSCRIPTION_GATING = "app_subscription_gating_enabled";
export const APP_FEATURE_APP_SUBSCRIPTION_PAYWALL = "app_subscription_paywall_enabled";
export const APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment_hint";
```

Defaults:

- `APP_FEATURE_APP_SUBSCRIPTION_GATING`: `false` до production rollout.
- `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL`: `false` до smoke-тестов, затем можно включить раньше server gating.
- `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT`: `false` по умолчанию.

Правила:

- Server-side gates в API/Web сначала проверяют `APP_FEATURE_APP_SUBSCRIPTION_GATING`; если flag выключен, gated action не блокируется.
- Paywall UI сначала проверяет `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL`; если flag выключен, paywall не показывается автоматически после onboarding.
- Ручная страница `/subscription` и payment endpoints могут работать при выключенном server gating, чтобы тестировать платежи до полного включения.
- `getMobileAppPublicConfig()` вернуть поля:
  - `appSubscriptionPaywallEnabled`
  - `appSubscriptionGatingEnabled`
  - `iosRuCardPaymentEnabled`
  - `iosRuCardPaymentHintEnabled` (legacy alias на один релиз)

## 3. Новые публичные контракты

### Core exports

Создать `packages/core/src/services/appSubscription/index.ts`.

Экспортировать из `packages/core/src/services/index.ts`:

```ts
export * from "./appSubscription";
```

Экспортировать из `packages/core/package.json`:

```json
"./services/appSubscription": {
  "types": "./dist/core/src/services/appSubscription/index.d.ts",
  "default": "./dist/core/src/services/appSubscription/index.js"
}
```

Основные DTO:

```ts
export type AppSubscriptionProvider = "YOOKASSA" | "APPLE" | "MANUAL";

export type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  activeUntil: string | null;
  isLifetime: boolean;
  provider: AppSubscriptionProvider | null;
  status: "ACTIVE" | "PENDING" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "REFUNDED" | "REVOKED" | null;
  cancelAtPeriodEnd: boolean;
};

export type AppSubscriptionOfferDto = {
  intervalDays: 7;
  currency: "RUB";
  yookassaPriceRub: number;
  appleProductId: string | null;
  appleAppAccountToken: string | null;
  iosRuCardPaymentEnabled: boolean;
};
```

Единая ошибка доступа:

```ts
export class SubscriptionRequiredError extends Error {
  code = "SUBSCRIPTION_REQUIRED" as const;
  status = 402 as const;

  constructor(message = "Для действия нужна подписка") {
    super(message);
  }
}
```

### Mobile Hono API

Создать `apps/api/src/routes/v1/app-subscription.ts`:

- `GET /api/v1/app-subscription/status`
- `GET /api/v1/app-subscription/offer`
- `POST /api/v1/app-subscription/yookassa/start`
- `POST /api/v1/app-subscription/yookassa/cancel`
- `POST /api/v1/app-subscription/apple/verify`
- `POST /api/v1/app-subscription/apple/restore`

Формат ошибок:

```json
{
  "success": false,
  "error": "Для действия нужна подписка",
  "code": "SUBSCRIPTION_REQUIRED"
}
```

HTTP status для gated action без подписки: `402`.

### Web Next API

Создать:

- `apps/web/src/app/api/v1/app-subscription/status/route.ts`
- `apps/web/src/app/api/v1/app-subscription/offer/route.ts`
- `apps/web/src/app/api/v1/app-subscription/yookassa/start/route.ts`
- `apps/web/src/app/api/v1/app-subscription/yookassa/cancel/route.ts`
- `apps/web/src/app/api/v1/app-subscription/apple/notifications/route.ts`

Web POST routes защищать `withCSRFProtection`. Apple/YooKassa webhook routes CSRF не требуют, но требуют provider verification.

Таймауты и retry policy для внешних провайдеров:

- YooKassa/Apple HTTP timeout: 10s.
- Retry только для сетевых/5xx ошибок (экспоненциальный backoff + jitter).
- 4xx от провайдера не ретраить автоматически, переводить в явный бизнес-статус/ошибку.

## 4. Prisma-схема и миграция

Навыки для шага: `prisma-cli`, `prisma-client-api`, `codex-security:threat-model`, `superpowers:test-driven-development`.

Практики: отдельные таблицы для новой платежной области, no PAN/card data, unique constraints для идемпотентности, audit trail, миграция без выдачи бесплатного доступа существующим пользователям.

Изменить `packages/prisma/schema.prisma`.

Также изменить `packages/prisma/src/index.ts`:

- экспортировать новые model types: `AppSubscription`, `AppSubscriptionPayment`, `AppSubscriptionEvent`, `AppSubscriptionSettings`;
- экспортировать enums: `AppSubscriptionProvider`, `AppSubscriptionStatus`, `AppSubscriptionPaymentKind`, `AppSubscriptionPaymentStatus`, `AppSubscriptionEventSource`, `AppSubscriptionEventProcessingStatus`;
- добавить в `DatabaseClient` свойства `appSubscription`, `appSubscriptionPayment`, `appSubscriptionEvent`, `appSubscriptionSettings`.

Добавить к `User`:

```prisma
appleAppAccountToken String? @unique @db.VarChar(36)

appSubscriptions AppSubscription[] @relation("AppSubscriptionUser")
appSubscriptionPayments AppSubscriptionPayment[] @relation("AppSubscriptionPaymentUser")
appSubscriptionEvents AppSubscriptionEvent[] @relation("AppSubscriptionEventUser")
manualAppSubscriptionGrants AppSubscription[] @relation("ManualAppSubscriptionGrantedBy")
updatedAppSubscriptionSettings AppSubscriptionSettings[] @relation("AppSubscriptionSettingsUpdatedBy")
adminAppSubscriptionEvents AppSubscriptionEvent[] @relation("AppSubscriptionEventActor")
```

Добавить enums:

```prisma
enum AppSubscriptionProvider {
  YOOKASSA
  APPLE
  MANUAL
}

enum AppSubscriptionStatus {
  PENDING
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
  REFUNDED
  REVOKED
}

enum AppSubscriptionPaymentKind {
  INITIAL
  RENEWAL
}

enum AppSubscriptionPaymentStatus {
  PENDING
  SUCCEEDED
  CANCELED
  FAILED
  REFUNDED
}

enum AppSubscriptionEventSource {
  YOOKASSA
  APPLE
  ADMIN
  SYSTEM
}

enum AppSubscriptionEventProcessingStatus {
  RECEIVED
  PROCESSING
  PROCESSED
  FAILED
}
```

Добавить модели:

```prisma
model AppSubscriptionSettings {
  key String @id @db.VarChar(32)

  yookassaWeeklyPriceRub Decimal @default(200.00) @db.Decimal(10, 2)
  currency String @default("RUB") @db.VarChar(3)
  intervalDays Int @default(7)
  appleProductId String? @unique

  updatedById String?
  updatedBy User? @relation("AppSubscriptionSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AppSubscription {
  id String @id @default(cuid())

  userId String
  user User @relation("AppSubscriptionUser", fields: [userId], references: [id], onDelete: Cascade)

  provider AppSubscriptionProvider
  status AppSubscriptionStatus @default(PENDING)

  currentPeriodStart DateTime?
  currentPeriodEnd DateTime?
  isLifetime Boolean @default(false)
  cancelAtPeriodEnd Boolean @default(false)
  canceledAt DateTime?

  yookassaPaymentMethodId String? @unique
  appleOriginalTransactionId String? @unique
  appleProductId String?

  manualGrantedById String?
  manualGrantedBy User? @relation("ManualAppSubscriptionGrantedBy", fields: [manualGrantedById], references: [id], onDelete: SetNull)
  manualReason String?

  payments AppSubscriptionPayment[]
  events AppSubscriptionEvent[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status, currentPeriodEnd])
  @@index([provider, status, currentPeriodEnd])
}

model AppSubscriptionPayment {
  id String @id @default(cuid())

  subscriptionId String?
  subscription AppSubscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  userId String
  user User @relation("AppSubscriptionPaymentUser", fields: [userId], references: [id], onDelete: Cascade)

  provider AppSubscriptionProvider
  kind AppSubscriptionPaymentKind
  status AppSubscriptionPaymentStatus @default(PENDING)

  amount Decimal? @db.Decimal(12, 3)
  currency String? @db.VarChar(3)

  periodStart DateTime?
  periodEnd DateTime?

  idempotenceKey String @unique
  yookassaPaymentId String? @unique
  appleTransactionId String? @unique
  appleOriginalTransactionId String?
  applePriceMilliunits Int?
  appleStorefront String?
  appleEnvironment String?
  appleWebOrderLineItemId String?

  confirmationUrl String?
  failureCode String?
  failureReason String?

  attemptCount Int @default(0)
  lastAttemptAt DateTime?
  nextAttemptAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, provider, status])
  @@index([provider, status, nextAttemptAt])
  @@index([appleOriginalTransactionId])
}

model AppSubscriptionEvent {
  id String @id @default(cuid())

  subscriptionId String?
  subscription AppSubscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  userId String?
  user User? @relation("AppSubscriptionEventUser", fields: [userId], references: [id], onDelete: SetNull)

  source AppSubscriptionEventSource
  eventType String
  providerEventKey String?
  idempotencyKey String?
  payloadHash String?
  processingStatus AppSubscriptionEventProcessingStatus @default(RECEIVED)
  processingAttempts Int @default(0)
  lastProcessingError String?
  actorId String?
  actor User? @relation("AppSubscriptionEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  metadata Json?

  processedAt DateTime?
  createdAt DateTime @default(now())

  @@index([source, eventType, createdAt])
  @@index([processingStatus, createdAt])
  @@index([userId, createdAt])
}
```

Миграция:

```sql
INSERT INTO "AppSubscriptionSettings"
  ("key", "yookassaWeeklyPriceRub", "currency", "intervalDays", "createdAt", "updatedAt")
VALUES
  ('default', 200.00, 'RUB', 7, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
```

Дополнительно в SQL-миграции:

- Добавить CHECK: `currency = 'RUB'` для `AppSubscriptionSettings`.
- Добавить CHECK для `AppSubscriptionPayment`: если `provider = 'YOOKASSA'`, то `amount IS NOT NULL AND currency = 'RUB'`.
- Для Apple `amount/currency` могут быть `NULL`: цена управляется App Store Connect, а `JWSTransactionDecodedPayload.price/currency` опциональны. Если Apple прислала `price`/`currency`, сохранить `applePriceMilliunits`, `currency`, `amount = price / 1000`.
- Добавить CHECK на корректность периода: `"periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" > "periodStart"`.
- Добавить индекс для renewals scan: `(provider, status, cancelAtPeriodEnd, currentPeriodEnd)`.
- Для `AppSubscriptionEvent.providerEventKey` и `idempotencyKey` использовать partial unique index (`WHERE ... IS NOT NULL`), чтобы избежать коллизий по NULL в разных БД/версиях.
- Добавить partial unique index для одного активного subscription на provider/user: `("userId", "provider") WHERE "status" IN ('PENDING','ACTIVE','PAST_DUE')`.

Команды после шага:

```bash
pnpm --filter @gafus/prisma db:migrate -- --name app_subscription
pnpm --filter @gafus/prisma db:generate
pnpm --filter @gafus/prisma build
pnpm --filter @gafus/core typecheck
```

## 5. Core: доступ, настройки, admin grants

Навыки: `superpowers:test-driven-development`, `prisma-client-api`, `codex-security:security-scan`.

Практики: core owns business logic, clients thin, ADMIN-only enforcement, audit event for every manual change.

Создать:

- `packages/core/src/services/appSubscription/types.ts`
- `packages/core/src/services/appSubscription/errors.ts`
- `packages/core/src/services/appSubscription/settingsService.ts`
- `packages/core/src/services/appSubscription/accessService.ts`
- `packages/core/src/services/appSubscription/adminService.ts`
- `packages/core/src/services/appSubscription/appleAccountTokenService.ts`
- `packages/core/src/services/appSubscription/__tests__/accessService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/adminService.test.ts`

Изменить:

- `packages/core/src/services/video/videoAccessService.ts`
- `packages/core/src/services/video/index.ts`

Ключевая логика доступа:

```ts
export async function getAppSubscriptionAccess(userId: string, now = new Date()): Promise<AppSubscriptionStatusDto> {
  const rows = await prisma.appSubscription.findMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
  });

  const active = rows.find((s) => {
    if (s.isLifetime && s.status === "ACTIVE") return true;
    return s.status === "ACTIVE" && s.currentPeriodEnd != null && s.currentPeriodEnd > now;
  });

  if (!active) {
    return {
      hasActiveSubscription: false,
      activeUntil: null,
      isLifetime: false,
      provider: null,
      status: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    hasActiveSubscription: true,
    activeUntil: active.isLifetime ? null : active.currentPeriodEnd!.toISOString(),
    isLifetime: active.isLifetime,
    provider: active.provider,
    status: active.status,
    cancelAtPeriodEnd: active.cancelAtPeriodEnd,
  };
}
```

ADMIN manual grant:

```ts
const manualGrantSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("until"), paidUntil: z.string().datetime(), reason: z.string().max(500).optional() }),
  z.object({ mode: z.literal("lifetime"), reason: z.string().max(500).optional() }),
  z.object({ mode: z.literal("clear"), reason: z.string().max(500).optional() }),
]);
```

Правила:

- `actorRole !== "ADMIN"` всегда ошибка.
- `until`: дата должна быть в будущем.
- `lifetime`: `isLifetime=true`, `currentPeriodEnd=null`, `status=ACTIVE`.
- `clear`: отменяет только `provider=MANUAL`, не трогает YooKassa/Apple.
- Каждое изменение пишет `AppSubscriptionEvent` с `source=ADMIN`, `actorId`, `targetUserId`, `mode`, `reason`.
- `MODERATOR` может читать summary, но не может вызвать мутацию.

Video access:

- `checkVideoAccess` должен учитывать app subscription для видео, которые принадлежат gated course/training content.
- Если `APP_FEATURE_APP_SUBSCRIPTION_GATING=false`, оставить старое поведение `CourseAccess/public free course`.
- Если `APP_FEATURE_APP_SUBSCRIPTION_GATING=true`, для user-потребления gated course video нужен `getAppSubscriptionAccess(userId).hasActiveSubscription === true`.
- Trainer/author access (`video.trainerId === userId`) не должен зависеть от app subscription.
- HLS manifest/segment endpoints не читают JWT, но проверяют signed video token; поэтому итоговая проверка доступа остается в core `checkVideoAccess`.

Тесты:

```bash
pnpm --filter @gafus/core test -- appSubscription
pnpm --filter @gafus/core typecheck
```

## 6. Core: YooKassa app subscription

Навыки: `superpowers:test-driven-development`, `native-data-fetching`, `codex-security:finding-discovery`.

Практики: provider idempotence, no secret logging, amount/currency validation, DB transaction around state changes, no provider call inside long DB transaction.

Времена и зоны:

- Все даты периода/событий сохранять и сравнивать в UTC.
- Сравнения делать по серверному `now` (не клиентскому времени).

Создать:

- `packages/core/src/services/appSubscription/yookassaClient.ts`
- `packages/core/src/services/appSubscription/yookassaSubscriptionService.ts`
- `packages/core/src/services/appSubscription/yookassaWebhookService.ts`
- `packages/core/src/services/appSubscription/yookassaRenewalService.ts`
- `packages/core/src/services/appSubscription/__tests__/yookassaSubscriptionService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/yookassaWebhookService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/yookassaRenewalService.test.ts`

Initial checkout:

```ts
const yookassaAmountRub = settings.yookassaWeeklyPriceRub;
const body = {
  amount: { value: yookassaAmountRub.toFixed(2), currency: "RUB" },
  capture: true,
  save_payment_method: true,
  confirmation: { type: "redirect", return_url: finalReturnUrl },
  description: "Подписка Gafus на 7 дней",
  metadata: {
    kind: "app_subscription",
    localPaymentId: payment.id,
    userId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  },
};
```

Idempotence key for initial:

```ts
const idempotenceKey = `app-subscription:yookassa:initial:${userId}:${periodStart.toISOString()}`;
```

Поведение `startYookassaAppSubscription`:

- Проверить `returnUrl` только `https`.
- Получить settings из `AppSubscriptionSettings.default`.
- Если есть свежий `PENDING` payment с `confirmationUrl` младше 20 минут, вернуть тот же URL.
- Если есть активная YooKassa-подписка, вернуть ошибку `ALREADY_ACTIVE`.
- Создать `AppSubscriptionPayment(PENDING, INITIAL)` с unique `idempotenceKey`, `amount=yookassaAmountRub`, `currency=RUB`.
- Вызвать YooKassa с тем же `Idempotence-Key`.
- Сохранить `yookassaPaymentId`, `confirmationUrl`.
- Не активировать доступ до `payment.succeeded` webhook.

Webhook обработка:

```ts
const providerEventKey = `yookassa:${event}:${object.id}`;

await prisma.appSubscriptionEvent.create({
  data: {
    source: "YOOKASSA",
    eventType: event,
    providerEventKey,
    payloadHash,
    metadata: safeMetadata,
  },
});
```

Если unique violation по `providerEventKey`, загрузить существующий event и применить duplicate event policy ниже.

Уточнение по duplicate event:

- Если duplicate event уже `PROCESSED`, вернуть idempotent success.
- Если duplicate event `RECEIVED/FAILED`, взять row-level lock и повторить обработку.
- Перед обработкой ставить `PROCESSING`, после успешной транзакции `PROCESSED + processedAt`.
- При ошибке ставить `FAILED`, увеличить `processingAttempts`, сохранить безопасный `lastProcessingError` без raw payload/секретов.

На `payment.succeeded`:

- Найти payment по `yookassaPaymentId` или `metadata.localPaymentId`.
- Проверить `amount.value === payment.amount`, `currency === RUB`.
- Для initial проверить `object.payment_method.id` и `object.payment_method.saved === true`.
- Если method не saved, дать первый период, но поставить `cancelAtPeriodEnd=true` и не планировать renewal.
- Upsert `AppSubscription(provider=YOOKASSA)` для user.
- Обновить payment `SUCCEEDED`, period dates.
- Для renewal ставить `currentPeriodEnd = max(existing.currentPeriodEnd, payment.periodEnd)`, чтобы out-of-order webhook не укоротил доступ.
- Нельзя выдавать доступ, если сумма, валюта или localPaymentId не совпали.

Renewal:

```ts
const idempotenceKey =
  `app-subscription:yookassa:renewal:${subscription.id}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
```

Алгоритм worker-safe:

- Выбрать YooKassa subscriptions:
  - `status=ACTIVE`
  - `cancelAtPeriodEnd=false`
  - `yookassaPaymentMethodId != null`
  - `currentPeriodEnd <= now + 12h`
- Для каждой создать `AppSubscriptionPayment(PENDING, RENEWAL)` с unique `idempotenceKey`.
- Если duplicate, skip.
- Вызвать YooKassa с `payment_method_id`, без `confirmation`.
- Webhook подтверждает success.
- При network/provider error: увеличить `attemptCount`, `nextAttemptAt = now + backoff`.
- Если `currentPeriodEnd < now` и успешного renewal нет, статус `PAST_DUE`; доступ false.

Cancel YooKassa:

- `POST /yookassa/cancel` не делает refund.
- Для активной YooKassa subscription ставит `cancelAtPeriodEnd=true`, `canceledAt=now`.
- Доступ сохраняется до `currentPeriodEnd`.
- Worker больше не создает renewal для этой subscription.

Refund/canceled webhook:

- `payment.canceled` для `PENDING INITIAL` -> payment `CANCELED`, access не выдавать.
- `payment.canceled` для `PENDING RENEWAL` -> payment `CANCELED`, subscription остается `ACTIVE` до текущего `currentPeriodEnd`, затем `PAST_DUE`.
- `refund.succeeded` снимает доступ только если refunded payment покрывает текущий активный период и нет другого активного source (`APPLE`, `MANUAL` или более свежий `YOOKASSA` payment).
- Refund старого периода не должен менять текущий `currentPeriodEnd`.

Тесты:

- duplicate initial start возвращает тот же checkout.
- duplicate webhook не продлевает дважды.
- mismatched amount не активирует.
- saved method missing: первый период active, renewal disabled.
- duplicate worker run создает один renewal payment.
- refund current payment снимает доступ, если нет другого active source.
- refund old period не снимает актуальный доступ.
- cancel at period end сохраняет доступ до `currentPeriodEnd` и не создает renewal.

Команды:

```bash
pnpm --filter @gafus/core test -- yookassa
pnpm --filter @gafus/core typecheck
```

## 7. Core: Apple IAP subscription

Навыки: `superpowers:test-driven-development`, `native-data-fetching`, `codex-security:attack-path-analysis`.

Практики: verify signed JWS server-side, validate productId/type/bundle/environment/appAccountToken, transaction id uniqueness, notification dedupe.

Создать:

- `packages/core/src/services/appSubscription/appleVerifier.ts`
- `packages/core/src/services/appSubscription/appleSubscriptionService.ts`
- `packages/core/src/services/appSubscription/appleNotificationService.ts`
- `packages/core/src/services/appSubscription/appleReconciliationService.ts`
- `packages/core/src/services/appSubscription/__tests__/appleSubscriptionService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/appleNotificationService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/appleReconciliationService.test.ts`

Env vars:

```bash
APPLE_BUNDLE_ID=
APPLE_APP_ID=
APPLE_USE_SANDBOX=
APPLE_IAP_PRIVATE_KEY=
APPLE_IAP_KEY_ID=
APPLE_IAP_ISSUER_ID=
```

Использовать существующий `@apple/app-store-server-library`.

Проверка покупки:

- Клиент отправляет `signedTransactionInfo`.
- Сервер `SignedDataVerifier.verifyAndDecodeTransaction`.
- Проверить:
  - `type` auto-renewable subscription.
  - `productId === AppSubscriptionSettings.appleProductId`.
  - `transactionId` exists.
  - `originalTransactionId` exists.
  - `expiresDate` exists and in future.
  - `appAccountToken === user.appleAppAccountToken`.
- Если `transactionId` уже есть у этого же user: idempotent success.
- Если `transactionId` или `originalTransactionId` привязан к другому user: `409 APPLE_TRANSACTION_CONFLICT`.
- Upsert `AppSubscription(provider=APPLE, appleOriginalTransactionId)`.
- `currentPeriodStart` брать из `purchaseDate` (fallback `now`), `currentPeriodEnd` строго из `expiresDate`.
- Создать `AppSubscriptionPayment(SUCCEEDED, provider=APPLE, appleTransactionId unique, idempotenceKey=app-subscription:apple:${transactionId})`.
- Если `price/currency` есть в decoded transaction, сохранить `applePriceMilliunits`, `currency`, `amount = price / 1000`; если нет, платеж остается без суммы, но доступ не зависит от цены.

Тип продукта:

```ts
function isAutoRenewableSubscriptionType(type: unknown): boolean {
  return type === Type.AUTO_RENEWABLE_SUBSCRIPTION ||
    type === "Auto-Renewable Subscription" ||
    type === "Auto-Renewable-Subscription";
}
```

Перед кодингом проверить установленный enum в `node_modules/@apple/app-store-server-library`.

App account token:

- `User.appleAppAccountToken` генерировать server-side через `crypto.randomUUID()`.
- Возвращать только в `GET /offer`.
- Mobile передает его в StoreKit purchase request.
- Не использовать `user.id` как appAccountToken.

Apple notifications:

- Public route принимает `{ signedPayload }`.
- Core вызывает `SignedDataVerifier.verifyAndDecodeNotification`.
- `providerEventKey = apple:${notificationUUID}`.
- Duplicate notification = 200, no-op.
- Decode `signedTransactionInfo` и `signedRenewalInfo`.
- Если `originalTransactionId` неизвестен, сохранить событие как pending metadata, доступ не выдавать.
- Если известен:
  - renewal success ставит `currentPeriodEnd = max(existing.currentPeriodEnd, expiresDate)`, чтобы out-of-order notification не укоротила доступ.
  - expired/revoked/refunded переводит Apple subscription в `EXPIRED/REVOKED/REFUNDED`.
  - cancellation ставит `cancelAtPeriodEnd=true`, но доступ сохраняется до `expiresDate`.
- После успешного `verify/restore`, когда появился `appleOriginalTransactionId`, найти unlinked Apple events для этого `originalTransactionId` и обработать их в порядке `signedDate`.

Apple reconciliation (обязательный fallback):

- Добавить core-задачу сверки статуса через App Store Server API (`Get All Subscription Statuses`) по `appleOriginalTransactionId`.
- Триггеры сверки:
  - по `restore`;
  - по verify, если есть подозрение на устаревший локальный статус;
  - по cron (например, раз в 6 часов) для активных Apple-подписок.
- Если webhook пропущен, reconciliation должна привести локальный статус/periodEnd к фактическому состоянию Apple.

Restore:

- `POST /apple/restore` принимает массив JWS transactions от `expo-iap/getAvailablePurchases` или последний JWS.
- Каждая транзакция проходит тот же verify path.
- Возвращает свежий `status`.

Тесты:

- wrong productId denied.
- wrong appAccountToken denied.
- duplicate transaction same user idempotent.
- duplicate transaction other user conflict.
- notification duplicate no double extension.
- out-of-order renewal notification не укорачивает `currentPeriodEnd`.
- expired notification removes access after period end.

Команды:

```bash
pnpm --filter @gafus/core test -- appleSubscription
pnpm --filter @gafus/core typecheck
```

## 8. API: Hono routes и server-side gates

Навыки: `hono`, `native-data-fetching`, `codex-security:validation`.

Практики: route-level authorization, 402 contract, rate limit payment endpoints, no client-trust.

Создать:

- `apps/api/src/middleware/app-subscription.ts`
- `apps/api/src/routes/v1/app-subscription.ts`
- `apps/api/src/routes/v1/app-subscription.test.ts`

Изменить:

- `apps/api/src/app.ts`
- `apps/api/src/routes/v1/pets.ts`
- `apps/api/src/routes/v1/pet-prevention.ts`
- `apps/api/src/routes/v1/articles.ts`
- `apps/api/src/routes/v1/courses.ts`
- `apps/api/src/routes/v1/training.ts`
- `apps/api/src/routes/v1/daily-course.ts`
- `apps/api/src/routes/v1/exam.ts`
- `apps/api/src/routes/v1/offline.ts`
- `apps/api/src/routes/v1/achievements.ts`
- `apps/api/src/routes/v1/notes.ts`
- `apps/api/src/routes/v1/reminders.ts`
- `apps/api/src/routes/v1/consultations.ts`

Middleware:

```ts
export const requireAppSubscription = createMiddleware(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const isSignedVideoAsset =
    c.req.method === "GET" &&
    /^\/api\/v1\/training\/video\/[^/]+\/(manifest|manifest\.m3u8|segment)$/.test(path);
  if (isSignedVideoAsset) {
    await next();
    return;
  }

  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
  if (!gatingEnabled) {
    await next();
    return;
  }

  const user = c.get("user") as { id: string } | undefined;
  if (!user?.id) {
    return c.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, 401);
  }

  const access = await getAppSubscriptionAccess(user.id);
  if (!access.hasActiveSubscription) {
    return c.json(
      { success: false, error: "Для действия нужна подписка", code: "SUBSCRIPTION_REQUIRED" },
      402,
    );
  }

  await next();
});
```

`app.ts`:

```ts
app.use("/api/v1/app-subscription/*", apiRateLimiter);
app.use("/api/v1/app-subscription/*", authMiddleware);
app.use("/api/v1/app-subscription/yookassa/start", paymentsRateLimiter);
app.use("/api/v1/app-subscription/apple/verify", paymentsRateLimiter);
app.route("/api/v1/app-subscription", appSubscriptionRoutes);
```

`app-subscription` routes регистрировать до gated route groups, чтобы payment/status endpoints не попадали под `requireAppSubscription`.

Gated route groups:

```ts
app.use("/api/v1/articles/*", requireAppSubscription);
app.use("/api/v1/courses/*", requireAppSubscription);
app.use("/api/v1/training/*", requireAppSubscription);
app.use("/api/v1/daily-course/*", requireAppSubscription);
app.use("/api/v1/exam/*", requireAppSubscription);
app.use("/api/v1/offline/*", requireAppSubscription);
app.use("/api/v1/achievements/*", requireAppSubscription);
app.use("/api/v1/notes/*", requireAppSubscription);
app.use("/api/v1/reminders/*", requireAppSubscription);
app.use("/api/v1/consultations/*", requireAppSubscription);
```

Training video исключения:

- `POST /api/v1/training/video/url` остается gated через `requireAppSubscription`: именно этот endpoint выдает signed playback URL.
- `GET /api/v1/training/video/:videoId/manifest(.m3u8)` и `GET /api/v1/training/video/:videoId/segment` не должны падать на JWT/subscription middleware, потому что работают по signed token.
- Для этих GET endpoints защита должна идти через `getVideoAccessService().verifyToken()` и обновленный core `checkVideoAccess`.

Pets:

- Оставить free:
  - `GET /api/v1/pets`
  - `POST /api/v1/pets`
  - `GET /api/v1/pets/:petId`
  - `PUT /api/v1/pets/:petId`
  - `DELETE /api/v1/pets/:petId`
  - `POST /api/v1/pets/:petId/photo`
- Добавить `requireAppSubscription` прямо на handlers:
  - `GET /:petId/documents`
  - `POST /:petId/documents`
  - `PUT /:petId/documents/:documentId`
  - `DELETE /:petId/documents/:documentId`
  - `GET /:petId/documents/:documentId/download`
- В `pet-prevention.ts` повесить middleware на все routes.

Тесты:

- free pet CRUD returns 200 without subscription.
- pet documents return 402 without subscription.
- courses/training/articles return 402 without subscription.
- active manual grant allows.
- payment start routes require auth and are rate-limited.

Команды:

```bash
pnpm --filter @gafus/api test
pnpm --filter @gafus/api typecheck
```

## 9. Web: Next routes, page gates, paywall

Навыки: `next-best-practices`, `vercel-react-best-practices`, `codex-security:validation`.

Практики: RSC/server-side guards for direct URLs, CSRF on POST, client paywall only UX, no secret leakage.

Создать:

- `apps/web/src/shared/lib/app-subscription/server.ts`
- `apps/web/src/shared/lib/app-subscription/client.ts`
- `apps/web/src/features/app-subscription/components/AppSubscriptionPaywall.tsx`
- `apps/web/src/features/app-subscription/components/AppSubscriptionProvider.tsx`
- `apps/web/src/features/app-subscription/components/app-subscription-paywall.module.css`
- API route files from section 3.

Изменить:

- `apps/web/src/app/(main)/layout.tsx`
- `apps/web/src/app/(main)/courses/page.tsx`
- `apps/web/src/app/(main)/trainings/[courseType]/page.tsx`
- `apps/web/src/app/(main)/trainings/[courseType]/[day]/page.tsx`
- `apps/web/src/app/(main)/daily-course/[scheduleId]/page.tsx`
- `apps/web/src/app/(main)/articles/[slug]/page.tsx`
- `apps/web/src/app/(main)/consultations/page.tsx`
- `apps/web/src/app/(main)/consultations/my/page.tsx`
- `apps/web/src/app/(main)/consultations/[cynologistUserId]/page.tsx`
- `apps/web/src/app/(main)/favorites/page.tsx`
- `apps/web/src/app/(main)/achievements/page.tsx`
- `apps/web/src/app/api/v1/offline/course/*/route.ts`
- `apps/web/src/app/api/v1/notifications/step/*/route.ts`
- `apps/web/src/app/api/v1/payments/webhook/route.ts`
- `apps/web/src/app/api/v1/video/playback-url/route.ts`
- user-facing API routes:
  - `apps/web/src/app/api/v1/articles/[slug]/route.ts`
  - `apps/web/src/app/api/v1/articles/[slug]/like/route.ts`
  - `apps/web/src/app/api/v1/courses/favorites/route.ts`
  - `apps/web/src/app/api/v1/training/step/*/route.ts`
  - `apps/web/src/app/api/v1/exam/*/route.ts`
  - `apps/web/src/app/api/v1/pets/[petId]/documents/*/route.ts`
  - `apps/web/src/app/api/v1/pets/[petId]/prevention/route.ts`
  - `apps/web/src/app/api/v1/pets/prevention/route.ts`
  - `apps/web/src/app/api/v1/offline/course/*/route.ts`
  - `apps/web/src/app/api/v1/notifications/step/*/route.ts`
  - `apps/web/src/app/api/v1/consultations/book/route.ts`
  - `apps/web/src/app/api/v1/consultations/bookings/[bookingId]/cancel/route.ts`
  - `apps/web/src/app/api/v1/consultations/my/route.ts`

Server guard:

```ts
export async function requireWebAppSubscription(userId: string) {
  const gatingEnabled = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
  if (!gatingEnabled) {
    return null;
  }

  const access = await getAppSubscriptionAccess(userId);
  if (!access.hasActiveSubscription) {
    redirect("/subscription?required=1");
  }
  return access;
}
```

Web API gates:

- User-facing paid actions return `{ success:false, code:"SUBSCRIPTION_REQUIRED" }` with HTTP `402`.
- Do not gate admin/trainer consultation routes (`/consultations/admin/*`, `/consultations/trainer/*`) with user app subscription.
- Do not gate free profile/account/pet CRUD routes.
- `apps/web/src/app/api/v1/video/playback-url/route.ts` must call `requireWebAppSubscription(session.user.id)` before returning a signed playback URL.

Создать страницу:

- `apps/web/src/app/(main)/subscription/page.tsx`

Web webhook YooKassa:

- Расширить существующий `apps/web/src/app/api/v1/payments/webhook/route.ts`.
- Сначала проверить IP/signature как сейчас.
- По `object.metadata.kind === "app_subscription"` направлять в `handleYookassaAppSubscriptionWebhook`.
- По старым платежам оставить текущие `confirmPaymentFromWebhook/cancel/refund`.
- Provider event persist делать до cache invalidation.
- Не логировать raw body целиком.
- Если webhook пришел по unknown `localPaymentId`/`paymentId`, сохранять event как unlinked и отдавать `200` (чтобы провайдер не бесконечно ретраил), с отдельным warning-логом и метрикой.

Web paywall:

- Кнопка YooKassa start вызывает `/api/v1/app-subscription/yookassa/start` с CSRF.
- Полученный `confirmationUrl` открывать через redirect.
- После return `?subscription=1` refetch status.

Команды:

```bash
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/web lint
pnpm --filter @gafus/web build
```

## 10. Admin panel: price, Apple product, iOS flag, manual grants

Навыки: `next-best-practices`, `prisma-client-api`, `codex-security:validation`.

Практики: least privilege, ADMIN-only mutations, moderator read-only, audit events, zod validation, CSRF/server actions.

Создать:

- `apps/admin-panel/src/shared/lib/actions/appSubscriptionAdminActions.ts`
- `apps/admin-panel/src/features/admin/components/AppSubscriptionSettingsCard.tsx`
- `apps/admin-panel/src/features/users/components/AppSubscriptionGrantCard.tsx`

Изменить:

- `apps/admin-panel/src/app/(main)/main-panel/admin/page.tsx`
- `apps/admin-panel/src/features/admin/components/MobileAppFeaturesCard.tsx`
- `apps/admin-panel/src/shared/lib/actions/mobileAppFeatureFlagsActions.ts`
- `apps/admin-panel/src/features/users/lib/getAllUsers.ts`
- `apps/admin-panel/src/features/users/components/EditUserForm.tsx`
- `apps/admin-panel/src/features/users/components/UsersTable.tsx`
- `packages/core/src/services/adminUser/types.ts`
- `packages/core/src/services/adminUser/adminUserService.ts`

iOS RF card flag:

- Не ломать старый DB key `mobile_ios_ru_card_payment_hint`.
- В core добавить новый semantic alias:
  - `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT = "mobile_ios_ru_card_payment_hint"`
- В public config вернуть оба поля на один релиз:
  - `iosRuCardPaymentEnabled`
  - `iosRuCardPaymentHintEnabled`
- В админке поменять label на “Показывать кнопку «Оплатить картой РФ» на iOS paywall”.
- `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT` сделать ADMIN-only, потому что flag влияет на платежный UX и App Review. Старый VK-login flag можно оставить с текущими правами.

Subscription rollout flags:

- В `MobileAppFeaturesCard` добавить два ADMIN-only переключателя:
  - `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL`: “Показывать paywall подписки”.
  - `APP_FEATURE_APP_SUBSCRIPTION_GATING`: “Блокировать платные действия без подписки”.
- `MODERATOR` может видеть значения этих флагов, но не менять.

Settings validation:

```ts
const settingsSchema = z.object({
  yookassaWeeklyPriceRub: z.coerce.number().min(1).max(100000),
  appleProductId: z.string().trim().min(1).max(255).nullable(),
});
```

Manual grant UI:

- В карточке пользователя показать:
  - current subscription status
  - activeUntil/lifetime/provider
  - manual grant controls только для ADMIN
- Actions:
  - “Оплачено до даты”
  - “Оплачено навсегда”
  - “Снять ручной доступ”
- `MODERATOR`: только read-only summary.

Команды:

```bash
pnpm --filter @gafus/admin-panel typecheck
pnpm --filter @gafus/admin-panel lint
pnpm --filter @gafus/admin-panel build
```

## 11. Mobile: paywall, onboarding trigger, Apple IAP, YooKassa button

Навыки: `vercel-react-native-skills`, `native-data-fetching`, `expo:building-native-ui`, `codex-security:validation`.

Практики: thin client, React Query cache, platform-specific payment flow, finish StoreKit transaction only after server verify, no secrets in app, paywall UX not security boundary.

Создать:

- `apps/mobile/src/features/app-subscription/api/appSubscriptionApi.ts`
- `apps/mobile/src/features/app-subscription/hooks/useAppSubscriptionStatus.ts`
- `apps/mobile/src/features/app-subscription/hooks/useRequireAppSubscription.ts`
- `apps/mobile/src/features/app-subscription/components/AppSubscriptionPaywall.tsx`
- `apps/mobile/src/features/app-subscription/components/AppSubscriptionProvider.tsx`
- `apps/mobile/src/features/app-subscription/lib/appleAppSubscriptionPurchase.ts`
- `apps/mobile/src/features/app-subscription/lib/yookassaAppSubscriptionPurchase.ts`
- `apps/mobile/src/features/app-subscription/store/paywallStore.ts`

Изменить:

- `apps/mobile/app/(main)/_layout.tsx`
- `apps/mobile/app/(main)/(tabs)/courses.tsx`
- `apps/mobile/app/(main)/(tabs)/achievements.tsx`
- `apps/mobile/app/(main)/(tabs)/consultations.tsx`
- `apps/mobile/app/(main)/(tabs)/pets.tsx` (только documents/prevention sections/actions)
- `apps/mobile/app/(main)/articles/[slug].tsx`
- `apps/mobile/app/(main)/daily-course/[scheduleId].tsx`
- `apps/mobile/app/(main)/training/[courseType]/index.tsx`
- `apps/mobile/app/(main)/training/[courseType]/[dayId].tsx`
- `apps/mobile/app/(main)/trainings/[courseType]/index.tsx`
- `apps/mobile/app/(main)/trainings/[courseType]/[day].tsx`
- `apps/mobile/app/(main)/consultations/[userId].tsx`
- `apps/mobile/app/(main)/consultations/booking-confirm.tsx`
- `apps/mobile/app/(main)/consultations/mine.tsx`
- `apps/mobile/app/(main)/reminders.tsx`
- `apps/mobile/src/features/onboarding-tour/TourProvider.tsx`
- `apps/mobile/src/features/onboarding-tour/TourOverlay.tsx`
- `apps/mobile/src/features/courses/components/CourseCard.tsx`
- `apps/mobile/src/shared/lib/api/client.ts`
- `apps/mobile/src/shared/lib/api/public-config.ts`
- API modules for courses, articles, daily-course, consultations, pet documents, pet prevention, reminders, notes, offline, achievements, favorites.
- Не gate базовый pet CRUD.

API client behavior:

- Если API вернул `402/SUBSCRIPTION_REQUIRED`, открыть paywall и вернуть typed error.
- Открывать paywall по `402` только если public config `appSubscriptionPaywallEnabled === true`; иначе вернуть typed error без UI.
- Не повторять автоматически платные mutations после оплаты без явного user action.

Hook:

```ts
export function useRequireAppSubscription() {
  const { data, refetch } = useAppSubscriptionStatus();
  const { data: publicConfig } = useMobileAppPublicConfig();
  const openPaywall = usePaywallStore((s) => s.open);

  return async function requireSubscription() {
    const status = data ?? (await refetch()).data;
    if (!status?.hasActiveSubscription) {
      if (publicConfig?.appSubscriptionPaywallEnabled) {
        openPaywall({ reason: "required" });
      }
      return false;
    }
    return true;
  };
}
```

Apple purchase через `expo-iap`:

```ts
await initConnection();

await fetchProducts({ skus: [offer.appleProductId], type: "subs" });

const raw = await requestPurchase({
  type: "subs",
  request: {
    apple: {
      sku: offer.appleProductId,
      appAccountToken: offer.appleAppAccountToken,
    },
  },
});

const purchase = Array.isArray(raw) ? raw[0] : raw;
const jws = purchase?.purchaseToken?.trim();

const verify = await appSubscriptionApi.verifyAppleSubscription({ signedTransactionInfo: jws });

if (verify.success) {
  await finishTransaction({ purchase, isConsumable: false });
}
```

Важно: `finishTransaction` только после server verify success.

YooKassa на iOS:

- Показывать кнопку только если:
  - `Platform.OS === "ios"`
  - `offer.iosRuCardPaymentEnabled === true`
- В App Review/production default false.
- На Android/Web показывать YooKassa основным способом.

Onboarding:

- После `completeTour()` открыть paywall один раз только если `appSubscriptionPaywallEnabled === true`.
- Если пользователь нажал skip/close, не блокировать free screens, но protected action откроет paywall.
- Добавление питомца в экскурсии остается бесплатным.

Команды:

```bash
pnpm --filter @gafus/mobile test
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile lint
```

## 12. Worker: YooKassa renewals

Навыки: `superpowers:test-driven-development`, `systematic-debugging`, `codex-security:validation`.

Практики: duplicate worker safe, provider idempotency, retry with backoff, no concurrent double charge.

Мульти-инстанс защита:

- Добавить distributed lock на запуск renewal job (Postgres advisory lock или Redis lock с TTL).
- Если lock не получен, текущий запуск пропускается без ошибки.

Изменить:

- `packages/worker/src/cron-scheduler.ts`
- `packages/worker/src/index.ts`

Создать:

- `packages/worker/src/app-subscription-renewals.ts`
- `packages/worker/src/app-subscription-renewals.test.ts`

Cron:

```ts
cron.schedule("*/15 * * * *", async () => {
  await processDueYookassaAppSubscriptionRenewals({ batchSize: 100 });
});
```

Правила:

- Worker не считает доступ сам, только вызывает core.
- Core создает `AppSubscriptionPayment` с unique `idempotenceKey` до provider call.
- При duplicate key worker пропускает.
- При provider/network error retry по `nextAttemptAt`.
- После `attemptCount >= 5` и истекшего `currentPeriodEnd` статус `PAST_DUE`.
- Batch processing делать с pagination/cursor (не через большой offset), чтобы на росте данных не деградировать.

Команды:

```bash
pnpm --filter @gafus/worker test
pnpm --filter @gafus/worker typecheck
pnpm --filter @gafus/worker build
```

## 13. Безопасность: обязательный чеклист перед merge

Навыки: `codex-security:security-scan`, `codex-security:finding-discovery`, `codex-security:validation`, `superpowers:verification-before-completion`.

Проверить вручную и тестами:

- В БД не сохраняются PAN/CVV/cardholder. Только YooKassa `payment_method.id`, Apple transaction ids.
- В логах нет `YOOKASSA_SECRET_KEY`, Basic auth, Apple private key, raw JWS, purchaseToken, webhook raw body.
- Web POST routes защищены CSRF.
- Payment start/verify routes rate-limited.
- YooKassa webhook: IP allowlist + signature when present + event dedupe.
- Apple notification: signedPayload verify + notificationUUID dedupe.
- Client не может сам выдать себе доступ: все grants только server/core.
- Manual grants только ADMIN.
- Moderator не может вызвать manual grant action.
- Direct URLs в web закрыты server-side.
- API direct calls закрыты middleware/core.
- Amount/currency/productId/type проверяются до выдачи доступа.
- Duplicate webhook/worker/client retry не продлевает и не списывает дважды.
- Refund/revoke/cancel не ломают другие активные источники доступа.
- Existing course/article payments still work.
- Все cron/jobs и webhook handlers логируют только безопасные поля (без секретов и raw payloads).

Observability минимум:

- Метрики: `app_subscription_active_total`, `app_subscription_past_due_total`, `renewal_attempt_total`, `renewal_failed_total`, `webhook_duplicate_total`.
- Алерт: резкий рост `renewal_failed_total` и `webhook_duplicate_total` за 15 минут.

Security scan command sequence:

```bash
pnpm --filter @gafus/core test -- appSubscription
pnpm --filter @gafus/api test
pnpm --filter @gafus/worker test
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/admin-panel typecheck
pnpm --filter @gafus/mobile typecheck
```

## 14. Финальная verification matrix

После каждого крупного шага запускать локальные targeted tests. После всей реализации:

```bash
pnpm --filter @gafus/prisma db:generate
pnpm --filter @gafus/core test
pnpm --filter @gafus/api test
pnpm --filter @gafus/worker test
pnpm --filter @gafus/mobile test
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/admin-panel typecheck
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/worker typecheck
pnpm --filter @gafus/web build
pnpm --filter @gafus/admin-panel build
pnpm --filter @gafus/api build
pnpm --filter @gafus/worker build
```

Manual acceptance scenarios:

- Новый пользователь проходит экскурсию, видит paywall.
- Новый пользователь закрывает paywall, может открыть профиль и создать питомца.
- Без подписки попытка открыть курс/статью/документы питомца возвращает 402 и открывает paywall.
- Admin ставит paid until, пользователь сразу получает доступ.
- Admin ставит lifetime, доступ есть без activeUntil.
- Admin clear manual не удаляет Apple/YooKassa доступ.
- Android YooKassa initial payment после webhook дает 7 дней.
- Duplicate YooKassa webhook не продлевает дважды.
- YooKassa renewal worker duplicate run не создает второй charge.
- iOS Apple IAP покупка: StoreKit sheet, server verify, finish transaction, доступ активен.
- iOS RF card button hidden by default, appears only after admin flag.
- Apple notification renewal продлевает период.
- Apple expired/revoked убирает доступ после конца периода.
- Existing one-time course/article payment webhook still works.

Rollback и rollout:

- Rollout через feature toggle:
  - `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL` (UI paywall);
  - `APP_FEATURE_APP_SUBSCRIPTION_GATING` (включает 402 для gated scope);
  - `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT` (UI-only кнопка YooKassa на iOS).
- Порядок включения:
  1. Деплой схемы и кода с toggle=off.
  2. Проверка webhook/verify flows на staging.
  3. Включить `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL`.
  4. Включить `APP_FEATURE_APP_SUBSCRIPTION_GATING` в production только после staging smoke; текущая модель `AppFeatureFlag` boolean, cohort rollout не планируется в v1.
  5. `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT` включать только отдельным решением.
- Rollback:
  - Сначала выключить `APP_FEATURE_APP_SUBSCRIPTION_GATING`.
  - Затем выключить `APP_FEATURE_APP_SUBSCRIPTION_PAYWALL`.
  - `APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT` выключать независимо, если есть риск App Review/payment UX.
  - Миграции не откатывать автоматически; использовать forward-fix.

## 15. Что не удалять

Не удалять в v1:

- `packages/core/src/services/payments/paymentService.ts`
- `packages/core/src/services/payments/appleIapCourseService.ts`
- `apps/api/src/routes/v1/payments.ts`
- `apps/web/src/app/api/v1/payments/create/route.ts`
- существующие модели `Payment`, `ArticlePayment`, `CourseAccess`

Причина: это production history и действующие разовые оплаты. Новая app subscription добавляется параллельно и закрывает доступ на уровне приложения.

## 16. Execution Notes (факт выполнения)

### Шаг 4 (Prisma)
- Выполнено: добавлены `AppSubscription*` модели/enums, связи в `User`, SQL-миграция `20260510235500_add_app_subscription` с CHECK/partial-unique/indexes.
- Команды: `pnpm --filter @gafus/prisma db:generate`, `pnpm --filter @gafus/core typecheck`.
- Ограничения: runtime rollout миграции на prod/staging не выполнялся в этой сессии.

### Шаг 5 (Core access/settings/admin grants)
- Выполнено: создан модуль `services/appSubscription` (types/errors/access/settings/admin/payment/appleAccountToken), добавлены `SubscriptionRequiredError` и ADMIN manual grants (`paid_until/lifetime/clear`).
- Команды: `pnpm --filter @gafus/core typecheck`.
- Ограничения: часть Prisma typing работает через `(prisma as any)` из-за текущей генерации типов в workspace.

### Шаг 6 (Core YooKassa app subscription)
- Выполнено: базовый start/cancel flow + webhook handler `handleYookassaAppSubscriptionWebhook` с event dedupe через `AppSubscriptionEvent.providerEventKey`.
- Команды: `pnpm --filter @gafus/core typecheck`.
- Ограничения: полноценный provider retry/backoff orchestration (5xx/network) требует отдельного hardening шага.

### Шаг 7 (Core Apple IAP subscription)
- Выполнено: server verify/restore, decode JWS transaction, update subscription/payment, notification handling (`signedPayload`) + dedupe по `notificationUUID`.
- Команды: `pnpm --filter @gafus/core typecheck`.
- Ограничения: restore по App Store Server API history endpoint не добавлялся (используется transaction/DB-driven restore).

### Шаг 8 (API Hono)
- Выполнено: добавлены `/api/v1/app-subscription/*` в `apps/api` и подключены в `app.ts`.
- Команды: `pnpm --filter @gafus/api typecheck`, `pnpm --filter @gafus/api build`.
- Ограничения: advanced rate-limit policy per-route (provider-sensitive buckets) не детализирована.

### Шаг 9 (Web gates/paywall/routes)
- Выполнено: server helper `requireWebAppSubscription*`, страница `/subscription`, web API `/api/v1/app-subscription/*`, массовое внедрение `402` в user-facing paid routes, webhook branching по `metadata.kind=app_subscription`.
- Команды: `pnpm --filter @gafus/web typecheck`, `pnpm --filter @gafus/web build`.
- Ограничения: часть UX paywall-компонентов минималистична (функционально, без финального прод-дизайна).

### Шаг 10 (Admin panel)
- Выполнено: ADMIN actions для rollout flags, iOS payment flag, manual grants API/UI, settings card (weekly price + appleProductId).
- Команды: `pnpm --filter @gafus/admin-panel typecheck`, `pnpm --filter @gafus/admin-panel lint`.
- Ограничения: нет отдельного audit-экрана; аудит фиксируется в БД через subscription/event updates.

### Шаг 11 (Mobile)
- Выполнено: feature slice `app-subscription` (api/hooks/store/provider/paywall/lib), public config расширен, `apiClient` открывает paywall на `402/SUBSCRIPTION_REQUIRED`.
- Команды: `pnpm --filter @gafus/mobile typecheck`.
- Ограничения: не все экраны получили явные guard-hooks; часть покрытия идёт через server/API 402 boundary.

### Шаг 12 (Worker renewals)
- Выполнено: renewal batch job + cron `*/15 * * * *`, advisory lock (`pg_try_advisory_lock`), тесты обновлены.
- Дополнительно: добавлен lifecycle-переход `attemptCount >= 5` для `YOOKASSA RENEWAL` в `PAST_DUE`, если период уже истек.
- Команды: `pnpm --filter @gafus/worker test -- app-subscription-renewals.test.ts`, `pnpm --filter @gafus/worker typecheck`, `pnpm --filter @gafus/worker build`.
- Ограничения: external retry orchestration у самого payment provider (повтор внешнего API-вызова с централизованным backoff/jitter) остается отдельным production-hardening этапом.

### Шаг 13 (Security + observability)
- Выполнено: CSRF сохранён на user POST routes, webhook dedupe, log-safe handling, добавлены metrics endpoint `/metrics` в worker и метрики `app_subscription_active_total`, `app_subscription_past_due_total`, `renewal_attempt_total`, `renewal_failed_total`, `webhook_duplicate_total`.
- Команды: `pnpm --filter @gafus/worker typecheck`, `pnpm --filter @gafus/core typecheck`.
- Ограничения: алерты (15m spike) в external monitoring system не настраивались в этой сессии.
