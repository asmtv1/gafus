# GAFUS Refactor — подготовка релизного workflow ветки `vite`

Дата: 2026-10-28. Только GAFUS Refactor, никакого GAFUS Main/production cutover.

## Принцип

`vite` — текущая проверенная ветка рефакторинга. Ранее действовавший
`.github/workflows/ci-cd.yml` развёртывает Next.js из `main` и НЕ является
релизным workflow Vite. Его, `deploy-only.yml` и
`production-deploy-reusable.yml` намеренно не меняли: текущий production
не должен незаметно начать собирать и выкладывать другое приложение.

Новый `.github/workflows/refactor-vite-release.yml` работает на push/PR `vite`:

1. Зависимости из frozen lockfile (без lifecycle scripts), сборка общей библиотеки,
   typecheck, ESLint, Web tests и production Vite build; точный `dist/` сохраняется
   в GitHub Actions artifact.
2. Linux/AMD64 nginx runtime-образ упаковывает **тот же** проверенный артефакт,
   скачанный из CI (без повторной `pnpm install` внутри Docker),
   HTTP smoke SPA history routes /healthz, no silent HTML on /api,
   проверка Nginx.
3. Только после успешных обоих job и только при
   `GAFUS_REFACTOR_IMAGE_PUBLISH=enabled` — отдельный GitHub environment
   `refactor-image-publish` и публикация
   `ghcr.io/asmtv1/gafus-refactor-web:sha-<commit>` и фиксация
   неизменяемого digest (`@sha256:...`) в summary запуска.
   Нет тегов `:latest`, нет подмены `ghcr.io/asmtv1/gafus-web`.
   В будущем deploy необходимо привязывать к **digest**, а не только тегу.
   **Required reviewers** для `refactor-image-publish` необходимо вручную включить
   в настройках GitHub Environment; одно лишь имя environment не добавляет защиту.
   Не выполняются SSH, Compose, Prisma, S3, Cloud.ru, DNS и production writes.

`workflow_dispatch` удобен для ручной проверки, но GitHub может не показывать
новый workflow в Actions UI, пока его файл отсутствует в default branch
репозитория. Push в `vite` запускает проверку независимо от этого ограничения.
Не переносить файлы в Main ради обхода ограничения.

## Production-контракт контейнера

- Слушает `3000`, отвечает `GET /healthz = 200 ok`.
- Роутинг History API → `index.html`; отсутствующие `/assets/*` возвращают 404.
- `/api/v1/*` → `gafus-api:3001` в **той же** будущей Docker-сети;
  оригинальный Host/Origin не подменяются. Без backend в локальном smoke
  API отдаёт 502, а не фальшивый HTML 200. Остальные `/api/*` → 404.
- `index.html` не кэшируется; хешированные `/assets/` immutable.
- Никаких Next SSR, NextAuth routes, PWA/service worker или runtime secrets
  в браузерном Vite-образе.

## Что ещё требуется перед переключением production

Этот PR **не означает**, что сайт можно переключать на `vite` сейчас.

1. Отдельно согласовать **координированный** переход всех API/Worker/Prisma,
   Admin/Trainer и Web. Старый deploy CI выпускает семь Next/legacy образов;
   подмена только Web приведёт к несовместимым API и маршрутам.
2. Реальные staging PG/Redis/S3, SQL migration rehearsal и backup + проверенный
   восстановительный сценарий. Нельзя автоматически откатывать схему после
   частично применённой миграции.
3. Проверить Browser/Web/Mobile API, авторизацию, cookie/CORS, платежи,
   загрузки и удаление media, приложения/админку/тренера, push и readyness.
4. Настроить независимый release deploy с GitHub Environment approval,
   конкретным digest всех образов, отдельным Refactor release root,
   безопасным maintenance gate, без операций в Main репозитории;
   заменить nginx upstream только после smoke/health. Подготовить план
   возврата трафика без отката несовместимой схемы.
5. Проверить production конфигурацию Cloud.ru Jobs/S3/Beget CDN отдельно,
   без выполнения production-мутаций на этапе проверки workflow.
6. Перед любым выпуском **обязательны** локальные typecheck, тесты, docker
   linux/amd64, HTTP smoke, review diffs, зафиксированный чистый release commit,
   успешный удалённый CI. Грязное рабочее дерево не входит в GitHub checkout.

Пока не согласован cutover, переменную `GAFUS_REFACTOR_IMAGE_PUBLISH` держать
отключённой. Даже включение публикации — это **только GHCR**, а не deploy.

## Локальные проверки 2026-10-28

- `web-vite typecheck`, `lint`, `build` — PASS на локальном macOS.
- Полный `web-vite test` останавливается на legacy asset guard:
  два изменённых CSS и отсутствующий `AppBackButton.module.css`.
  Его нельзя объявлять PASS; CI блокирует публикацию.
- Реальный Nginx `nginx -t`, SPA /courses, /profile?tab=settings,
  /feed, 404 для неизвестных API/assets и отдельный локальный тестовый
  backend для proxy `/api/v1` с сохранёнными Host/URI/HTTPS — PASS.
- Первичная Linux AMD64 Docker сборка выявила недостающий браузерный
  импорт из legacy Web в минимальном build context. Для устранения дрейфа
  Node/npm внутри Docker выбран единый CI build artifact: передавать именно
  проверенный `dist` и упаковывать только nginx runtime. Новую сборку
  Docker runtime проверять отдельно, не путать с предыдущим FAIL.

- Обновлённая Linux AMD64 runtime-сборка из локального проверенного `dist`:
  **PASS**; `gafus-refactor-web:local-workflow` (без GHCR push).
- Запущенный **собранный** AMD64 образ + изолированный тестовый HTTP API:
  /healthz, SPA /courses, /profile?tab=settings, /feed, 404 для
  отсутствующих путей, `/api/v1` с Host/URI/HTTPS, nginx -t — **PASS**.
  Эту схему смоук-теста перенесли в CI.
- Удалённый GitHub Actions CI не запускался; это локальные проверки.

## Полезные результаты продолжения 2026-10-28

- Исторический `scripts/refactor/check-legacy-ui-assets.mjs` удален как устаревший; в прежнем отчете локально путь
  должен строго совпасть с `/Users/asmtv1/Desktop/gafus-refactor`; в
  GitHub Actions Linux — только с реальным `GITHUB_WORKSPACE`. Раньше
  абсолютный путь Mac гарантированно блокировал CI на Ubuntu.
- В Refactor Vite добавлен недостающий `src/brand/AppBackButton.module.css`
  из уже существующей копии Next внутри **этого же Refactor**.
- Для `Header.module.css` (выравнивание разных иконок) и
  `LegacyPetsPage.module.css` (отступы карточек) оформлены два строго
  закреплённых SHA256 исключения. Это не отключает проверки: любое
  последующее редактирование требует отдельного review и обновления
  approved digest. В результате проверка UI-источников: **79/79 PASS**.
- Релизные контрактные тесты: **6/6 PASS**, YAML разбирается корректно.
- Полный `pnpm --filter @gafus/web-vite test` завершился **FAIL**:
  **39 failed test files / 243 passed / 1 skipped**, **75 failed tests /
  2905 passed / 6 skipped** (283 файла, 2986 тестов). Asset parity 79/79
  и `vite.config.test.mjs` прошли, падения уже в Vitest (профиль,
  напоминания, достижения, Моменты, вопросы, медиа и др.). В CI этот
  шаг находится в собственном `run`, поэтому его exit 1 гарантированно
  блокирует дальнейшую публикацию. Не отключать/пропускать тесты ради
  зелёного release gate; чинить отдельными тематическими задачами.
- На текущем этапе нельзя запускать production: legacy Next Compose,
  Prisma migrations и Cloud.ru jobs остаются отдельным координатным
  release/cutover-планом, а не автоматически активируемыми из `vite`.

- Локальные TypeScript-проверки `@gafus/api`, `@gafus/worker`,
  `@gafus/admin-panel` и `@gafus/trainer-panel` — **4/4 PASS** на
  текущем рабочем дереве. Это ещё не clean checkout CI и не Linux
  Docker build всех серверных компонентов.

### Итог текущей локальной релизной проверки

- `web-vite typecheck`, `web-vite lint`, `web-vite build`,
  `web-vite test:preview` — **PASS** (со старым предупреждением Vite
  о крупном JS chunk и ineffective dynamic import; это performance debt).
- Финальный Linux/AMD64 образ повторно собран из актуального локального
  `dist` — **PASS**. Контейнерный HTTP smoke с отдельным одноразовым
  Hono-shaped тестовым backend — **PASS**: `/healthz`, `/courses`,
  `/profile?tab=settings`, `/feed`, 404 для неизвестных `/api/*` и
  `/assets/*`, сохранение `Host` и `X-Forwarded-Proto` на `/api/v1`.
- Полные Web Vitest — **FAIL (75 тестов)**; GitHub CI специально оставлен
  fail-closed. Не проводить image publish/production deployment до исправления.
- GitHub Actions workflow из удалённого checkout ещё не выполнялся;
  отдельный автоматизированный production cutover для всей ветки не создан.
  Refactor Main репозиторий, сервер, БД, Cloud.ru и Beget не изменялись.

### Продолжение: WEB Vitest triage без отключения CI gate

- В `momentMedia.ts` убрана неявная зависимость проверки абсолютных
  HTTPS URL от `window`. Node-проектор теперь принимает только корректные
  абсолютные HTTPS URL; относительные URL по-прежнему требуют браузерный
  same-origin. Дубликаты готовых медиа ID от сервера вызывают ошибку,
  а не создают повторное вложение.
- Тестовые DTO `momentMedia.test.ts` обновлены под Feed V2: WebP thumbnail/
  full URL и отдельный MP4 variant, без частных S3 метаданных.
  `postDetailReadApi.test.ts` вместо заведомо не-URL строки использует
  подписанный медиа-адрес. Оба файла **22/22 PASS**.
- Тесты профиля теперь проверяют реальный link `/profile/editBio` и
  сохранение через SPA, заголовок Instagram и truthy whitespace note-title,
  как уже закреплено другими тестами. `ProfileOverview.test.tsx`:
  **14/14 PASS**.
- Гостевой вход в приватные URL по текущему App-контракту показывает
  публичный landing/login, без private GET. Обновлены профиль и достижения,
  обработчик BackButton проверяется по актуальному label без текстовой
  стрелки: **33/33 PASS** в двух тестовых файлах.
- Сценарии напоминаний проверяют IANA timezone в раскрытом editor и
  отсутствие записи при чтении, а не старую read-only карточку. Обновлены
  тесты Achievements Back и AccountDelete Back: **34/34 PASS** в трёх файлах.
- Итого восемь целевых тестовых файлов: **103 теста PASS**, включая
  17 ранее падавших. Это локальные targeted re-runs, не полный CI PASS.
  Новый полный JSON-прогон запущен для актуального числа оставшихся
  падений и выделения реальных регрессий в безопасности/API/медиа.

### Следующая волна исправлений — проверка 2026-10-28

- Первый повторный полный прогон Vitest после части исправлений: **56 FAIL,
  2924 PASS, 6 SKIP**. Второй полный прогон JSON после следующих
  изменений ещё выполняется; цифры 56/2924 **не являются окончательными**.
- Приведены к актуальному UI тесты общей кнопки «Назад» (иконка SVG,
  без буквального `←`), гостевого landing, истории SPA, доступа к
  приватным маршрутам и ожидаемого onboarding GET.
- `questionMedia.test.ts`, `QuestionCreate`, `QuestionOwnerControls`,
  `AnswerOwnerControls` теперь проверяют **Photo Media V2**: Hono reservation,
  прямой S3 multipart POST без cookies, Hono confirm и запрет изменения
  привязанных photo IDs до завершения upload. Общий fixture находится
  в `questionPhotoV2.test-helper.ts`. Четыре файла: **54/54 PASS**.
- `MomentCatalog` сохраняет уже подтверждённые страницы при загрузке
  следующей, но скрывает старый кэш при revalidation первой страницы.
  Feed V2 media DTO и CDN query-signature сверены с текущими контрактами;
  проверки `MomentsCatalog` **26/26 PASS**, FeedCdnImage **3/3 PASS**.
- Публичные страницы профиля других пользователей остаются доступны
  авторизованному зрителю, но старый guest-тест переведён на landing.
  `PublicProfileRoute` **43/43 PASS**.
- Календарь консультаций теперь использует фиксированные часы только
  внутри тестов с временным fixture вместо устаревших реальных дат;
  Android/iOS/production clock не меняется.
- UI-сборка `web-vite build`, `test:preview`, typecheck, lint — **PASS**.
  Актуальная Docker `linux/amd64` сборка и контейнерный HTTP+Hono-proxy smoke
  — **PASS** после изменений.
- **Критический Git blocker**: `git ls-files apps/web-vite` возвращает
  **0** — исходники новой Vite версии существуют только как `??` в текущем
  рабочем дереве. Перед реальным workflow нужны проверенные коммит и push
  всего согласованного набора Vite исходников и их workspace зависимостей.
  Рабочее дерево содержит более 2600 чужих/параллельных изменений;
  **не запускать `git add -A` и не делать автоматический коммит**.
  В шаг `verify` добавлена строгая проверка наличия ключевых исходников
  Vite в Git индексе: неполный push останавливается до установки pnpm.
  Контрактные тесты теперь **7/7 PASS**.
- Основная production-композиция в текущем Refactor по-прежнему содержит
  Next Web и старые имена `gafus-*`: перед cutover предстоят отдельные
  Docker/API/Worker/Prisma/NGINX проверки и координация миграции.
  Production workflow/сервер/БД/Main не менялись.


### Финальная локальная проверка Web Vite — 2026-10-28

**Полный CI test gate Web Vite пройден:** команда
`pnpm --filter @gafus/web-vite test` завершилась с кодом **0**.
Это точно тот вызов, который настроен в `.github/workflows/refactor-vite-release.yml`.

| Проверка | Результат |
|---|---|
| Legacy UI source guard | **79/79 PASS**, два SHA-проверенных Vite overrides |
| `vite.config.test.mjs` | **8/8 PASS** |
| Полный Web Vitest | **2980 PASS / 0 FAIL / 6 SKIP** (283 тестовых файла) |
| `web-vite typecheck` и `web-vite lint` | **PASS** |
| `web-vite build` и `web-vite test:preview` | **PASS** |
| Linux AMD64 Docker image build | **PASS**, образ собран из текущего `dist` |
| Контейнерный HTTP/SPA/Hono proxy smoke | **PASS**, сеть только локальная тестовая |
| Отдельные серверные TypeScript-проверки (API/Worker/Admin/Trainer) | **4/4 PASS** |
| Локальный `@gafus/api build` (tsup, Node20) | **PASS**, `dist/index.js` создан |
| Локальный `@gafus/worker build` (tsc) | **PASS**, worker `dist` создан |
| `admin-panel` и `trainer-panel` Next production build | **НЕ ЗАПУСКАЛИСЬ**: оба приложения содержат локальные `.env.local`, которые Next может автоматически загрузить при build; безопасное isolated окружение не подтверждено |
| Release workflow safety contracts | **7/7 PASS** |
| GitHub Actions run в удалённом checkout | **НЕ ПРОВОДИЛСЯ** |
| Полный production cutover/migrations | **НЕ ПРОВОДИЛСЯ** |

Первый полный suite на старом дереве имел 75 FAIL. Промежуточный —
56 FAIL, затем 2 асинхронных нестабильных ожидания. Финальная
**полная** команда показала 0 FAIL, без исключения тестовых файлов и
без снятия блокировки публикации. Пропущенные шесть тестов — отдельный
ранее существующий `g05WebRealConsumer.real.test.ts`, который требует
реальной интеграции и не входит в обычный локальный Vitest.

**Оставшиеся обязательные шаги до любой production-публикации:**

1. Согласованно отобрать все исходники `apps/web-vite`, тесты, media
   и shared workspace зависимости и безопасно закоммитить в `vite`.
   Сейчас `git ls-files apps/web-vite` возвращает **0** — GitHub runner
   не получит локальное приложение при пуше. Не делать автоматический
   `git add -A`, так как присутствуют тысячи параллельных изменений.
2. Проверить **чистый Git checkout** с Node 24 и pnpm 10.12.4 на
   GitHub Actions; локальные тесты выполнялись на Node 20.20.2.
3. Отдельно валидировать Linux AMD64 Docker-сборки и интеграцию
   `@gafus/api`, `@gafus/worker`, Prisma, Admin/Trainer, Bull Board,
   S3/Cloud.ru media jobs и их совместимые конфигурации. API и Worker
   уже собраны **локально**, но полные Linux AMD64 образы не проверены.
   Admin/Trainer собирать только при подтверждённой изоляции `.env.local`
   и отсутствии риска обращения к production.
4. Проверить безопасную миграцию тестовой PostgreSQL, local E2E
   Web/Mobile, сценарии rollback и nginx edge routing.
5. Только затем согласовывать и отдельно запускать production cutover;
   текущее image candidate workflow **не деплоит** production и
   намеренно не вызывает SSH, Compose, миграции или замену Main.

**За этот этап:** production-сервер, БД, S3/CDN, действующие Main
workflows, ветка main, Git push и любые удалённые сервисы не изменялись.


### Production containers — обязательный AMD64 matrix gate (2026-10-28)

В `refactor-vite-release.yml` добавлен **полный Docker build без push**
для семи образов из текущего production workflow:

| Dockerfile | CI image |
|---|---|
| `Dockerfile-web-optimized` | Next Web (legacy, пока не заменён) |
| `Dockerfile-trainer-panel-optimized` | Trainer Panel |
| `Dockerfile-admin-panel-optimized` | Admin Panel |
| `Dockerfile-api-optimized` | Hono API |
| `Dockerfile-worker-optimized` | Worker |
| `Dockerfile-bull-board-optimized` | Bull Board |
| `Dockerfile-prisma-optimized` | Prisma |

Образы должны **полностью** собраться на Linux AMD64 GitHub runners,
загрузиться в локальный Docker runner и пройти проверку архитектуры
`linux/amd64`. `fail-fast: false` гарантирует независимый отчёт по
всем семи. Новый Vite Web уже проверяется отдельным `docker-smoke`;
в итоге перед публикацией image candidate необходимы **восемь**
прошедших контейнерных сборок (семь legacy/prod + Vite).

Никаких GHCR login/push, production секретов, SSH или миграций в матрице
нет. `publish-candidate` заблокирован до успешного завершения
**всех** матричных сборок плюс Web typecheck/Vitest/HTTP smoke.
Для воспроизводимой локальной проверки создан
`ci-cd/scripts/refactor-verify-production-images.sh` — полный
`docker build --platform linux/amd64` для каждого текущего Dockerfile,
без публикации, с проверкой архитектуры и порогом свободного места.

**Это только конфигурация проверки**: 10/10 тестов контрактов workflow
прошли, но GitHub runner пока не запускался, и локальный Docker-результат
надо зафиксировать отдельно. Кроме того, Git сейчас не отслеживает
`apps/web-vite`, поэтому новый workflow после push требует явного
выбора файлов для коммита и чистого checkout.

При проверке реальной сборки Prisma выяснилось, что шесть
production Dockerfile подготавливали pnpm 9.1.0, после чего Corepack,
руководствуясь корневым `packageManager`, всё равно скачивал 10.12.4.
`Dockerfile-web-optimized` уже использовал 10.12.4. Шесть остальных
Dockerfile теперь приведены к pnpm 10.12.4 (семь замен, включая два
в Prisma). Добавлен контрактный тест pin версии во всех семи образах.
Текущая ранее запущенная сборка Prisma использует предыдущий снимок
Dockerfile, и не заменяет финальную проверку новой конфигурации.

Дополнительно выполнена **проверка синтаксиса production Compose**:
`python3 ci-cd/scripts/refactor-verify-compose.py` — **PASS**.
Для 165 `${VAR}` подставляются исключительно синтетические значения,
реальные `.env`, ключи, токены, БД и running production не используются.
Сценарий встроен в `verify` GitHub workflow и выполнится перед сборками.

### Docker AMD64 diagnostic: Prisma, npm Registry (2026-10-28)

Первый полноценный Prisma `docker build --platform linux/amd64`
упал на скачивании pnpm 10.12.4 в **runtime runner**:
Corepack не смог получить пакет из `registry.npmjs.org`; параллельно
наблюдались `ECONNRESET` при pnpm package fetch. Это **сетевой отказ
сборки**, не TypeScript/Prisma error. Не считать его PASS.

Runner Prisma больше не скачивает Corepack заново: Dockerfile задаёт
`COREPACK_HOME=/opt/gafus-corepack` в build и runtime слоях, копирует
подготовленный пакет из build stage и запускает runtime prepare при
`COREPACK_ENABLE_NETWORK=0` (должен работать из локального кэша).
Проверка контрактов Docker/CI: **11/11 PASS**.
Повторный реальный AMD64 Docker build из новой конфигурации запущен;
его результат фиксируется только по коду завершения и image inspect.

Все внешние runtime образы (PostgreSQL, Redis, Nginx, Certbot и
monitoring) **загружаются**, а не собираются этим workflow. Их
манифесты/pull и интеграционные проверки требуют отдельного runner
настроенного staging; вывод о готовности production на основании
TypeScript-сборок или синтетического Compose будет некорректен.


### Итог фактических Docker AMD64 испытаний — сетевой блокер

Результаты двух попыток полноразмерной **Prisma Docker** сборки:

- После выравнивания pnpm первый запуск дошёл до runtime/Corepack,
  но закончился **FAIL**: `registry.npmjs.org` разорвал соединения
  (`ECONNRESET`), повторный Corepack download не удался.
- Runtime Prisma больше не зависит от скачивания pnpm заново:
  зафиксирован `COREPACK_HOME` и настроено копирование его готового
  кэша из build stage (`COREPACK_ENABLE_NETWORK=0` в runner).
- Повторная сборка после изменения упала на получении метаданных
  базового `mirror.gcr.io/library/node:20-alpine` (**FAIL**, до исходников).
- Независимый тест `docker buildx imagetools inspect` не смог получить
  манифест ни из Google mirror, ни из Docker Hub. `curl -I` со стороны
  Mac завершался `SSL connection timeout` на npm Registry, Google mirror
  и Docker Hub. Это общий **локальный сетевой сбой к registry**, который
  не позволяет заявить успешные runtime-образы и отдельно не говорит о
  работоспособности GitHub-hosted runner.
- **0 из 7 legacy Docker full-build ещё не подтверждены как PASS**;
  из-за сетевого сбоя мы сознательно не маркируем их как успешные.
  Dockerfile Vite Web ранее **успешно** собран и проверен в AMD64.

Доступные локальные проверки на этом этапе:

| Check | Verified |
|---|---|
| Vite Web full Vitest | **2980 PASS / 0 FAIL / 6 SKIP** |
| Vite Web production build + AMD64 Docker/HTTP/Hono smoke | **PASS** |
| API tsup, Worker tsc, Bull Board tsc, Prisma tsc | **4/4 PASS** |
| Admin Panel и Trainer Panel TypeScript checks | **2/2 PASS** |
| Production Compose syntax with 165 synthetic env values | **PASS** |
| Release workflow tests including all 7 Dockerfile pnpm pin and Prisma offline runtime cache | **11/11 PASS** |
| Full 7-image Linux AMD64 runtime images | **BLOCKED: local registry TLS/HTTPS** |
| Hosted GitHub Actions 7-image build matrix | **NOT RUN: uncommitted sources** |

Не запускаем никакой deploy до реального **7/7 PASS** в GitHub
матрице и отдельно готовой интеграционной проверки ресурсов в staging.
В основной prod CI ничего не изменялось, GHCR image push и production
DB/S3/DNS/API/контейнеры не затрагивались.


### Confirmed full AMD64 container: Prisma (2026-10-28)

После восстановления npm/Docker Registry завершена **полная** сборка
`ci-cd/docker/Dockerfile-prisma-optimized` из текущего Refactor.
`gafus-refactor-verify-prisma:local-amd64` успешно экспортирован и
`docker image inspect` подтвердил `linux/amd64`.

- `pnpm install --frozen-lockfile`: **PASS** (1754 зависимостей,
  внутри Docker pnpm 10.12.4)
- Prisma Client generate: **PASS**, `@gafus/prisma build`: **PASS**
- `pnpm deploy --legacy --prod --no-optional`: **PASS**
- Runtime `node --version` под `--network none --read-only`, без
  capabilities: **PASS**, Node 20.20.2
- Runtime `COREPACK_ENABLE_NETWORK=0 pnpm --version` в тех же
  условиях: **PASS**, pnpm 10.12.4
- Реальный production database connection/migration: **НЕ ЗАПУСКАЛИСЬ**

Первый запуск внешней проверочной shell-команды завершился ненулевым
кодом **после успешного Docker build**, поэтому отдельно повторены обе
runtime smoke-команды с кодом 0. Конечный образ и offline runtime
подтверждены независимо. Никаких образов не публиковалось в registry.
Параллельно начата сборка API и Worker под AMD64. Общий результат
семи образов зависит от подтверждённого выполнения каждого из них.


### Critical Prisma runtime correction — 2026-10-28

Дополнительный offline test выявил реальный дефект **первого**
успешно собранного Prisma-образа:
`require('@prisma/client')` падал с
`Cannot find module '.prisma/client/default'` (файл Client не был
включён в runtime после `pnpm deploy --legacy`). Наличие Node,
Corepack и файла `/app/schema.prisma` **недостаточно** для готовности.

Исправлен `ci-cd/docker/Dockerfile-prisma-optimized`:
- build stage требует `/app/node_modules/.prisma/client/default.js`
- generated Client и Query Engine копируются из build stage в
  runtime `/app/node_modules/.prisma`
- Docker build теперь завершится ошибкой, если runtime не сможет
  выполнить `require('@prisma/client')`
- эта же импорт-проверка без сети, БД, томов и privileges добавлена
  в локальный verify script и GitHub-hosted AMD64 matrix

**Важно:** исходный Prisma образ собрался, но имел сломанный runtime;
после исправления повторный Docker build ещё необходим. Пока его
нет, итоговый статус Prisma — **runtime FIX PENDING**, а не PASS.
CI контракты с этим gate: **13/13 PASS**. Эти контракты не заменяют
проверки нового финального образа.


### Confirmed full AMD64 runtime: API — 2026-10-28

Full original `Dockerfile-api-optimized` build: **PASS** and image
`gafus-refactor-verify-api:local-amd64` inspected as `linux/amd64`.

- pnpm 10.12.4 frozen install for 1762 packages, Prisma Client generate,
  full Turbo API dependency builds, `pnpm deploy --legacy`, native
  FFmpeg apk install and built-in server import check: **PASS**.
- Isolated runtime `ffmpeg -version` under `--platform linux/amd64
  --network none --read-only --cap-drop ALL`: **PASS**, FFmpeg 8.0.1.
- Isolated runtime Prisma Client import via the actual `@gafus/prisma`
  package resolver, no DB or network: **PASS**, callable `PrismaClient`.
- Verified final image is not pushed to any registry and is not deployed.
- Following sequential check now builds the Worker image. Seven-image
  matrix still requires real results for Worker, Bull Board, Admin,
  Trainer and old Next Web. Fixed standalone Prisma must be rebuilt after
  the original runtime import failure; do not list it as final PASS.


### Обновление матрицы контейнеров — 2026-10-28, текущая локальная проверка

На реальном Docker Desktop дополнительно проверено:

| Образ | Linux AMD64 full build | Runtime offline | Проверка Dockerfile |
|---|---|---|---|
| Vite Web (`Dockerfile-web-vite-refactor`) | **PASS**, проверено ранее | HTTP/Hono smoke PASS | PASS |
| API (`Dockerfile-api-optimized`) | **PASS** | Node, FFmpeg 8.0.1, Prisma Client import **PASS** | PASS |
| Worker (`Dockerfile-worker-optimized`) | **PASS** | Node, FFmpeg 8.0.1, Prisma Client import **PASS** | PASS |
| Prisma (`Dockerfile-prisma-optimized`) | старый build PASS, но runtime Client **FAIL** | FIX внесён, **нужен повторный full build** | PASS |
| Bull Board | не проверен full build | — | PASS |
| Admin Panel | не проверен full build | — | PASS |
| Trainer Panel | не проверен full build | — | PASS |
| Legacy Next Web | не проверен full build | — | PASS |

Семь из семи **production Dockerfile** прошли `docker buildx build
--check --platform linux/amd64` без предупреждений. Это проверка
инструкций сборки, **не full build**. CI safety/contracts: **13/13 PASS**.

Worker последовательно собрался после API; внеплановый ненулевой статус
обёртки был получен **после** сообщений `BUILD_AND_RUNTIME_PASS api`
и `BUILD_AND_RUNTIME_PASS worker` (ошибка обёртки `s: command not found`).
Отдельные проверки финального Worker image завершились **exit 0**:
архитектура Linux AMD64, FFmpeg и `@prisma/client` из установленного
`@gafus/prisma`, всё в `--network none --read-only`.

Первый Prisma runtime имел ошибку `Cannot find module
'.prisma/client/default'`. Исправленный Dockerfile копирует
сгенерированный Linux Client/Query Engine в runtime и содержит
`RUN require('@prisma/client')`. Повторная сборка была запущена,
но Docker обнаружил изменение исходных workspace-пакетов, не
использовал кэш `COPY packages`, начал **заново** установку всех
1754 зависимостей. При около 6,5 ГиБ свободного места на Mac
мы безопасно остановили **только** этот незавершённый тестовый build
(он не был PASS). Непроверенный старый локальный Prisma tag
удалён; production образы и облачные registry не трогали.

**Релиз до подтверждения нельзя считать готовым:** нужен Git commit,
содержащий полный Vite исходник и необходимые изменения пакетов,
затем **семь реальных full-build PASS** на GitHub AMD64 runner и
контроль запуска. Текущая ветка `vite` локально имеет множество
чужих незакоммиченных изменений, и `git ls-files apps/web-vite` всё
ещё не содержит файлов. Никакого commit/push, production deploy,
миграций БД или изменения production CI/CD не выполнялось.

## Обязательный fail-closed gate перед будущим cutover, 29.10.2026

- Проверять полный Git index со всеми новыми исходниками, миграциями и без приватных файлов: scripts/refactor/check-release-index.mjs.
- Без GAFUS_REFACTOR_PRODUCTION_CUTOVER=approved production jobs в main CI/Deploy Only пропускаются. Один merge/push не является разрешением.
- После approval cutover-preflight до публикации образов и reusable production deploy проверяют QA READY=YES, Hono/Worker/Chat2 media enabled, WSS URL, ключи в GitHub Secrets через scripts/refactor/check-chat2-prod-boundary.mjs --release.
- Centrifugo описан отдельным профилем chat2 и по умолчанию не включён. Реальный ingress TLS, здоровье WS, Cloud.ru, rollback и провайдеры требуют отдельного приёмочного прогона.
- На 29.10.2026 Release READY=NO; локальная конфигурация не доказывает production readiness.


## Vulnerability release blocking gate — 29 October 2026

The initial dependency audit found 7 critical and 70 high advisory instances; after conservative patch updates the lockfile audit has 0 critical and 16 high. pnpm audit --audit-level high still fails and production release must stay blocked. Remaining media, mail, schema and older markdown dependencies must be upgraded only with API/client/provider/native regression gates.

## Follow-up security outcome — 29 October 2026

The newer conservative security update reduced the audit to **0 critical / 1 high**: the remaining Zod 3 advisory requires cross-workspace schema/API compatibility work. The `pnpm audit --audit-level high` gate still returns nonzero and must not be bypassed. Native/provider E2E and all seven local linux/amd64 release images require verified PASS independently. The owner explicitly excluded Apple key rotation and historical Git rewrites from this task; neither is an active release operation.
