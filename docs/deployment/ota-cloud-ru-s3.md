# GAFUS OTA: Cloud.ru S3, без CDN

Статус на **14.11.2026**: **реальные Cloud.ru S3 PUT/HEAD/GET и анонимный GET, а также preview RSA-подпись в GitHub Actions — PASS**. Сам signed OTA ещё не раздаётся устройствам: нет отдельного preview API, подготовленного и физически проверенного нативного бинарника, завершённой интеграции исходников и обязательного мониторинга. В production релиз не публиковался.

Историческая документация: инфраструктура для публикации подписанных OTA-ассетов. Сам факт создания бакета **не активирует OTA на уже установленных бинарниках**: native-приложение должно быть собрано с `GAFUS_OTA_TRANSPORT=self-hosted`, проверенным профилем и сертификатом подписи. Адрес манифеста остаётся на API GAFUS (`/ota/manifest`) — для выборки по версии, платформе, каналу и rollout. На Cloud.ru S3 лежат **только неизменяемые JS-бандлы и ассеты**. Никаких CDN/прокси перед S3 пока нет.

## Cloud.ru Evolution Object Storage

- Бакет и глобальное имя: `gafus-ota-updates`.
- Класс хранения: «Однозонный» (временно рекомендован Cloud.ru для загрузок).
- Публичная база: `https://global.s3.cloud.ru/gafus-ota-updates`.
- S3 API endpoint: `https://s3.cloud.ru`, регион: `ru-central-1`, AWS Signature V4, `forcePathStyle: true`.
- Bucket Policy: **публичное чтение объектов (`GetObject`/`HeadObject`), без анонимной записи и удаления**. Публичный листинг бакета не требуется. CORS для нативного Expo Updates не нужен.
- Сервисный аккаунт `gafus-ota-s3-publisher` имеет только роли `s3e.editor` и `s3e.viewer` на бакете `gafus-ota-updates` (без ролей на соседних бакетах). Срок жизни ключа ограничивать, ротировать минимум ежегодно.
- Cloud.ru требует S3 Access Key ID вида `<tenant-id>:<key-id>`; Key Secret хранить исключительно в GitHub Actions Secrets. Не сохранять в код, логи, `.env` в Git и документацию.

Каждый подписанный релиз имеет ссылку вида:

```text
https://global.s3.cloud.ru/gafus-ota-updates/ota/preview/gafus/<runtime>/<ios|android>/assets/<sha256>.<ext>
```

Идентификатор `<sha256>` вычисляется локально, PUT использует `If-None-Match: *`, объект сверяется через авторизованные S3 `HEAD`/`GET`, затем повторно скачивается **анонимно по прямому публичному S3 URL** с проверкой SHA-256 и MIME. Никакого CDN. Для совместимости с существующим CI-контрактом в receipt ещё используется поле `cdnVerified`, но оно теперь подтверждает **прямой публичный S3 readback**, а не CDN.

## GitHub Actions: `gafus-self-hosted-ota-preview.yml`

Репозиторий `asmtv1/gafus`, вкладка **Settings → Secrets and variables → Actions**:

| Тип | Имя | Значение |
| --- | --- | --- |
| Variable | `OTA_PUBLIC_ASSET_ORIGIN` | `https://global.s3.cloud.ru/gafus-ota-updates` |
| Variable | `OTA_S3_REGION` | `ru-central-1` |
| **Environment variable (`ota-preview`)** | `OTA_S3_TENANT_ID` | Tenant UUID из настроек Evolution Object Storage (не секрет) |
| Secret | `OTA_S3_ENDPOINT` | `https://s3.cloud.ru` |
| Secret | `OTA_S3_BUCKET` | `gafus-ota-updates` |
| **Environment secret (`ota-preview`)** | `OTA_S3_ACCESS_KEY` | `Key ID` или готовый `<tenant-id>:<key-id>`; workflow добавляет tenant ID при необходимости и сверяет принадлежность |
| **Environment secret (`ota-preview`)** | `OTA_S3_SECRET_KEY` | `Key Secret` от того же сервисного аккаунта |

В GitHub создан отдельный environment `ota-preview` с **ограничением разрешённых веток только `main`**. Попытка включить required reviewers и wait timer отклонена GitHub API (HTTP 422: правила не поддерживаются текущим тарифом для этого приватного репозитория). Поэтому необходимы ручной запуск `workflow_dispatch`, обязательная проверка исходного SHA и отдельное действие администратора для публикации; **не считать environment защищённым approval gate**. Preflight останавливает job до установки зависимостей, если нужные секреты или переменные ещё не заданы, не показывая значения секретов в логах.

Для публикации обязательны подписывающий ключ, защищённые callback credentials, точный runtime/OTA update ID и подтверждённые private source maps в отдельном S3 bucket. Публичный OTA S3 не предназначен для хранения карт и приватных символов.

## Безопасный порядок запуска

1. Перенести изменения в согласованный Git commit. Убедиться, что подписанный self-hosted native build под нужную платформу/рантайм уже выпущен и проверен на физических устройствах, затем зарегистрирован на сервере GAFUS.
2. Запустить **вручную** GitHub Actions `GAFUS signed self-hosted OTA preview` с точным commit SHA, native release ID, runtime/version, платформой и ревизией. CI сверяет source/native fingerprint, типы, платежный граф, экспорт и подписывает манифест закрытым ключом.
3. CI заливает ассеты в S3, сверяет байты анонимным GET, загружает source maps приватно и сообщает API о подписанном релизе в состоянии `READY`. **Автоматической публикации для пользователей нет.**
4. После просмотра всех проверок администратор отдельно публикует релиз в панели GAFUS. Следить за cohort/rollout и ошибками Expo Updates.

Нельзя подменять URL updates уже установленного EAS-бинарника через JS OTA. Для него потребуется новый подписанный native-бинарник с self-hosted профилем; при этом механизм манифестов GAFUS продолжает отдавать версии и rollout через API.

## Smoke и контроль доступа

Проверить, что анонимные PUT и DELETE в бакет отвечают `403`, а анонимный GET отсутствующего объекта — `404` (не `403`). После первой фактической публикации проверить GET *существующего* ассета, его `Content-Type` и SHA-256. Корень бакета может отдавать `403` — публичный листинг не нужен.

Если ротация ключа не завершена и `OTA_S3_ACCESS_KEY`/`OTA_S3_SECRET_KEY` не заданы, **не запускать релиз**: workflow остановится до S3-upload, а приложение не получит OTA из пустого бакета.

## Исторический checkpoint до ввода S3-ключей (14 ноября 2026, устарел)

- Временный S3 access key от 14.11.2026 **отозван после восстановления консоли Cloud.ru**: после повторного удаления в разделе аккаунта отображается «Ключей доступа пока нет». Сервисный аккаунт оставлен **активным**, но сейчас у него нет действующих ключей доступа. Перед первой реальной OTA-публикацией создайте новый S3 access key и сразу поместите его ID и Secret напрямую в защищённые GitHub Actions Secrets. Не передавайте эти значения через чат, консольные логи или Git-репозиторий.
- Аккаунт `gafus-ota-s3-publisher` имеет только `s3e.editor`/`s3e.viewer` на `gafus-ota-updates`. Пока ключи CI отсутствуют, подписанная S3-публикация не проверена. Проверен только UI upload и независимый анонимный GET.
- Smoke-test: 51-байтовый объект создан в Cloud.ru, публичный GET ответил `200` с совпадением SHA-256, анонимный PUT и DELETE — `403`, после удаления тестового объекта GET — `404`. Ни одного OTA-релиза в бакет не загружено.
- Локальный код изменён в общем незакоммиченном рабочем дереве. Коммит/пуш не делались, чтобы не смешивать изменения с параллельными работами.


### Исторический checkpoint до S3-smoke и подготовки подписи (14 ноября 2026, устарел)

- Новый временный ключ `gafus-ota-s3-publisher` создан, но автоматическое сохранение в `GitHub Actions Secrets` было заблокировано защитой. **Этот ключ отозван**; Cloud.ru подтверждает `Ключей доступа пока нет`. Не использовать уже показанные или ранее созданные ключи. Следующий секретный ключ следует создавать и вводить непосредственно в GitHub Settings без передачи через чат или инструменты.
- В `ci-cd/docker/docker-compose.prod.yml` для сервиса `api` добавлены четыре переменные: `MOBILE_OTA_ASSET_ORIGIN` (прямой Cloud.ru S3), `MOBILE_OTA_CI_CALLBACK_TOKEN`, `MOBILE_OTA_DELIVERY_ENV` и `MOBILE_OTA_INSTALLATION_HASH_KEY`. У production callback и installation-hash уже есть независимые GitHub Secrets, но они попадут на сервер только с согласованным новым деплоем. Переменная `MOBILE_OTA_DELIVERY_ENV` пока не задана, поэтому доставка OTA отключена. Compose YAML разобран локально без ошибок. **Продакшен-контейнер не перезапускался**.
- В рабочем каталоге `/Users/asmtv1/Desktop/gafus-refactor` обнаружены многочисленные параллельные изменения других задач, а локальный `main` расходится с `origin/main` (на момент сверки 22 удалённых коммита впереди и три локальных коммита впереди). OTA-файлы по-прежнему не отслеживаются Git. Не выполнять общий `git add .`, merge, reset или `git push origin main`, пока не завершится отдельная интеграция исходников OTA и остальных агентов.
- Сервер `185.239.51.125` отвечает по SSH, `gafus-api` работает на ранее развёрнутом образе (`2026-11-09`). Текущий контейнер не имеет переменных `MOBILE_OTA_*`; публиковать подписанные OTA до доставки нового кода и проверенной нативной сборки нельзя.
- Защита `ota-preview` в приватном GitHub-репозитории ограничивает только ветку `main`; обязательное approval правило недоступно при текущем тарифе GitHub (HTTP 422). Не называть этот environment полноценным защищённым approval gate. Выпуск подписанного native preview IPA/AAB и проверка на физическом устройстве пока отсутствуют.

- В `.github/workflows/production-deploy-reusable.yml` добавлена генерация строк `MOBILE_OTA_ASSET_ORIGIN`, `MOBILE_OTA_CI_CALLBACK_TOKEN`, `MOBILE_OTA_DELIVERY_ENV`, `MOBILE_OTA_INSTALLATION_HASH_KEY` для будущего деплоя. Репозиторный CI callback token и environment-scoped `ota-preview` callback token различаются. Секрет `MOBILE_OTA_INSTALLATION_HASH_KEY` создан отдельно; `MOBILE_OTA_DELIVERY_ENV` **не задавать**, пока не будет подписанного и физически проверенного native build.


## Подтверждённые live-этапы (14 ноября 2026)

1. `ota-preview` в GitHub содержит **оба S3 credentials** и независимый token CI callback. `OTA_S3_TENANT_ID` хранится в environment variables (tenant ID — несекретный). Bucket/endpoint и публичный origin остаются в repo secrets/variables. S3 publisher допускает только `https://s3.cloud.ru`, `ru-central-1`, `gafus-ota-updates` и глобальный read-only origin.
2. [GitHub Actions S3 smoke, PASS](https://github.com/asmtv1/gafus/actions/runs/43515444099): conditional `If-None-Match:*` PUT → S3 HEAD → приватный S3 GET → **анонимный GET** из `global.s3.cloud.ru`, содержимое совпало побайтно. Проверка удаления: GET `/.smoke/ci-43515444099-1.txt` даёт **404**.
3. Создана отдельная RSA-3072 пара **только для preview**. Private key доступен только как `OTA_SIGNING_PRIVATE_KEY_PEM` environment secret; он не выводился в логи и не помещён в Git. Публичный сертификат: `apps/mobile/ota-public-certificates/gafus-preview-20261114.cert.txt`, SHA-256 `ec0afc4b4ac5935e7af1dc7a2d1f490e650e764a26f2dcd33e86d408d5ab0acf`, действителен до 12.11.2028 UTC. [GitHub Actions signing smoke, PASS](https://github.com/asmtv1/gafus/actions/runs/43519447154): подпись реальным секретом `ota-preview` проверена именно публичным сертификатом нативного клиента.
4. [Совмещённый GitHub Actions E2E, PASS](https://github.com/asmtv1/gafus/actions/runs/43520556320): синтетический JSON-манифест подписан RSA-3072 ключом из GitHub environment, помещён в Cloud.ru S3 через `If-None-Match:*`, скачан по публичному URL и **повторно проверен RSA-подписью после скачивания**. GET удалённого объекта `/.smoke/signed-43520556320-1.json` вернул `404`. Это проверка криптографии и доставки, а не установка OTA на устройство.
5. Все три GitHub smoke workflow были созданы в отдельных временных ветках и удалены после PASS. Правило разрешённых веток `ota-preview` снова **только `main`**. Никаких production-действий эти запуски не выполняли.
6. Live `expo config --json` для SDK 57 с реальным публичным сертификатом корректно выставил: signed preview key ID `gafus-preview-20261114`, `codeSigningCertificate=./.ota-certs/gafus-preview.pem`, `rsa-v1_5-sha256`, `expo-channel-name=preview`, `checkAutomatically=NEVER`, URL `https://preview.gafus.test/ota/manifest` **только как синтетический адрес при проверке конфигурации**. Никакого сервера по этому тестовому адресу нет. `.ota-certs/` и временный descriptor удалены.
7. Устранена циклическая зависимость нативного билда: регистрация pending native candidate допускает неизвестный пока SHA файла; только после сборки, распространения и физической проверки отдельная операция `VERIFY` атомарно фиксирует SHA в `attestation`. Неавторизованный клиент не может подтвердить релиз; до проверки `verified=false`. **3 теста PASS** на отдельной локальной PostgreSQL.
8. Полная локальная проверка `node scripts/gafus-ota-local-regression.mjs --execute --with-isolated-db` со строго ограниченными URL QA/compat PostgreSQL завершилась **20/20 PASS**: manifest `/tmp/gafus-ota-regression-20261114/manifest.json`. Это не production smoke или проверка настоящей установки на физических устройствах.

## Невыполненные обязательные release-gates

- **Preview API:** должен быть отдельный HTTPS origin, не `gafus.ru` и не `api.gafus.ru`, со своим проверенным окружением и сервером для `/ota/manifest`, `/api/v1/internal/mobile-ota/...`. На момент live-проверки `preview-api.gafus.ru`, `api-preview.gafus.ru`, `staging.gafus.ru` не имеют A-записей. Нельзя подменять origin production API ради обхода проверок.
- **GitHub Actions:** проверить защищённые environment secrets OTA и SYMBOLS, endpoint preview API и утверждённую подпись перед manual workflow.
- **Проверенная нативная поставка:** после выделения preview API нужен отдельный native IPA/APK/AAB SDK57 `1.8.0`, встроенный `nativeReleaseId`, сертификат, fingerprint от чистого Git snapshot; затем на **физическом** iOS/Android проверить установку, cold/background/update/rollback, и лишь после этого зарегистрировать verification evidence. Тестовый `expo config` не заменяет эти операции. Никакие App Store/TestFlight/Google Play версии не затронуты.
- **Исходники и production:** `main` локально расходится с `origin/main` и содержит порядка 1800 изменений разных агентов, включая общий Prisma/API/lockfile. Публикация текущего worktree через общий `git add .`, merge или push включила бы чужую незавершённую работу. Нужна отдельная согласованная интеграция OTA-изменений. Server API образ до неё без новых OTA-route/environment; production OTA не включать. Независимое production telemetry/callback Secret присутствует, но `MOBILE_OTA_DELIVERY_ENV` не установлен.
- **Source maps:** обязательно загружаются в приватный Cloud.ru S3 bucket с проверенным sha256; publish запрещён при отсутствии `GAFUS_OTA_SYMBOLS_REF` и защищённого approval.


## Безопасная локальная подготовка нового preview native-бинарника (без отправки в Store)

После согласованной интеграции исходников OTA в чистый Git commit и публикации отдельного preview API можно выполнить два **офлайн-этапа**. Они не требуют закрытого RSA-ключа на компьютере и **ничего не публикуют**. Нативный бинарник нельзя выпустить до регистрации кандидата, поскольку `nativeReleaseId` вшивается в бинарник.

Создайте вне репозитория конфигурацию `/tmp/gafus-ota-preview-native-config.json` (пример только для iOS; для Android указать `android`, `internal` и действительный номер сборки):

```json
{
  "platform": "ios",
  "distribution": "internal",
  "buildNumber": "188",
  "operationId": "gafus-preview-native-registration-188",
  "sourceSha": "<точный 40-значный SHA чистого коммита>",
  "apiOrigin": "https://preview-api.gafus.ru",
  "ciRunId": "native-ci-run-188",
  "buildLogRef": "native-preview-build-log-188"
}
```

`preview-api.gafus.ru` в примере — планируемый, **пока не настроенный** preview host. Применяйте команды только после появления реального HTTPS preview API. На чистом Git-снимке (иначе инструмент остановится) выполнить:

```bash
node apps/mobile/scripts/prepare-self-hosted-native-build.mjs prepare \
  /tmp/gafus-ota-preview-native-config.json \
  /tmp/gafus-native-candidate.json
```

Скрипт рассчитывает `nativeFingerprint` с учётом SDK57, Podfile/Android и всех нативных модулей, проверяет публичный RSA сертификат и точный source SHA. Полученный JSON соответствует `POST /api/v1/admin/mobile-ota/native-releases` (администратор GAFUS, без автоматического подтверждения). В кандидате **нет `nativeArtifactSha256`**, поскольку бинарник ещё не собран. После успешной регистрации сохраните возвращённый `nativeReleaseId` и выполните:

```bash
node apps/mobile/scripts/prepare-self-hosted-native-build.mjs finalize \
  /tmp/gafus-native-candidate.json \
  /tmp/gafus-native-descriptor.json \
  <nativeReleaseId>
```

Полученный `native.json` имеет `verified:false` и служит **только для сборки**, не для доставки OTA. Публичный сертификат `apps/mobile/ota-public-certificates/gafus-preview-20261114.cert.txt` нужно скопировать в игнорируемый `apps/mobile/.ota-certs/native.pem` и передать EAS/local build переменные `GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR`, `GAFUS_OTA_NATIVE_CERTIFICATE=.ota-certs/native.pem`, `GAFUS_OTA_TARGET_PLATFORM=ios|android`, `GAFUS_OTA_TRANSPORT=self-hosted`. Убедиться, что `expo config --json` указывает preview URL, каналы и `checkAutomatically=NEVER`. Само наличие дескриптора **не подтверждает физическую установку**.

После появления **настоящего** IPA/APK/AAB и ручной проверки на физическом устройстве создайте отдельный evidence JSON, явно указав `physicalDeviceVerified: true`, `distributionVerified: true`, уникальный `operationId`, осмысленные `reason` и `reference` (ссылка на проверку):

```bash
node apps/mobile/scripts/prepare-self-hosted-native-verification.mjs \
  /tmp/gafus-native-descriptor.json \
  /path/to/verified-build.ipa \
  /tmp/gafus-human-device-evidence.json \
  /tmp/gafus-native-verification.json
```

Инструмент читает архив, сверяет тип бинарника и доверенный сертификат, вычисляет SHA-256 **реальных байтов**, затем подготавливает тело `POST /api/v1/admin/mobile-ota/native-releases/:id/verification`. Он никогда не создаёт свидетельство физической установки сам и не вызывает API. Сервер атомарно привязывает первый SHA нативного артефакта только при `VERIFY`; до этого выпуск остаётся неподтверждённым. Прежде чем публиковать OTA, нужно провести **отдельную проверку подписанного JS-бандла на реальном установленном приложении**.

В OTA release workflow после чтения проверенного native descriptor действует дополнительный trust pin `verify-ota-preview-native-trust.mjs`: текущий подписывающий ключ `gafus-preview-20261114`, публичный X.509 сертификат, runtime, исходный commit и **тот же** HTTPS preview API/chat origin. Он также блокирует сертификат, до истечения которого осталось менее 30 дней. Ротация ключа требует нового проверенного native-бинарника, а не просто замены GitHub Secret.


## Локальная приёмка реальных SDK57 export и manifest (14.11.2026)

- Строгая регрессия `node scripts/gafus-ota-local-regression.mjs --execute --with-isolated-db` завершена **20/20 PASS** после внедрения новых проверок, на локальных изолированных PostgreSQL без production-запросов. Манифест: `/tmp/gafus-ota-regression-20261114-v2/manifest.json`.
- `verify-ota-preview-native-trust.test.mjs`: **5/5 PASS**, включая проверку настоящего закреплённого RSA-сертификата, источника, runtime, preview API и отклонение production endpoint/другого ключа.
- `prepare-self-hosted-native-build.test.mjs`: **5/5 PASS**. Двухфазный выпуск с реальным чистым временным Git-репозиторием: предрегистрация без SHA бинарника → присвоение ID → встраивание descriptor в нативную Expo-конфигурацию. Грязный checkout, подмена commit/fingerprint и production URL блокируются.
- `prepare-self-hosted-native-verification.test.mjs`: **6/6 PASS**: вычисление SHA-256 настоящих тестовых файлов IPA/APK; отказ без ручной проверки и при подмене сертификата, версии, URL и формата пакета. Проверку подписи реального Store-бинарника и установку на устройство это **не заменяет**.
- `mobile-ota.actual-app-mounted.test.ts`: **3/3 PASS** через **настоящее `apps/api/src/app.ts`** (не изолированный роутер). Проверены статус 404 для выключенного `/ota/manifest` и CI callback, статус 401 для анонимного admin. Redis rate limiter подменён локальным test double только в этом адресном тесте, отдельно от runtime.
- Два **настоящих `expo export --source-maps external`** SDK57 с опцией `self-hosted` и временным native descriptor прошли без ошибок. Итоги:

  | Платформа | Export-файлов | Source maps | Полный экспорт, байты | Signed OTA assets | Манифест, байты |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | iOS | 119 | 1 | 89 879 556 | 117 | 44 921 |
  | Android | 123 | 1 | 91 110 390 | 121 | 46 628 |

  Следующий офлайн-шаг `buildSignedOtaArtifact` и `verifyAndWriteLocalPreview` проверен на **реальном** `metadata.json` и реальных байтах Metro: каждый ассет пересчитан по SHA-256, выпущены неизменяемые filenames и RSA-подписанный манифест, затем результат сверен по байтам. Использовался **только одноразовый RSA-ключ тестирования**, созданный и уничтоженный в `/tmp`; он не соответствует закреплённому native trust anchor и **не предназначен для установки или публикации**. GitHub production/preview signing secret не покидал GitHub.
- Все source maps, временные тестовые ключи и signed offline assets удалены после проверки. Подкаталог `apps/mobile/.ota-certs/` также удалён. Это **dry-run текущего локального дерева**, не доказательство чистого релизного SHA или успешной физической установки.

До preview OTA обязательны отдельный preview API и database, точный native runtime, private S3 maps и проверенные IPA/APK/AAB. Не подменять fail-closed проверки.
