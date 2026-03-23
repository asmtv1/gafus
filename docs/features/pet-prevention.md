# Журнал профилактики питомца

## Обзор

Приватный журнал учёта прививок, глистогонки и обработок от клещей/блох. Один питомец — один журнал. Доступ только у владельца (`pet.ownerId`).

## Модели и типы

- **PetPreventionType:** `VACCINATION`, `DEWORMING`, `TICKS_FLEAS`
- **PetPreventionEntry:** id, petId, ownerId, type, performedAt, productName?, notes?, clientId? (UUID для идемпотентности batch sync), createdAt, updatedAt
- **Уникальный индекс:** `@@unique([petId, clientId])` — PostgreSQL допускает множественные NULL в unique; batch endpoint всегда требует clientId.

## Реализация

### packages/core (petPrevention service)

- **createEntry**, **updateEntry**, **deleteEntry**, **getEntriesByPet** — CRUD
- **upsertPreventionEntriesBatch** — batch upsert в `$transaction` для mobile offline sync; идемпотентность по `(petId, clientId)`
- Zod-схемы в `schemas.ts`

### apps/api (Hono)

- `GET /api/v1/pets/:petId/prevention` — список
- `POST /api/v1/pets/:petId/prevention` — создание
- `PUT /api/v1/pets/:petId/prevention/:entryId` — обновление
- `DELETE /api/v1/pets/:petId/prevention/:entryId` — удаление
- `POST /api/v1/pets/:petId/prevention/batch` — batch upsert (max 50 записей)

### apps/web

- **Server Actions** в `shared/lib/pet-prevention/` — create, update, delete, get
- **Feature** `features/pet-prevention/` — PreventionEntryList, PreventionEntryForm
- **Страница** `/profile/pets/[petId]/prevention`
- **Ссылка** в PetCard → «Журнал профилактики»

### apps/mobile

- **API** `petsApi.getPreventionEntries`, `addPreventionEntry`, `batchUpsertPreventionEntries`
- **Offline:** preventionSyncStore, usePreventionSyncOnReconnect, SyncPreventionOnReconnect
- **Экран** `/pets/[id]/prevention` — список + добавление
- **Ссылка** из профиля питомцев

### Worker — напоминания

- **Очередь:** petPreventionReminderQueue
- **Cron:** 09:00 MSK (ежедневно)
- **Логика:** по последней записи по типу + интервал из env → push через createImmediatePushNotification

**Env-переменные:**

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| PET_PREVENTION_VACCINATION_DAYS | 365 | Интервал для прививки (дней) |
| PET_PREVENTION_DEWORMING_DAYS | 90 | Интервал для глистогонки |
| PET_PREVENTION_TICKS_FLEAS_DAYS | 30 | Интервал для клещей/блох |

## Безопасность

- Auth: JWT (API), getCurrentUserId (web Server Actions)
- Ownership: `pet.ownerId === userId` в core
- Batch size: max 50, Zod-валидация

**Обработка ошибок:** Zod- и Prisma-сообщения не утекают клиенту. В core, API и web lib все catch используют: `ZodError` → `"Неверные данные"`; Prisma через `handlePrismaError` → типизированные русские строки; прочие → фиксированные fallback. Issues и полный контекст логируются серверно; клиенту — только безопасные строки.
