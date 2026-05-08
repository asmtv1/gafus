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

## 3. Новые публичные контракты

### Core exports

Создать `packages/core/src/services/appSubscription/index.ts` и экспортировать из `packages/core/package.json`:

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

## 4. Prisma-схема и миграция

Навыки для шага: `prisma-cli`, `prisma-client-api`, `codex-security:threat-model`, `superpowers:test-driven-development`.

Практики: отдельные таблицы для новой платежной области, no PAN/card data, unique constraints для идемпотентности, audit trail, миграция без выдачи бесплатного доступа существующим пользователям.

Изменить `packages/prisma/schema.prisma`.

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

  amountRub Decimal @db.Decimal(10, 2)
  currency String @default("RUB") @db.VarChar(3)

  periodStart DateTime?
  periodEnd DateTime?

  idempotenceKey String @unique
  yookassaPaymentId String? @unique
  appleTransactionId String? @unique
  appleOriginalTransactionId String?

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
  providerEventKey String? @unique
  idempotencyKey String? @unique
  payloadHash String?
  actorId String?
  actor User? @relation("AppSubscriptionEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  metadata Json?

  processedAt DateTime?
  createdAt DateTime @default(now())

  @@index([source, eventType, createdAt])
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

Команды после шага:

```bash
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

Тесты:

```bash
pnpm --filter @gafus/core test -- appSubscription
pnpm --filter @gafus/core typecheck
```

## 6. Core: YooKassa app subscription

Навыки: `superpowers:test-driven-development`, `native-data-fetching`, `codex-security:finding-discovery`.

Практики: provider idempotence, no secret logging, amount/currency validation, DB transaction around state changes, no provider call inside long DB transaction.

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
const body = {
  amount: { value: amountRub.toFixed(2), currency: "RUB" },
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
- Создать `AppSubscriptionPayment(PENDING, INITIAL)` с unique `idempotenceKey`.
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

Если unique violation по `providerEventKey`, вернуть idempotent success.

На `payment.succeeded`:

- Найти payment по `yookassaPaymentId` или `metadata.localPaymentId`.
- Проверить `amount.value === payment.amountRub`, `currency === RUB`.
- Для initial проверить `object.payment_method.id` и `object.payment_method.saved === true`.
- Если method не saved, дать первый период, но поставить `cancelAtPeriodEnd=true` и не планировать renewal.
- Upsert `AppSubscription(provider=YOOKASSA)` для user.
- Обновить payment `SUCCEEDED`, period dates.
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

Тесты:

- duplicate initial start возвращает тот же checkout.
- duplicate webhook не продлевает дважды.
- mismatched amount не активирует.
- saved method missing: первый период active, renewal disabled.
- duplicate worker run создает один renewal payment.
- refund current payment снимает доступ, если нет другого active source.

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
- `packages/core/src/services/appSubscription/__tests__/appleSubscriptionService.test.ts`
- `packages/core/src/services/appSubscription/__tests__/appleNotificationService.test.ts`

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
- Создать `AppSubscriptionPayment(SUCCEEDED, provider=APPLE, appleTransactionId unique)`.

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
  - renewal success продлевает `currentPeriodEnd`.
  - expired/revoked/refunded переводит Apple subscription в `EXPIRED/REVOKED/REFUNDED`.
  - cancellation ставит `cancelAtPeriodEnd=true`, но доступ сохраняется до `expiresDate`.

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
app.use("/api/v1/app-subscription/*", authMiddleware);
app.use("/api/v1/app-subscription/yookassa/start", paymentsRateLimiter);
app.use("/api/v1/app-subscription/apple/verify", paymentsRateLimiter);
app.route("/api/v1/app-subscription", appSubscriptionRoutes);
```

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

Server guard:

```ts
export async function requireWebAppSubscription(userId: string) {
  const access = await getAppSubscriptionAccess(userId);
  if (!access.hasActiveSubscription) {
    redirect("/subscription?required=1");
  }
  return access;
}
```

Создать страницу:

- `apps/web/src/app/(main)/subscription/page.tsx`

Web webhook YooKassa:

- Расширить существующий `apps/web/src/app/api/v1/payments/webhook/route.ts`.
- Сначала проверить IP/signature как сейчас.
- По `object.metadata.kind === "app_subscription"` направлять в `handleYookassaAppSubscriptionWebhook`.
- По старым платежам оставить текущие `confirmPaymentFromWebhook/cancel/refund`.
- Provider event persist делать до cache invalidation.
- Не логировать raw body целиком.

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
- Доступ к изменению flag оставить как у текущих mobile flags, если бизнес хочет MODERATOR. Но manual grants и цена только ADMIN.

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
- `apps/mobile/src/features/onboarding-tour/TourProvider.tsx`
- `apps/mobile/src/features/onboarding-tour/TourOverlay.tsx`
- `apps/mobile/src/shared/lib/api/client.ts`
- `apps/mobile/src/shared/lib/api/public-config.ts`
- actions/screens for courses, articles, daily-course, consultations, pet documents, pet prevention, reminders, notes, offline, achievements.
- Не gate базовый pet CRUD.

API client behavior:

- Если API вернул `402/SUBSCRIPTION_REQUIRED`, открыть paywall и вернуть typed error.
- Не повторять автоматически платные mutations после оплаты без явного user action.

Hook:

```ts
export function useRequireAppSubscription() {
  const { data, refetch } = useAppSubscriptionStatus();
  const openPaywall = usePaywallStore((s) => s.open);

  return async function requireSubscription() {
    const status = data ?? (await refetch()).data;
    if (!status?.hasActiveSubscription) {
      openPaywall({ reason: "required" });
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

- После `completeTour()` открыть paywall один раз.
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

## 15. Что не удалять

Не удалять в v1:

- `packages/core/src/services/payments/paymentService.ts`
- `packages/core/src/services/payments/appleIapCourseService.ts`
- `apps/api/src/routes/v1/payments.ts`
- `apps/web/src/app/api/v1/payments/create/route.ts`
- существующие модели `Payment`, `ArticlePayment`, `CourseAccess`

Причина: это production history и действующие разовые оплаты. Новая app subscription добавляется параллельно и закрывает доступ на уровне приложения.
