# Admin Panel — слои архитектуры

## Обзор

Admin Panel построен как тонкий слой поверх `@gafus/core`. Бизнес-логика находится в core, приложение отвечает за авторизацию, валидацию входных данных и инвалидацию кэша Next.js.

## Диаграмма слоёв

```
┌─────────────────────────────────────────────────────────────────────┐
│ Admin Panel (Next.js)                                                │
│ • Server Actions (features/*/lib/)                                   │
│ • API routes (app/api/users/[id]/route.ts)                           │
│ • RSC страницы (page.tsx)                                            │
├─────────────────────────────────────────────────────────────────────┤
│ Ответственность:                                                     │
│ • getServerSession(authOptions) — проверка сессии                    │
│ • Проверка роли ADMIN / MODERATOR                                    │
│ • Zod-валидация FormData / JSON body                                 │
│ • revalidatePath / revalidateTag                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ вызов сервисов
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ @gafus/core (services/adminUser, adminPurchase, adminReengagement,   │
│              adminPresentation, adminStorage, adminBroadcast)        │
├─────────────────────────────────────────────────────────────────────┤
│ Ответственность:                                                     │
│ • Prisma-запросы                                                     │
│ • Бизнес-правила (например: нельзя удалить себя)                     │
│ • Без auth/session, без Next.js API                                  │
│ • Возврат { success, data? } | { success: false, error }             │
└─────────────────────────────────────────────────────────────────────┘
```

## Соответствие feature → core service

| Admin Panel feature    | Core service         | Server Action / API              |
|------------------------|----------------------|----------------------------------|
| Пользователи           | adminUser            | getAllUsers, updateUser, deleteUser, PUT /api/users/[id] |
| Покупки                | adminPurchase        | getAllPurchases                  |
| Re-engagement          | adminReengagement    | getReengagementMetrics           |
| Презентация (статистика) | adminPresentation  | getPresentationStats             |
| Хранилище              | adminStorage         | getStorageStats                  |
| Push-рассылка          | adminBroadcast       | sendBroadcastPush                |
| Кэш                    | cache (CACHE_TAGS)   | invalidateCoursesCache, invalidateAllCache |

## Пример вызова из Server Action

```typescript
// apps/admin-panel/src/features/users/lib/getAllUsers.ts
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@gafus/auth";
import { getAllUsers as getAllUsersFromCore } from "@gafus/core/services/adminUser";

export async function getAllUsers() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") redirect("/");

  const result = await getAllUsersFromCore();
  if (!result.success) throw new Error(result.error);
  return result.data;
}
```

## Что не перенесено

- **triggerScheduler** — остаётся в admin-panel; делегирует в `@gafus/reengagement.manualTriggerScheduler`. Проверка auth — в приложении, бизнес-логики для переноса нет.
- **revalidatePath / revalidateTag** — специфично для Next.js, выполняется в приложении.

## См. также

- [docs/development/admin-panel-core-migration.md](../development/admin-panel-core-migration.md) — детали миграции, примеры, breaking changes
- [docs/apps/admin-panel.md](../apps/admin-panel.md)
- [docs/packages/core.md](../packages/core.md)
