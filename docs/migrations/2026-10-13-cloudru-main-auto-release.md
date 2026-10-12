# Cloud.ru media: автоматический релиз из main (подготовка)

> **Статус: код подготовлен, запуск в production НЕ разрешён до закрытия preflight-блокеров.**
> Этот документ отражает состояние локального рабочего дерева, а не факт выполнения деплоя.

**Результаты локального gate:** Web `next build` — PASS (108 статических маршрутов, код 0); API `tsup build` — PASS; Web/worker typecheck — PASS; `pnpm test:cloudru-media` и Cloud.ru worker tests — PASS; YAML и `git diff --check` — PASS. Montserrat подключён из локального SIL OFL пакета, без fetch Google Fonts во время сборки.

## Желаемый результат

Один push в main запускает всю цепочку без ручного развертывания Cloud.ru:

1. \`cloudru-media-contracts\`: offline-тесты безопасности, CORS, API контракта, S3 и Job dispatcher.
2. \`cloudru-build-media-images\`: сборка 4 linux/amd64 OCI образов именно этого SHA в приватный Cloud.ru Registry.
3. \`cloudru-prepare-media\`: проверка подписи/CDN TLS и secret header **до** изменения конфигурации; синтетический PUT/HEAD/GET/DELETE во всех 3 Cloud.ru приватных S3; создание двух прогретых (min replicas 1) защищённых Origin и трёх остановленных, безопасно повторяемых Container Jobs; создание неактивных Yandex CDN Origin Groups.
4. \`deploy-production\`: резерв предыдущих runtime/image/tag/конфигурации вне checkout, резерв БД и Prisma migrate deploy, обновление API/Web/worker; проверка health/worker. Не пересоздаёт PostgreSQL/Redis принудительно и не вызывает compose down при ошибке.
5. \`cloudru-activate-cdn\`: переключение подписанных Yandex CDN на прогретые Cloud.ru Origin, 15+ корректных GET для реальных WebP и синтетического MPEG-TS HLS-сегмента, HEAD 200, Range 206, недействительные/просроченные подписи 403/410, проверки Web/API, попытка отката CDN и Web/API при ошибках.
6. Постоянно после релиза: cron-воркер вызывает три Cloud.ru Container Jobs раз в минуту. Доступ к задачам, аренды, повторы, обработка ошибок остаются под контролем GAFUS core.

**Yandex CDN сохраняется как edge**: gallery-dev.gafus.ru и feed.gafus.ru. Все три бакета Cloud.ru остаются приватными: \`gafus-gallery-private\`, \`gafus-feed-private\`, \`gafus-documents-private\`. Обучающие курсы и прочий публичный CDN остаются на прежних маршрутах.

## Однократная настройка перед первым push в main

В **GitHub Environment \`production\`** должны быть секреты:

- Cloud.ru: \`CLOUDRU_PROJECT_ID\`, \`CLOUDRU_KEY_ID\`, \`CLOUDRU_KEY_SECRET\`, \`CLOUDRU_S3_ACCESS_KEY_ID\`, \`CLOUDRU_S3_SECRET_ACCESS_KEY\`.
- Защищённые Origin: \`GALLERY_ORIGIN_SECRET\`, \`FEED_ORIGIN_SECRET\`; **не** использовать CDN MD5 signer как Origin secret.
- Согласование с текущим CDN: \`GALLERY_CDN_SECRET\`, \`FEED_CDN_SECRET\`, \`FEED_YC_SERVICE_ACCOUNT_KEY\`.
- Обработчики Core: \`GALLERY_INTERNAL_HMAC_SECRET\`, \`FEED_INTERNAL_HMAC_SECRET\`.

Готовность Yandex CDN должны подтверждать: точный \`CNAME\`, \`READY\` сертификат, MD5 signing key, статический secret header, HTTPS Host и ожидаемый Origin resource. Существующий \`feed.gafus.ru\` ранее иногда отдавал 504 при распространении изменений CDN; скрипт ограниченно повторяет тесты, а при неуспехе пытается восстановить старый origin group.

**Проверенные блокеры (до реального релиза):**

- В GitHub Environment production отсутствуют семь обязательных Cloud.ru/Origin Secrets; попытка конфигурации через инструмент была заблокирована системой безопасности. Значения необходимо установить отдельно перед первым push.
- По прямому решению владельца 13 октября перенос старых Gallery/Feed из Yandex S3 отключён. CI больше не требует ListObjectsV2 старых бакетов и не копирует их.
- В производственной базе всё же обнаружены GalleryPhoto 25 (ready 8), FeedMediaAsset 9 (ready 8), PetDocument 11, QuestionPhoto 5. Целевые Cloud.ru S3-бакеты на момент проверки были пустыми. Без переноса исторические вложения, хранящиеся в Yandex S3, могут стать недоступны после переключения источника CDN. Это принятый владельцем риск, а не гарантия сохранения доступности.
- Первая реальная цепочка \`main → Cloud.ru → CDN → live Web/API\` ещё **не выполнялась**. Юнит-тесты и staging CDN acceptance не равнозначны полноценному релизу.

## Откат и ограничения

При ошибке этапа подготовки production Web/API не трогается. После начала обновления VPS deploy предпринимает восстановление предыдущего runtime из резервных Docker image tags и \`.env\`. При сбое CDN release пытается вернуть прежние Yandex CDN Origin Groups, а затем отдельно восстановить прежний Web/API. **Это best-effort механизм**, а не транзакционный откат облачных и Docker ресурсов.

Prisma migration **не откатывается автоматически**, новые загрузки, произведённые между переключением приложения и завершением CDN, могут потребовать отдельно сверить Cloud.ru S3 и старое хранилище. Пока не проверена сквозная согласованность и доступность всех источников, нельзя утверждать нулевой простой или полную атомарность переключения. Нужны разрешение начальных блокеров и end-to-end проверка до push в main.

**Курс-видео и сборки Mobile этим выпуском не переводятся.**
