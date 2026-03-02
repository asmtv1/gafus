# Поток данных

## Источники данных по клиентам

| Клиент | Источник | Вызов core |
|--------|----------|------------|
| **Web** | Server Components, Server Actions, Route Handlers | напрямую |
| **Mobile** | api.gafus.ru (REST) | через apps/api |
| **Trainer-panel** | Server Components, Server Actions | напрямую |
| **Admin-panel** | Server Actions, Route Handlers | напрямую |

## Схема

```
┌─────────────┐                    ┌─────────────┐
│   Browser   │                    │   Mobile    │
│  (Web App)  │                    │     App     │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ SSR / SA / fetch                 │ REST
       ▼                                  ▼
┌─────────────┐                    ┌─────────────┐
│  apps/web   │                    │  apps/api   │
│ NextAuth    │                    │    JWT      │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       └──────────────┬───────────────────┘
                      │
                      ▼
               ┌─────────────┐
               │ @gafus/core │
               └─────────────┘
```

**Web и api вызывают core напрямую.** Проксирование web → api — только для password-reset-request (единый эндпоинт для web и mobile).

## Аутентификация

| Клиент | Механизм | Пакет |
|--------|----------|-------|
| Web | NextAuth (session, cookies) | @gafus/auth |
| Mobile | JWT (access + refresh) | @gafus/auth |
| Trainer/Admin | NextAuth | @gafus/auth |

Оба используют `@gafus/auth` и core там, где нужна доменная логика (register, password-reset).

## Когда что вызывать

- **Server Component** — вызов core напрямую для данных страницы.
- **Server Action** — валидация → core → revalidatePath/revalidateTag.
- **Route Handler** — только там, где нужен JSON (React Query, fetch). Патерн: validate → core → JSON response.
- **Web не дублирует эндпоинты api** — оба вызывают одни и те же функции core.
