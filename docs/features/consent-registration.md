# Consent at Registration — согласие при регистрации

## Обзор

При регистрации пользователь даёт согласие на три документа. Согласия сохраняются в `ConsentLog` (по одной записи на каждый тип) для аудита и соответствия GDPR.

**Документы:**
- Согласие на обработку персональных данных — `PERSONAL_DATA` (`/personal.html`)
- Политика конфиденциальности — `PRIVACY_POLICY` (`/policy.html`)
- Согласие на размещение данных в публичном профиле — `DATA_DISTRIBUTION` (`/personal-distribution.html`)

## Flow

1. **RegisterForm** генерирует `tempSessionId` (`crypto.randomUUID()`) при монтировании.
2. При отправке формы вызывается `registerUserAction(name, phone, password, tempSessionId, consentPayload)`.
3. Server Action:
   - Валидирует данные (Zod) и rate limit
   - `createConsentLogs()` — создаёт 3 записи в `ConsentLog` со статусом `PENDING`
   - `registerUserService()` — создаёт пользователя
   - При успехе: `linkConsentLogsToUser()` → `status: COMPLETED`, `userId` заполняется
   - При ошибке: `markConsentLogsFailed()` → `status: FAILED`

## Компоненты

| Компонент | Роль |
|-----------|------|
| `apps/web/src/shared/constants/consent.ts` | `CONSENT_DOCUMENTS`, `CONSENT_VERSION` |
| `apps/web/src/shared/lib/validation/authSchemas.ts` | `consentPayloadSchema`, `tempSessionIdSchema` |
| `apps/web/src/shared/server-actions/auth.ts` | `registerUserAction` с consent flow |
| `apps/web/src/app/(auth)/register/RegisterForm.tsx` | `tempSessionId` (useState), передача consent в action |
| `@gafus/core/services/consent` | `createConsentLogs`, `linkConsentLogsToUser`, `markConsentLogsFailed` |
| `@gafus/prisma` | `ConsentLog`, `ConsentType`, `ConsentLogStatus` |

## API сервиса согласий

```typescript
import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "@gafus/core/services/consent";

// Создание записей (PENDING)
await createConsentLogs({
  tempSessionId,
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
  formData: { name, phone },
  ipAddress,
  userAgent,
  defaultVersion: CONSENT_VERSION,
});

// После успешной регистрации
await linkConsentLogsToUser(tempSessionId, userId);

// При ошибке регистрации
await markConsentLogsFailed(tempSessionId);
```

## Mobile и API

API `POST /api/v1/auth/register` принимает `tempSessionId` (UUID) и `consentPayload` (три required `true`). Mobile-приложение отправляет согласия аналогично вебу; flow согласий идентичен: createConsentLogs → registerUser → linkConsentLogsToUser. Для API используется env `CONSENT_VERSION` (default `"v1.0 2026-02-13"`).

**API contract:**

```json
{
  "name": "string (3-50, a-zA-Z0-9_)",
  "phone": "string (E.164)",
  "password": "string (min 8, upper/lower/digit)",
  "tempSessionId": "UUID",
  "consentPayload": {
    "acceptPersonalData": true,
    "acceptPrivacyPolicy": true,
    "acceptDataDistribution": true
  }
}
```

## Переменные окружения

- `CONSENT_VERSION` — версия документов (по умолчанию `v1.0 2026-02-13`)
- `CONSENT_CLEANUP_DAYS` — возраст записей для очистки (1–365 дней, по умолчанию 90)

## Очистка ConsentLog

Фоновая задача (BullMQ) ежедневно удаляет «сиротские» записи в статусе FAILED:

- **Расписание**: 02:00 MSK (Europe/Moscow)
- **Критерии**: `status = FAILED`, `userId = null`, `createdAt` старше `CONSENT_CLEANUP_DAYS` (по умолчанию 90 дней)
- **Сервис**: `deleteOldFailedConsentLogs()` в `@gafus/core/services/consent`
- **Очередь**: `consentLogCleanupQueue` из `@gafus/queues`
- **Worker**: `startConsentLogCleanupWorker()`, `setupConsentLogCleanupSchedule()` в `@gafus/worker`

Соответствует принципу data minimization (GDPR): удаляются только orphaned FAILED-логи без привязки к пользователю.

## Связанные документы

- [Cookie Consent Banner](cookie-consent.md) — отдельный flow для cookies (localStorage)
- [@gafus/core](../packages/core.md) — consent service, deleteOldFailedConsentLogs
- [@gafus/prisma](../packages/prisma.md) — ConsentLog, ConsentType, ConsentLogStatus
- [@gafus/worker](../packages/worker.md) — consent-log-cleanup воркер и расписание
