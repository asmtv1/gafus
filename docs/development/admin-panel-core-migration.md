# Миграция бизнес-логики admin-panel в @gafus/core

## Обзор

Серверная бизнес-логика admin-panel перенесена из `apps/admin-panel` в пакет **@gafus/core**. В приложении остаются: проверка сессии/роли, Zod-валидация FormData/JSON, вызов сервисов core и инвалидация кэша. **Prisma удалён из admin-panel** — все обращения к БД идут через core.

## Новые сервисы в core

| Сервис | Путь | Функции |
|--------|------|---------|
| **adminUser** | `services/adminUser` | getAllUsers, updateUserAdmin, deleteUserAdmin |
| **adminPurchase** | `services/adminPurchase` | getAllPurchases |
| **adminReengagement** | `services/adminReengagement` | getReengagementMetrics |
| **adminPresentation** | `services/adminPresentation` | getPresentationStats |
| **adminStorage** | `services/adminStorage` | getStorageStats |
| **adminBroadcast** | `services/adminBroadcast` | sendBroadcastPush |

## Примеры использования

### adminUser

```typescript
import {
  getAllUsers,
  updateUserAdmin,
  deleteUserAdmin,
} from "@gafus/core/services/adminUser";

// Server Action (auth — в приложении)
const result = await getAllUsers();
if (result.success) return result.data;

const updateResult = await updateUserAdmin(userId, {
  username: "newName",
  phone: "+79001234567",
  role: "MODERATOR",
  newPassword: "secret123",
  isConfirmed: true, // статус подтверждения телефона (админ может переключать вручную)
});

const deleteResult = await deleteUserAdmin(userId, actorId);
// deleteUserAdmin возвращает { success: false, error } при попытке удалить себя
```

### adminPurchase, adminStorage, adminReengagement, adminPresentation

```typescript
import { getAllPurchases } from "@gafus/core/services/adminPurchase";
import { getStorageStats } from "@gafus/core/services/adminStorage";
import { getReengagementMetrics } from "@gafus/core/services/adminReengagement";
import { getPresentationStats } from "@gafus/core/services/adminPresentation";

// Все возвращают { success: true, data } | { success: false, error }
const purchases = await getAllPurchases();
const storage = await getStorageStats();
const metrics = await getReengagementMetrics();
const stats = await getPresentationStats();
```

### adminBroadcast

```typescript
import { sendBroadcastPush } from "@gafus/core/services/adminBroadcast";

const result = await sendBroadcastPush(
  "Заголовок",
  "Текст уведомления",
  "https://example.com"
);
// result: { success, totalUsers, sentCount, failedCount, error? }
```

### Cache tags (для invalidateAllCache)

```typescript
import { ADMIN_CACHE_ALL_TAGS } from "@gafus/core/services/cache";
import { revalidateTag } from "next/cache";

for (const tag of ADMIN_CACHE_ALL_TAGS) {
  revalidateTag(tag);
}
```

## Границы миграции

- **Auth**: проверка сессии и роли (ADMIN/MODERATOR) — только в приложении.
- **Инвалидация кэша**: `revalidatePath`, `revalidateTag` — в приложении. Core экспортирует `CACHE_TAGS` и `ADMIN_CACHE_ALL_TAGS`.
- **triggerScheduler**: без изменений — делегирует в `@gafus/reengagement.manualTriggerScheduler`.

## Breaking changes

- **admin-panel**: `@gafus/prisma` удалён из зависимостей. Нельзя импортировать `prisma` напрямую.
- **getStorageStats**: сигнатура изменена с throw на `{ success, data?, error }`.
- Типы (`AdminUserRow`, `AdminPurchaseRow` и т.д.) теперь экспортируются из соответствующих сервисов core.

## Миграция других приложений

Для переноса логики в core по аналогии с admin-panel:

1. Создать сервис в `packages/core/src/services/<name>/`.
2. Перенести Prisma-запросы и бизнес-правила в core (без auth, session, revalidatePath).
3. Вернуть `{ success, data? } | { success: false, error }`.
4. В app: оставить auth, Zod-валидацию, вызов core, revalidatePath/revalidateTag.
5. Добавить экспорт в `packages/core/src/services/index.ts` и в `package.json` exports.
6. Обновить зависимость: добавить `@gafus/core`, удалить прямой импорт `@gafus/prisma` после полной миграции.

## Шаги верификации

```bash
pnpm --filter @gafus/core build
pnpm --filter @gafus/admin-panel build
pnpm run lint
```

Ручные проверки:
- Users CRUD (getAllUsers, updateUser, deleteUser), deleteUser — попытка удалить себя возвращает ошибку
- Purchases: список, Decimal-поля корректно
- Reengagement, Presentation, Broadcasts, Storage — загрузка метрик/статистики
- Cache invalidation: invalidateCourses, invalidateAll
- API PUT /api/users/[id]: успех и 400 при невалидных данных

## См. также

- [docs/architecture/admin-panel-layers.md](../architecture/admin-panel-layers.md)
- [docs/apps/admin-panel.md](../apps/admin-panel.md)
- [docs/packages/core.md](../packages/core.md)
