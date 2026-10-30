# GAFUS Refactor — Vite Web

Это **не production** и не функциональная замена старого Next.js Web.

## Изолированная разработка

Работать только в /Users/asmtv1/Desktop/gafus-refactor, через AI Commander.
Никогда не переключать Vite development API на production URL.

Из корня Refactor в разных терминалах:

1. node scripts/refactor/read-only-api.mjs
2. pnpm --filter @gafus/web-vite dev

Vite слушает только 127.0.0.1:5173, проксирует только на 127.0.0.1:4174.
Mock **не выполняет запись** и не содержит реальных пользователей.
На нём регистрация, вход и сброс пароля предсказуемо отклоняются.

## Что есть

- Аутентификация Web через Hono cookie mode:
  login, register с тремя согласиями, preview промокода,
  refresh, logout, password reset request + confirmation.
- Гостевой и персональный каталоги курсов; добавление/удаление избранного
  через существующий Hono POST /courses/favorites (только при авторизации).
- Собственный overview курса по /courses/:id: только данные из Hono
  каталога, без дубляжа entitlement или открытия платных уроков.
  Гостям доступен исключительно публичный список, приватные курсы
  не раскрываются через прямую ссылку.
- Свой профиль: просмотр, редактирование имени, города и описания.
- Клиентская History API навигация и прямые адреса:
  /courses, /courses/:id, /profile, /pets, /pets/:id,
  /articles, /articles/:slug, /questions, /questions/:id, /questions/new,
  /passwordReset и /reset-password.
- «Вопросы»: список с сортировкой/пагинацией, просмотр обсуждения
  и дополнительных страниц ответов через существующий questions-server/Core.
  Приватные authorId, moderation и signed media удаляются из query projection.
  Создание вопроса и верхнеуровневого ответа, включая до пяти
  фото, через shared ограничения и устойчивый UUID идемпотентности;
  проверка права
  публикации/ответа, запрет собственного сердечка и лимиты остаются в Core.
  Сердечки ставятся явным liked=true/false и обновляются после server ACK.
  Владелец (или администратор) может закрывать/открывать обсуждение
  и выбирать лучший ответ через существующие Hono/Core операции;
  награды начисляет Core, но реальные начисления не проверялись.
  Вложенные ответы и собственный CRUD перенесены, но полноценная
  модерация и управление прикреплёнными фото при редактировании
  требуют дополнительной работы.
- Списки собственных питомцев и анонсы статей содержат минимальные DTO.
  Детальная карточка питомца требует ownership Core; заметки и показатели
  доступны только владельцу. Hono GET /pets/:id — private,no-store.
- Деталь статьи требует серверный entitlement: оплаченный HTML очищает Core,
  закрытый контент/видео в DTO Vite не попадает. Hono GET /articles/:slug
  — private,no-store; Web-cookie передаёт WEB_DESKTOP вместо Android.
- При уходе с детальных страниц приватные запросы удаляются из
  React Query cache (gcTime: 0); при смене аккаунта очищается весь кэш.
- Навигация намеренно минимальная без нового npm-router: production
  HTTP hosting SPA fallback и browser E2E требуют отдельной проверки.
- Без PWA, Web Push, Service Worker, IndexedDB offline queue;
  безопасная отмена регистрации только legacy GAFUS /sw.js
  без удаления пользовательских очередей или caches.
- Отдельные статические копии документов согласий из apps/web/public,
  проверяются тестом на неизменность.

## Проверки

pnpm --filter @gafus/web-vite test
pnpm --filter @gafus/web-vite typecheck
pnpm --filter @gafus/web-vite build
pnpm --filter @gafus/web-vite test:preview

Smoke запускает локальный Vite Preview и проверяет прямые HTML-ссылки;
в Preview не разрешено наследовать dev API proxy. Он НЕ является
проверкой production хостинга, реального JWT/DB или HTTPS.

Дополнительные contract tests API:
apps/api/src/routes/v1/browser-auth.route.test.ts,
user.profile-cache.route.test.ts,
public-courses.test.ts и courses.catalog.route.test.ts.

Для всех адресов используется History API с React useSyncExternalStore.
Vite Preview проверен на прямой index.html fallback и отсутствие API proxy.
Это НЕ гарантирует production fallback: отдельный сервер/CDN и HTTPS
нужно будет настраивать и тестировать только после согласования cutover.

## Известный CI блокер

apps/web-vite пока не занесён в pnpm-lock.yaml. Попытка offline
lockfile-only остановилась ERR_PNPM_NO_OFFLINE_META, попытка разрешить
через registry истекла по таймауту; оба раза lockfile остался без изменений.
Ручное редактирование lockfile не применять. После доступной
проверенной pnpm registry-связи нужно сгенерировать root importer и
пройти clean checkout frozen-lockfile install с ignore-scripts.

Уроки, прогресс редактирования, оформление подписок, лента,
полный CRUD и медиа питомцев/статей, Trainer, Admin, production HTTP
routing, NextAuth cutover и релиз НЕ готовы.


### pnpm-lock snapshot 2026-10-16

Повторная штатная команда pnpm --filter ... install --lockfile-only
--ignore-scripts с cache/store строго внутри Refactor разрешила 2411
зависимостей и временно записала apps/web-vite importer, но
ЗАВЕРШИЛАСЬ С ОШИБКОЙ (ECONNRESET, expo-asset tarball).
Помимо импортёра она изменила 1057 строк и удалила 102 строки
snapshot других приложений, в том числе Expo, React/Next и peers.
Чтобы не сломать unrelated apps, этот НЕУСПЕШНЫЙ generated diff
целиком восстановлен из git HEAD (lockfile был чист до попытки).
Никакие пакеты не устанавливались, lifecycle scripts игнорировались.
CI frozen install пока НЕ подтверждён, importer снова отсутствует.
Не пытаться считать pnpm exit 1 успехом, не создавать importer руками.

### Раздел «Вопросы»

GET /api/v1/questions и GET /api/v1/questions/:id повторно используют
уже общий `questions-server` и Core, AuthUser должен быть авторизован.
POST /api/v1/questions — форма с категориями из @gafus/types и
UUID защиты от повторной публикации; право/лимиты Core. Сортировка,
«Мои» и пагинация — server-owned. Верхнеуровневые текстовые ответы
доступны по POST /api/v1/questions/:id/answers (Core enforce canReply,
close/block, 30/hour и идемпотентность UUID), сердечки на ответах —
POST /api/v1/questions/answers/:id/heart с liked=true/false.
Не разрешать лайки собственных ответов; запрет продублирован в Core.
На отказ/ошибку UI не меняет серверные права и состояние; запреты и
дубликаты нельзя решать только на клиенте. Фото, вложенные ответы,
редактирование и полноценная модерация пока не реализованы в Vite.
Для владельца вопроса (или администратора) доступны команды
закрыть/открыть и выбрать/снять лучший ответ через Core; поля
canManage и blockReason берутся из серверного detail DTO, команды
проверяются заново на сервере, а награды НЕ рассчитываются Web.

Страницы QuestionCatalog, QuestionDetails, QuestionCreate загрузятся
отдельными чанками (React.lazy), только по пользовательскому маршруту.
Route-splitting дополнительно проверяет `test:preview`.
Для реальной работы формы требуется HTTPS Hono browser auth, а
локальный dev mock предсказуемо откажет в POST с HTTP403.

### Вопросы: вложенные ответы и собственный CRUD (2026-10-16)

Следующий проверенный срез поверх общего questions-server/Core:
- Кнопка раскрытия ветки GET /api/v1/questions/answers/:rootId/replies?page=N
  запускает запрос только после действия пользователя; страницы
  дедуплицируются по id, закрытые/скрытые записи обрабатывает Core.
- POST /api/v1/questions/:id/answers поддерживает опциональный replyToId,
  как в общем контракта Mobile. UUID идемпотентности связан с
  questionId+replyToId+body, повтор запроса не меняет UUID.
- Core getQuestion уже возвращает первые дочерние комментарии в detail.
  Vite отображает в основном списке только корневые записи,
  оставляя лучший закреплённый вложенный ответ отдельно.
- GET DTO сохраняет только допустимые текстовые поля и id уже
  прикреплённых фото, НЕ сохраняет URL подписей CDN или userId автора.
- PATCH /api/v1/questions/answers/:id и PATCH /api/v1/questions/:id
  обязательно включают существующие photoIds: отсутствие ID отвязывает
  ранее загруженные изображения в Core. Теги вопроса также сохраняются.
  Новый интерфейс редактирует только текст/название/категорию;
  управление фото и тегами отдельно НЕ перенесено.
- DELETE ответов/вопросов — существующий Core soft-delete.
  UI требует явного подтверждения; ACK + scoped query invalidation.
  Сервер проверяет canEdit/canManage/ownership повторно на каждый вызов,
  клиент не присваивает себе права и не пересчитывает награды.
- Unit/Hono/DOM тесты покрывают маршрут, ограничение прав,
  вложенные ответы, редактирование с фото, HTTP ошибки и soft-delete.
  Настоящие HTTPS/Postgres E2E и Mobile parity не подтверждены.

Остаются открытыми: загрузка/отображение вложений и их lifecycle,
модерация, полный UI/UX parity, настоящий Web HTTPS/DB, Trainer/Admin,
весь перенос остальных Next разделов и clean frozen-lockfile CI.

### Жалобы на вопросы и ответы — 2026-10-16

POST /api/v1/questions/:questionId/reports добавлен в Vite как
отдельная форма, с answerId для жалоб на ответ. Причины используются
строго из @gafus/types QUESTION_REPORT_REASONS, details <= 1000.
Серверный Core проверяет действительность target и права пользователя,
и делает идемпотентный upsert по (reporter, question/answer).
На UI только server ACK «Жалоба отправлена», при ошибке форма и
содержимое остаются. Модерация, удаление контента и блокировки
пользователей намеренно не исполняются из этой формы.

### Вопросы: загрузка и просмотр фото (2026-10-16)

Реиспользован **только существующий** Core/Hono questions-server multipart
POST /api/v1/questions/photos и DELETE /api/v1/questions/photos/:id.
Ограничения MIME JPG/PNG/WebP, размер <= 10 МБ и максимум 5 фото
дублируются в Web для UX; Core остаётся источником истины для
проверки содержимого файла, quota 100/день и владения. FormData
передаётся браузером без ручного Content-Type; cookie + Origin
проверяются Hono. После загрузки в Web остаётся ID вложения
и локальный objectURL для превью, а не private signed URL.
Удаление неиспользованного фото подтверждает Core до удаления из UI.
При закрытии компонента blob URL освобождается; если пользователь
уходит во время загрузки, Web пытается удалить полученную бронь
через Core, 24h cleanup worker остаётся fallback. Ошибки оставляют
прикреплённые фото в форме для повтора.
Создание вопроса и root/nested ответов передаёт photoIds и включает
их в fingerprint для UUID idempotency. Пока идёт загрузка, submit
отключён. Редактирование текста сохраняет ранее прикреплённые
photoIds; полноценная замена/удаление уже привязанных фото
**не перенесена**.

Для просмотра зарегистрированных фотографий пользователь нажимает
«Показать фотографии»; компонент делает новый авторизованный
GET через Hono и держит временный signed URL только в React
component state. URL не записываются в React Query/постоянное
хранилище, сбрасываются при закрытии/смене страницы, изображения
ставят referrerPolicy=no-referrer. Недопустимые схемы и чужие
plaintext-HTTP URL отбрасываются. Для root и вложенных ответов
используется соответствующая page-область Core.
Всё это **локальная mock/contract проверка**, реальные Cloud.ru
S3, HTTPS cookie auth, кэш/TTL, CDN подписанные ссылки,
автономные Expo запросы и live DB интеграция ещё НЕ проверялись.

### «Моменты»: первый перенос на Web Vite (2026-10-16)

Новый React.lazy раздел использует маршруты /moments, /moments/:postId,
 /moments/saved. Навигация поддерживает history and deep link URL,
отключает PWA и не создаёт новый auth/backend.
Реиспользуется createFeedClient(@gafus/types) ->
same-origin Hono /api/v1/feed -> feed-server -> Core; server-owned
FEED_ENABLED/FEED_PROCESSOR_READY запрещает загрузку ленты
при выключенном rollout, smart sort скрыт без smartEnabled.
GET /status, GET /posts?sort&cursor&pageSize, GET /posts/:id и
GET /me/bookmarks: server-owned cursor, dedup by id. Клиент проецирует
только минимальный текст/счётчики/author display label/badge
ADMIN/TRAINER и ID готовых вложений. Приватные authorId,
ранжирование/telemetry, signed media URLs не хранятся в React Query.
Небезопасные payload и backend ошибки fail-closed, не заменяются
фиктивными пустыми списками.

Реакции и закладки проходят через те же Feed/Core явные PUT/DELETE;
без optimistic counters, invalidate только user-scoped Query keys.
Комментарии к публикации (корневые): GET /posts/:id/comments и
POST /posts/:id/comments с устойчивым UUID при повторе
неизменённого текста. Лимиты FEED_LIMITS и серверная проверка Core
сохраняются. Вложенные комментарии, их CRUD и реакции, опросы пока
не представлены в Vite.

Фото и постеры видео доступны через отдельный on-demand
авторизованный GET post detail. Временные подписанные URL
сохраняются только в компоненте до закрытия/смены страницы
(referrerPolicy=no-referrer); видео не воспроизводится:
защищённый HLS/proxy/fallback отдельный этап.
Некорректные протоколы и внешние HTTP источники отбрасываются.

НЕ ПЕРЕНЕСЕНЫ: создание/редактирование публикаций с media pipeline,
опросы/голосование, вложенные комментарии, лента профиля/личные
настройки, медиа-видео playback, smart telemetry, уведомления,
модерация, full Mobile parity. Реальных HTTPS/PostgreSQL/Redis/Cloud.ru
end-to-end проверок нет. Native/Expo не изменялся, production
не затрагивался, приложения разработки остаются изолированными.

### «Моменты»: вложенные комментарии и собственный CRUD (2026-10-16)

Реализовано через прежний @gafus/types/createFeedClient/Hono/feed-server/Core:
- GET /api/v1/feed/comments/:rootId/replies?cursor=...: lazy load
  только при раскрытии, страницы по 20, dedup id, server-owned
  rootId проверяется в проекции.
- POST /api/v1/feed/posts/:postId/comments с replyToId: Core
  самостоятельно определяет rootId даже при ответе на вложенный
  комментарий. UUID повторной отправки учитывает postId,
  replyToId и trimmed text; HTTP-ошибка сохраняет текст и UUID.
- PATCH/DELETE /api/v1/feed/comments/:id: интерфейс использует
  server-provided canEdit/canDelete, но решение всегда остаётся
  за Core. В Core собственное редактирование до 60 минут,
  soft-delete с доступом автора комментария/автора публикации.
  Удаление подтверждается пользователем; никакого optimistic remove.
- PUT/DELETE /api/v1/feed/comments/:id/reaction: проверенные Core
  варианты FEED_REACTIONS, без optimistic подсчёта реакций.
- User-scoped invalidation включает root/list/replies/post, без
  попадания приватного authorId/avatar/signed URLs в React Query.
- Unit, UI/jsdom и Hono contracts проверяют nested paging,
  replyToId, UUID retry, canEdit/canDelete, PATCH/DELETE/реакции,
  failure/refusal 403/503.

Нет отдельного Web/Core дубля сервисов. Не утверждать
production parity: реальные PostgreSQL/HTTPS/Media/CDN тесты,
полный feed composer, video HLS, опросы, profile feed, notifications
и возможные оставшиеся экраны/ролевая модерация не закрыты.

### «Моменты»: опросы и викторины, read + vote (2026-10-16)

Добавлен React-компонент MomentPoll в детали публикации с
server-owned GET/POST /api/v1/feed/posts/:postId/poll[/vote]
из общего FeedClient (@gafus/types). Одиночный или множественный
выбор, викторины, анонимность, closed, состояние уже
проголосовавшего и результаты берутся ТОЛЬКО из ответа Core.
Скрытые результаты остаются null, секретные поля
imageUrl/imageMediaId/canEdit не попадают в Query cache.
isCorrect показывается только если сервер его вернул.
POST отправляет только неповторяющиеся валидные optionIds;
при 409/503 форма не сбрасывает выбор и не строит
оптимистическую статистику; при ACK требует точный набор
myOptionIds и invalidate запроса на пользователя и postId.
Сервер сохраняет однократность голосования и блокировку
закрытых опросов, никакой дополнительной клиентской
авторизации/изменения глобальных флагов нет.
Не поддержаны изображения вариантов, создание/редактирование
опросов и полный Web/Mobile дизайн, real DB E2E.

### «Моменты»: создание и публикация текстовых постов (2026-10-16)

Новые маршруты:
- /moments/new — новый текстовый пост;
- /moments/drafts — список своих незавершённых публикаций;
- /moments/drafts/:id — восстановление редактора по ID.

Browser создаёт server draft через POST /api/v1/feed/posts
с UUID, затем PUT /posts/:id/revisions с expectedVersion
и тем же устойчивым по fingerprint revision UUID, затем
POST /posts/:id/publish с UUID. Все решения о праве
публиковать, версии, блокировках и активации остаются в Core.
При недоступности Hono результат НЕ подменяется успешным.
Если POST create succeeded, а revision failed, UI удерживает
полученный postId и использует тот же ключ revision при retry;
после reload восстановление — через owner-scoped
GET /me/pending-posts + GET /posts/:id/editor.
Не хранить draft user content, signed CDN URL или приватные
editor DTO в localStorage. Query cache содержит только
публично допустимую проекцию editor, с userId isolation.

Удаление собственного черновика — только по подтверждению
пользователя и ACK Core /posts/:id DELETE. При отсутствии
прав/ошибке черновик остаётся доступным для повтора.
Текстовый редактор запрещает изменения post/revision,
имеющих вложения, или без canEdit; он не обнуляет media IDs.
Опубликованные публикации не изменяются через этот
упрощённый редактор. Pending-post подтверждение может
означать асинхронную обработку, а не успешную публикацию.

После сохранения текстовой редакции можно ДО публикации
создать опрос в /posts/:id/poll посредством прежнего
FeedClient.savePoll(expectedVersion). Используется
validateFeedPollDraft общего @gafus/types: 2-10 вариантов,
quiz correct answers, multiple/single, privacy flags.
Поддерживается именно CREATE poll: существующий опрос
повторно не перезаписывается (preflight GET). При потере
ACK после PUT повторный GET выясняет, создан ли опрос,
без дублирования изменений. Изображения вариантов,
редактирование существующего опроса, media upload,
HLS video и poll-only posts пока НЕ поддержаны.

Tests: адаптер, UI/jsdom, Hono и Vite Preview deep links.
Реальный POSTGRES+HTTPS+S3/CDN E2E ещё не выполнен,
CI root pnpm frozen lockfile не исправлен.

### «Моменты»: публикации конкретного автора (2026-10-16)

Новый маршрут /moments/profile/:username использует ровно
existing FeedClient.listProfilePosts -> Hono /profiles/:username/posts
-> feed-server -> Core. Core author visibility, status=published,
block/moderation and cursor pagination unchanged. Web shows
public projected post DTO without ranking, signed media links or
private author IDs in React Query. Server feature gate disables
requests for posts entirely; DB/auth failures render alert,
not a forged empty feed. Cursor pages are deduplicated.
For safety current browser routes support ASCII usernames
[a-zA-Z0-9_-] of length <=128. Other existing username spellings
require a separate review of encoding at the shared API boundary;
no silent broadening of apiRequest allowed path regex.

### «Моменты»: безопасный фото-upload в Vite (2026-10-16)

Добавлено добавление JPG/PNG/WebP (до 10 МиБ) по одной
фотографии к ранее сохранённому текстовому черновику
через существующий shared @gafus/types FeedClient/Hono:
POST /posts/:postId/uploads (idempotent request UUID),
HTTPS signed multipart POST в S3, POST /uploads/:id/complete
(проверка результата), PUT /posts/:id/revisions с
expectedVersion и сохранением ВСЕХ прежних attachmentIds.
При потерянном revision-ACK повтор использует тот же UUID
и mediaId, не резервируя вторую фотографию.
Публикация не выполняется автоматически: только отдельный
POST publish владельцем. Во время upload запрещено
сохранение текста, добавление опроса и публикация.
Поддерживается cursor-independent работа с черновиком после
reload через собственный Core editor и pendingRevision IDs.
Используется существующий helper браузерной доставки
Cloud.ru signed POST для совместимости с уже проверенным
Core/Web форматом. Файл, presigned POST URL и signed fields
не сохраняются в React Query и localStorage.

Права, лимиты, attachment owner, media processing, storage
metadata проверяет Core. В браузере: HTTPS without userinfo,
strict MIME/file size, Core ACK id/author-bound, media/revision
idempotency, 10 photo/total attachments.
Снимки, загрузка видео, обработка неудачных фото с retry
reservation, отмена отдельных фото после публикации и полный
media editor ещё НЕ перенесены. После сохранения первой
фотографии текст временно блокируется, чтобы упрощённая
форма не потеряла уже прикреплённые вложения. Отдельные
серверные операции без разрешения не выполнялись.
Фото обрабатывается фоновым Core worker после complete.
UI показывает прогресс POST, но не фальшивые проценты
фоновой обработки; pending после публикации != готово.

НЕТ полноценного E2E с локальным non-prod PostgreSQL+Redis,
реальным подписанным URL/S3 CORS/CORS-proxy и processing worker.
Mock-загрузка через XMLHttpRequest и Hono contracts не
подтверждают работу реального бакета. Нельзя выпускать
на production на основании только этих проверок.

### «Моменты»: авторская загрузка видео в Vite (2026-10-16)

Upload расширен до MP4, MOV, WebM. Ограничение 200 МиБ
проверяется сразу в браузере; допустимая длительность ролика
до 60 секунд проверяется Core/media-worker после передачи.
Добавление одно за раз, общий лимит вложений — 10,
количество видео — до 3 по Core. UI разделяет прогресс
передачи файла и асинхронную обработку (100% передачи НЕ
означает 100% подготовки HLS). После подтверждения
резервирования и completeUpload ID видео сохраняется как
новая редакция с expectedVersion и полным списком ранее
присоединённых вложений. Серверные правила видимости,
квоты, авторство и очередь не переписаны. Повтор после
потерянного revision ACK повторяет тот же mediaId/UUID,
не создавая дубль; ошибочный ответ сервера не трактуется
как публикация. Автоматической публикации нет.

В Vite используется единый загрузчик медиа feedMediaTransfer,
чтобы не дублировать HTTPS multipart, формат signed POST,
Content-Type, проверку авторского ticket и server ACK для
фото/видео. Signed URLs и файлы не попадают в Query cache
или localStorage; XHR к storage не получает ambient cookies.
Проверки: MIME/type/size, Hono contract request kind video,
UI video selection, отсутствие auto-publish и регрессия фото.

НЕ РЕАЛИЗОВАНЫ: проигрывание HLS в новом Vite (пока только
постеры), удаление/перестановка вложений, редактирование
опубликованного медиа-поста, реальная проверка
Cloud.ru/Beget/CDN, worker/transcoding, браузерный E2E,
Native/Mobile функциональная проверка, frozen lock CI.
Root pnpm-lock не менялся, локальный Refactor не production.

### «Моменты»: отображение результатов фоновой обработки (2026-10-16)

После подтверждённой POST publish с Core status=pending
Web показывает отдельный блок состояния без ложного
процента. GET /api/v1/feed/posts/:id/editor выполняется
только для своего поста, через существующий FeedClient/Hono.
Пока Core возвращает pending, React Query перепроверяет
состояние раз в 12 секунд только на открытой вкладке
(в фоне автоопрос выключен, при возвращении focus query
обновляется). При published запросы прекращаются
и появляется ссылка на готовый момент. При failed Core
отображается ошибка и не создаётся новая запись;
HTTP-ошибки видны отдельно, есть «Проверить сейчас».
В списке черновиков появилась кнопка обновления состояний.

Core остаётся единственным владельцем
status/published/processing, авторизации, worker и таймингов.
Signed media URLs и приватные данные editor не сохраняются
в React Query: серверный ответ проецируется до state/status.
UI-тесты покрывают pending, published, failed, 503 и
отсутствие фальшивого прогресса/повторной публикации.

Это UI-состояния, не инструмент диагностики реального
media worker. Без E2E с тестовой PostgreSQL, очередью и S3
не утверждать, что transcoding или CDN работает.

### «Моменты»: редактирование опубликованного текста (2026-10-16)

Новый компонент MomentEditPublishedText появляется только если
GET Core post возвращает canEdit=true. По запросу открывает
строго owner-scoped GET /api/v1/feed/posts/:id/editor,
проверяет actor/версию и проецирует ВСЕ активные attachment IDs
в исходном порядке без подписанных ссылок и приватных данных.
Редактирует только текст; не может незаметно сбросить
фото/видео. Core ограничивает авторство и часовой edit-window,
блокирует 409 version-conflict. Browser не вычисляет права
по локальному времени. Нельзя изменить чужую публикацию
или начать параллельную новую редакцию.

Фазы пользователя:
1) PUT /posts/:id/revisions (expectedVersion, existing IDs,
   trimmed text и стабильный UUID);
2) отдельный POST /posts/:id/publish (стабильный UUID).
После этапа 1 Core может продолжать показывать старый
опубликованный текст, а pendingRevision.status=draft.
После этапа 2 Core может вернуть status=published вместе
с pendingRevision.status=pending: старый пост доступен, новая
редакция ещё обрабатывается. Web не называет её готовой
до Core ACK. При отказах 403/409/503 пользователь видит
ошибку, исходная публикация не удаляется.
Повторный PATCH/PUT использует тот же fingerprint/UUID.
Перезапись медиа и poll edit здесь запрещены.
Практические non-prod HTTPS/PostgreSQL/Redis/S3 E2E не
проводились; типобезопасные Hono/client/jsdom mocks — локальные.

### «Моменты»: публикация без текста и порядок вложений (2026-10-16)

Подтверждённый Core поддерживает публикации с одним или
несколькими вложениями без текста. Теперь в Vite доступна
кнопка «Создать черновик для медиа», даже если поле текста
пустое. POST /posts создаёт пустой owner-scoped draft с
устойчивым clientRequestId. Media uploader сразу разрешает
первое фото или видео на draft версии 0; запрашивает upload
reservation/complete и создаёт первую PUT revision с
text="", attachmentIds=[mediaId], expectedVersion=0.
Отдельная «Опубликовать» становится доступной только после
ACK этой редакции; пустую публикацию без вложений UI не
публикует. Core продолжает проверять все права и квоты.

Для unpublished draft >=2 вложений добавлен reorder по
позициям (кнопки «Выше» и «Ниже») только при canEdit=true,
status=draft и pendingRevision.status=draft. PUT /revisions
получает text без изменений, полный точный набор
attachmentIds в новом порядке, expectedVersion и стабильный
UUID. Вложение не удаляется из S3 и не создаётся второй файл;
передача медиа и reorder взаимно блокируют кнопки друг друга.
Публикация блокируется на время reorder. Только успешный
Core ACK изменяет состояние редактора; 409 и 503 отображаются.
Редактирование уже опубликованного набора файлов
(перестановка/удаление), видео HLS и cross-device real E2E
остаются за рамками этого этапа.
