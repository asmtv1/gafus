# Просмотр исторических медиа через реальный Beget CDN — только чтение

Это отдельный **локальный** opt-in режим Refactor, не деплой и не настройка production.
Он нужен, чтобы открыть старые Gallery/Feed объекты по уже сохранённым ключам
в локальной восстановленной БД **не копируя файлы в MinIO**. Изображения
отдаются браузеру прямыми краткосрочно подписанными HTTPS URL Beget CDN.
HLS-плейлист читается по Beget CDN GET ограниченно в памяти API; сегменты
подписываются отдельно и запрашиваются браузером напрямую из CDN.

## Безопасность

- Локальные PostgreSQL, Redis, MinIO и все остальные провайдеры не переключаются
  на production. **Нет S3/API прав на запись, удаления или purge в Cloud.ru/Beget**.
- В режиме `GAFUS_LOCAL_READONLY_CDN=enabled` команды изменения Галереи и
  Моментов (POST/PATCH/PUT/DELETE) возвращают 405; узкое исключение —
  `POST /api/v1/feed/media/:id/playback`, который **только** создаёт
  краткосрочный HLS-билет и не изменяет данные. Этот режим — **не**
  приёмка загрузки/редактирования новых медиа, а проверка живой доставки
  **существующих** объектов. Для обычной разработки режим выключается.
- Действуют оригинальные правила авторизации и доступа к альбомам/публикациям.
- В режим не передаются ни production S3 access keys, ни параметры бакетов:
  используются только **секреты подписывания CDN-ссылок**, сохранённые
  в отдельном файле с правами 0600 в `.local-pg-scratch`.
- Файл `.local-pg-scratch/live-media-cdn-readonly.json` (папка 0700),
  не должен попадать в Git, чаты, логи, PR, скриншоты или shell history:

  ```json
  {"gallery": "<actual Gallery CDN signing secret>", "feed": "<actual Feed CDN signing secret>"}
  ```

  Значения должны быть **реальными CDN signing secrets**, а не токеном Beget
  API. Настраиваются владельцем через доверенный менеджер секретов. Не
  придумывать значения и не считывать секреты из GAFUS Main.

## Запуск после безопасной установки секретов

Из разрешённого каталога `/Users/asmtv1/Desktop/gafus-refactor` на ветке `vite`:

1. Убедиться, что Hono не занимает порт 3001, MinIO 9000 и локальная БД/Redis
   работают. Не выключать другие приложения или процессы без проверки.
2. Запустить `zsh scripts/refactor/moments-live-local-3001.sh --readonly-cdn`
   вместо обычного локального Hono. Его guard проверит root, branch, среду и
   разрешения секретного файла; сбой приводит к отказу, не к прод-подключению.
3. Запустить локальный web через `zsh scripts/refactor/ag2-local-web-hono-run.sh --run`
   (Vite 5173 → Hono 3001, а не порт 4174 с моками).
4. Запустить `node scripts/refactor/verify-live-media-cdn-readonly.mjs`.
   Скрипт берёт 4 существующих ключа **только SELECT** из Refactor WORK DB;
   проверяет живые `GET` Gallery WebP, Feed WebP, HLS manifest и Range TS,
   сигнатуру байтов, HTTP-статусы и HLS CORS. Нет скачивания файлов на диск,
   записи в DB, Cloud.ru или CDN; в выводе нет private keys/URL/secret.
5. В браузере под авторизованным пользователем проверить `/profile/albums`,
   `/feed`, обложки, полноразмерные фото, HLS видео, Network (200/206, Beget CDN).

## Статус на 26 октября 2026

Код режимa, guard, библиотечные сборки, типизация Gallery/Feed и тесты
локальной подписи URL реализованы. Восстановлен Vite proxy на Hono (без сессии
ожидается 401, не 502). С Mac проверочные HTTPS соединения к
`s3.cloud.ru` и обоим `*.begetcdn.cloud` закончились тайм-аутом. Затем
через **read-only Beget API** получены реальные signing keys обоих необходимых
CDN, сохранены только в локальном игнорируемом Git защищённом 0600 файле,
без вывода в логи. Активирован `--readonly-cdn` на Hono 3001: API выдаёт
реальные подписанные CDN URLs из локальной восстановленной базы.
Авторизованный HTTP smoke через Vite успешно проверил 8 сценариев:
Gallery thumb/full/album/auth/405, Feed thumb/full/list/405 и HLS poster.
Первый HLS ticket POST получил 405; после этого код разрешил **только**
read-only `POST /media/:id/playback`, пакет пересобран и Hono перезапущен;
unit-контракт проверен. Повторное реальное HTTP подтверждение билета ещё
не получено.

**4 попытки реальных прямых HTTPS GET** по подписанным URL (Gallery WebP,
Feed WebP, playlist.m3u8, сегмент HLS) завершились тайм-аутом сети на Mac.
Следовательно, **успешная загрузка живых медиа по CDN не подтверждена**.
По read-only Beget API `cors.enabled=false` для Feed CDN — потенциальный риск
CORS браузерных запросов HLS.js; фактический `Access-Control-Allow-Origin`
нужно проверить на живом CDN ответе, не менять production настройки вслепую.
Нельзя объявлять медиа восстановленными по результатам только тестов подписи,
DTO и моков.

Важно: в локальной БД сейчас `GalleryPhoto ready=3, failed=34`; отсутствующие
в выдаче failed записи не появятся от замены CDN ссылки. Для них требуется
отдельная read-only сверка storage inventory, статусов и workflow обработки.

## Сетевой диагноз (27 октября)

Read-only Beget API `GET /v1/cloud` доступен и сообщает `RUNNING/WORKING`
и `ssl_enabled=true`; это **управляющий API**, не CDN edge. Прямые
проверки `curl` (root HEAD и ранее signed object GET) и Python SSL от Mac
завершаются TLS-handshake timeout после успешного TCP connect к CDN и S3.
HTTP :80 edge отвечает, HTTPS :443 не завершает TLS на разных IP/версиях.
Все эти соединения маршрутизируются через сетевой туннель `utun4`.
Приоритетная гипотеза — фильтрация/маршрутизация туннеля либо доступность
edge для исходящей сети; замена URL, `HEAD` на `GET` или подписи не исправит
TLS до HTTP. Проверить поведение из другой разрешённой сети прежде, чем
менять production CDN настройки.


## Проверка CDN с обходом Mac-туннеля и статус origin (27 октября, 01:39–01:46 UTC+4)

Продолжение read-only диагностики после проверок с production-хоста, результаты
которых пользователь передал в чат (production через текущие инструменты НЕ
открывали):

- Без изменения таблицы маршрутизации/VPN `curl --interface en0` на Mac
  устанавливает HTTPS к Gallery и Feed Beget CDN: оба `GET/HEAD /` возвращают
  **410** за ~0.4 с. Тот же запрос обычным маршрутом через `utun4` завершается
  `SSL connection timeout` (TCP connect происходит). `s3.cloud.ru` через `en0`
  отвечает по HTTPS **400** на `/`, TLS успешен, обычным маршрутом TLS timeout.
  Значит, один блокер — сетевой маршрут Mac через туннель.
- Через `en0` 4 подлинных исторических final-key из изолированной WORK DB,
  подписанные по защищённым Beget API ключам (Gallery WebP, Feed WebP,
  HLS playlist, HLS .ts), **все вернули HTTP 404**, до 0.42 секунды.
  Это НЕ `410 /` и НЕ тайм-аут. Файлы локально не скачивались.
- Контроль подписи: корректно вычисленный `https://CDN/md5(token,expiry)/final-key`
  даёт **404**; тот же ключ с намеренно повреждённым токеном — **403**;
  отсутствие токена — **410**, для обоих CDN. Это подтверждает, что
  **CDNvideo path-style подпись проходит авторизацию**. Формат Beget KB
  `?md5=...&expires=...` в этих тестах дал 410 и для текущих CDN-ресурсов
  НЕ является заменой действующему формату. Signing code не переписывали.
- Управляющий Beget API (200) подтвердил действующие source bindings:
  `mepsuduyokabib.begetcdn.cloud` → retired Gallery Container App upstream,
  `garaquachegasourn.begetcdn.cloud` → `gafus-feed-origin.containerapps.ru`,
  обе по протоколу **HTTPS**.
- Обе точки источника доступны через `en0` по TLS (IP **37.44.197.215**),
  но `GET /` и `GET` по тем же 4 final-key возвращают
  **404** JSON `{"error_msg":"404 Not Found"}`, заголовок
  `server: Evolution API Gateway`.
  При этом реализация `apps/feed-cloud/src/origin.ts` и
  `apps/gallery-cloud/src/origin-handler.ts` должна вернуть **403** без
  секретного origin-заголовка ещё до чтения S3. Реальный ответ не похож на
  ответ наших origin handlers, а указывает на API Gateway до приложения.
  Вероятные причины — отсутствие/неактивность привязки доменов к origin,
  отсутствие развёрнутого сервиса или проблемы правил маршрутизации
  ContainerApps/Evolution Gateway; по внешнему ответу 404 нельзя выбрать одну.
  Отсутствие файлов в S3 **не доказано**. Приложение нельзя считать исправным.
- Дополнительно обнаружено, что Feed origin по исходному коду жёстко исключал
  `hls/playlist.m3u8` (при том что `apps/feed-cloud/src/worker.ts` создаёт такой
  объект с MIME `application/vnd.apple.mpegurl`). В Refactor изменён
  `apps/feed-cloud/src/origin.ts`: строго для final-key плейлистов допущены
  GET/HEAD с лимитом **65536 байт**, правильным MIME, origin-secret guard,
  исходным private no-store. Отклонение incoming/source и иных MIME сохранено.
  Тесты `apps/feed-cloud/src/origin.test.ts` дополнены.
  **Feed Cloud 23/23 tests PASS**, `@gafus/feed-cloud-runtime typecheck PASS`,
  `@gafus/feed-cloud-runtime build PASS`, scoped git diff check PASS.
  Изменения только локальные в Refactor, **без деплоя на production**.

Следующий внешний инфраструктурный шаг (в отдельном GAFUS Main проекте):
read-only проверить, что оба `containerapps.ru` домена привязаны к
действующим origin services и что origin endpoint отвечает **403** на запрос
без origin secret (а не JSON 404 от gateway), затем проверить оригинальные
S3-ключи за защищённым origin, без раскрытия секрета в логах.
Не включать production deploy/изменения без отдельного согласования.
