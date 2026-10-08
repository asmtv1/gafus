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

## Чат

Web Route Handlers и Hono routes вызывают общий серверный адаптер `@gafus/chat-server`.
Адаптер разбирает HTTP-запросы, ограничивает их размер и частоту, принимает multipart
во временный файл и формирует HTTP-ответы. Он не принимает решения о подписке,
принадлежности диалога или правах модерации.

`@gafus/core/services/cynologistChat` получает идентификатор авторизованного пользователя
и данные операции. Core проверяет доступ, подписку, бан, автора сообщения, канал,
временное окно изменения, содержимое вложений и идемпотентность отправки.
Загрузка вложения в core принимает серверный временный файл; HTTP Request туда не передаётся.
Адаптер удаляет временный файл как при успехе, так и при ошибке.

Чистая политика действий над своими сообщениями и лимиты находятся в
`@gafus/consultation-shared`: web/mobile используют их для интерфейса, core — для
обязательной проверки. DTO модерации содержит `canBan`, вычисленный core по данным
пользователя в БД; клиент не определяет это право по отображаемому имени Stream.

Клиенты читают сообщения и события через Stream SDK с ролью читателя.
Доменное изменение сообщений, реакций, вложений и модерация проходят через GAFUS.


## Вопросы

Web (NextAuth + CSRF) и API (JWT) вызывают `@gafus/questions-server`: общий HTTP-адаптер декодирует JSON/multipart, ограничивает размер запросов и вызывает core. HTTP Request не передаётся в core.

`@gafus/core/services/questions` владеет доступом, лимитами, идемпотентностью, обсуждениями, вложениями, сердечками, лучшим ответом и модерацией. Изменения сериализуются блокировками User → Question; закрытие проверяется под той же блокировкой, что и отправка ответа. Блокировка QuestionBlock не изменяет доступ к остальным разделам приложения.

DTO, константы и `createQuestionsClient` находятся в `@gafus/types`. Web/mobile внедряют только транспорт: CSRF/cookies или JWT/refresh. Admin-panel вызывает core через тонкие Server Actions. Push сохраняется в StepNotification в транзакции публикации, а worker каждую минуту восстанавливает недоставленные задачи. Неиспользованные фото очищаются через сутки.
