# Feed / «Моменты»: переход к прямому Beget CDN → Cloud.ru S3

Режим нового Feed: **один существующий бакет `gafus-feed-private`**. Дополнительный
бакет, перенос существующего поста и мобильный OTA/релиз не нужны. Gallery,
документы, курсы, вопросы и другие хранилища не затрагиваем.

## Что меняется в серверной части

- `FEED_BUCKET_PUBLIC=true` включает **только публичную выдачу готовых файлов** по
  ключам `posts/<owner>/<post>/attachments/<media>/...` и новый отдельный Beget CDN.
  `FEED_CDN_BASE_URL` — строго HTTPS-домен нового `*.begetcdn.cloud` без пути.
  Старый `garaquachegasourn.begetcdn.cloud` в публичном режиме запрещён.
- В новых URL нет подписей/CDN-секретов, но S3 POST для пользовательских загрузок
  остаётся подписанным. Серверный HLS ticket и URL манифеста остаются прежними.
- `FEED_BUCKET_PUBLIC=true` нужно также передать Cloud.ru Feed photo/video jobs,
  чтобы конечные объекты получали `Cache-Control: public, max-age=180,
  s-maxage=86400, must-revalidate`. Исходники и временные `incoming` закрыты.
- `FEED_CDN_HEALTH_OBJECT_KEY` задаётся ключом **существующего тестового WebP**
  в `posts/.../attachments/.../thumb.webp`. Проверка здоровья требует HTTP 200
  и `image/webp`. Анонимный 403/404 для несуществующих ключей не считается успехом.
- Перед переключением убедиться, что для Feed не осталось незавершённых purge
  receipts от старого CDN: новая проверка подтверждает операции только для своего
  service ID и специально не считает старые чеки подтверждением нового CDN.
- В режиме нового CDN Cloud.ru manifest/release исключает Feed Origin из
  **списка управляемых ресурсов**, но не удаляет старый сервис автоматически.

## Нельзя делать без отдельного разрешения на production

1. Задать бакету Cloud.ru публичное глобальное имя/домен, если требуется.
2. Сохранить текущие Public Access Block, Bucket Policy, адреса CDN и конфигурацию.
3. Разрешить **только** `s3:GetObject` для
   `arn:aws:s3:::gafus-feed-private/posts/*/attachments/*`, используя локальный
   проверенный шаблон `infra/cloudru/feed-public-bucket-policy.json`.
   Не предоставлять анонимные `PUT/DELETE/LIST`, чтение `incoming/*` или доступ
   к Gallery/документам. Проверить через `private-bucket-guard.mjs --plan`.
4. Для **существующего** бакета Cloud.ru задать в личном кабинете доменное имя
   `gafus-feed-private` и отдельно подтвердить анонимный `200 image/webp` по URL
   `https://gafus-feed-private.s3.cloud.ru/posts/.../attachments/.../*.webp`.
   Глобальный URL `https://global.s3.cloud.ru/gafus-feed-private/...` не подходит
   для CDN с источником-доменом без возможности добавить префикс пути.
   Документация Cloud.ru для уже существующего бакета требует редактировать
   доменное имя именно в личном кабинете:
   https://cloud.ru/docs/s3e/ug/topics/faq__set-dns-name
5. После проверки адреса создать **отдельный** Beget CDN через `POST /v1/cloud`
   (`configuration_id: cdn_v1`, `source_service_type: DOMAIN`,
   `domain: gafus-feed-private.s3.cloud.ru`, `source_protocol: HTTPS`).
   Источник Beget нельзя изменить после создания, поэтому не создавать CDN с
   неработающим origin и не перенастраивать прежний Feed CDN или Gallery.
   18.10.2026 CDN с ошибкой SSL `WORKING_NO_SSL` **пересоздан** через Beget API:
   - старый ID `0d70317f-3c69-4f8b-9dd7-b31f01018b2b` удалён
     (`DELETE /v1/cloud/{id}` = `success`), прежний домен
     `quatihifudrerom.begetcdn.cloud` больше не используется;
   - **новый ID** `cbb7fe86-a193-457e-a756-9cf3aa2aef1b`;
   - **новый домен** `https://quepraquiecebquomiel.begetcdn.cloud`;
   - HTTPS-источник `gafus-feed-private.s3.cloud.ru`;
   - кэш CDN 86400 секунд, публичные ссылки без secure-token,
     GET/HEAD/OPTIONS, HTTPS redirect включён;
   - браузерный `Cache-Control: public, max-age=180, must-revalidate`;
   - stale отключён, `Access-Control-Allow-Origin: *`, `nosniff`.
   Проверка 18.10.2026 после выдачи SSL:
   - Beget API подтверждает `status=WORKING`, `ssl_enabled=true`;
   - HTTPS HEAD для тестового `poster.webp` с production-хоста: HTTP/2 200,
     `image/webp`, 58 байт, `x-cdn-edge-cache: MISS`,
     `Cache-Control: public, max-age=180, must-revalidate`;
   - запрос точечного purge `/v1/cloud/cdn/<new-id>/purge-cache-by-paths`
     на единственный synthetic `poster.webp`: HTTP 200, без поля error.
   Результат live-acceptance, 18.10.2026:
   - `HIT` повторного GET доказан на временном WebP с корректным
     `Cache-Control: public, max-age=180, s-maxage=86400, must-revalidate`:
     200/MISS → 200/HIT (job `eeb033237f56d5de`, exit 0).
     Старый постоянный smoke-объект `private, no-store` закономерно всегда MISS;
     это не следует путать с неисправностью нового CDN.
   - MPEG-TS тестовый сегмент, созданный ffmpeg: 752 байта (4 пакета × 188);
     `video/mp2t` HTTP 200, частичная выдача HTTP 206,
     `Content-Range: bytes 0-3/752`, после кэша HIT.
   - HLS `playlist.m3u8` HTTP 200 `application/vnd.apple.mpegurl`, HIT.
   - Существующий временный `incoming/source.jpg` без подписи → HTTP 403.
   - Временные тестовые ключи удалены через S3 API, точечный Beget purge
     вернул 200 и `cdn`. После распространения purge и сегмент, и playlist
     вернули 404/MISS (job `f899ac15170484dc`, exit 0).
   - Для Web/API/Feed Cloud выполнены typecheck; 25 mobile media/HLS тестов,
     49 Feed/CDN и 12 инфраструктурных тестов прошли.
   - Production по-прежнему использует `FEED_BUCKET_PUBLIC=false` и
     `https://garaquachegasourn.begetcdn.cloud`; новый CDN в production
     **не включён**. Реальная проверка установленных Android/iOS после
     переключения, Web публикации/удаления и end-to-end при новых переменных
     невозможна до согласованного релиза. Не отключать старый Origin.

   Точные новые runtime-настройки для одновременного release (не применять
   частями на текущем production):
   ```text
   FEED_BUCKET_PUBLIC=true
   FEED_CDN_BASE_URL=https://quepraquiecebquomiel.begetcdn.cloud
   FEED_BEGET_CDN_SERVICE_ID=cbb7fe86-a193-457e-a756-9cf3aa2aef1b
   FEED_CDN_HEALTH_OBJECT_KEY=posts/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/attachments/bef94b1b82bd47a6b05325ec8be2b22e/poster.webp
   ```
   Эти переменные необходимо синхронно доставить в API, Web, worker и
   Cloud.ru Feed Jobs; проверять старые мобильные версии и откат.
   Existing Feed WebP в S3 имеют `private, no-store`: их новый CDN будет
   доставлять, но cache HIT не гарантируется до безопасной отдельной миграции
   metadata. Пользовательские S3-объекты в рамках acceptance не изменялись.
   Production workflows на `main` теперь передают публичный Feed mode и
   новый CDN во все обязательные шаги: push preflight, Cloud.ru scheduled jobs,
   приложение и worker, post-deploy smoke, ручной synthetic acceptance.
   `FEED_CDN_HEALTH_OBJECT_KEY` заимствуется из защищённой GitHub переменной
   `BEGET_FEED_SMOKE_FINAL_KEY`, новый GitHub secret не требуется.
   Долговечный smoke WebP был загружен с `private, no-store`: только для его
   проверенного key+SHA скрипт принимает `MISS`, продолжая строго проверять
   содержимое, тип, HTTPS GET/HEAD/Range. `HIT` для публичных объектов доказан
   отдельным live synthetic acceptance. Для любого нового smoke HIT обязателен.
   Релиз по push не запускать до утверждённого набора коммитов Main.
6. Проверить GET/HEAD финальных WebP/HLS и отрицательные проверки доступа к
   исходникам и записи; дважды проверить политику чтением через API Cloud.ru.
7. Перед переключением установить runtime `FEED_BUCKET_PUBLIC=true`, адрес
   нового CDN и fixture одновременно для API/Web и Feed Jobs; выполнить контроль
   совместимости установленных Android/iOS и Web без новых мобильных сборок.
8. Только после успешных end-to-end проверок и разрешённого CI/CD отключить
   `gafus-feed-origin`. Gallery Origin и Cloud.ru Jobs продолжают работать.

## Блокирующие критерии

- Любой анонимный доступ к `incoming/*`, Gallery или документам — **стоп**.
- Сбой публикации, HLS/фото на старых клиентах, удаления или CDN purge — **стоп**.
- Нельзя считать локальные тесты подтверждением Cloud.ru, Beget или совместимости
  установленных мобильных версий. Должны быть реальные acceptance-проверки.
- Откат: сохранить предыдущий Backend, Bucket Policy/PAB и старый CDN. Сначала
  вернуть его и проверить доставку, после — вновь закрыть публичный S3.

Production-конфигурацию и инфраструктуру менять только после отдельного разрешения.
