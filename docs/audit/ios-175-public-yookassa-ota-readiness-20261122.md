# iOS 1.7.5 — публичный OTA с ЮKassa: готовность и блокирующие проверки

Статус: **подготовка завершена на уровне JS/OTA; публичная публикация ещё не выполнена**. Владелец сообщил о письменном разрешении Apple на возврат ЮKassa через OTA, без новой нативной сборки. Содержание письма самостоятельно не проверялось. Оставшиеся технические проверки: native QA attestation, production CI, тестовый платёж и откат. API/CI переключатели по умолчанию выключены.

## Что подготовлено

- Отдельный подписываемый контент-профиль `ios-public-yookassa` (только `ios`, `app-store`, runtime `1.7.5`). Никаких изменений нативного runtime через OTA.
- `ALL` для подписанного платёжного пакета разрешается только при `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED=true` на API-сервере. По умолчанию запрещён.
- Выдача права оплаты обычным пользователям возможна только при `MOBILE_OTA_IOS_YOOKASSA_ENABLED=true` **и** `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED=true` на API, после наблюдения запуска ровно опубликованного OTA. По умолчанию выключено.
- `TEST`/`ALL` независимы от Android; остановка `STOP` и пакет `RECOVER` без checkout остаются механизмом аварийного отката. Смена флага API может мгновенно остановить новые чеки, но уже начатые платежи и подписки требуют штатного завершения.
- Тестовый профиль `internal-yookassa` ограничен внутренними сборками; профиль `ios-public-yookassa` для App Store выбирается вручную в workflow.

## Фактическое состояние на 22 ноября 2026 года (read-only)

- App Store Connect: iOS GAFUS 1.7.5, выбран **build 101**, статус «Готово для распространения». Локальный Xcode-архив сборки 101 имеет именно тот fingerprint, OTA-сертификат, канал, runtime и URL, что в реестре; `codesign --verify --deep --strict` проходит. Требуется ещё независимая проверка того, что это идентичный App Store IPA.
- Production PostgreSQL: в `MobileNativeRelease` для iOS 1.7.5 пять App Store-сборок (97, 98, 99, 100, 101) и две internal (17501, 17502); **все `verified=false`, все `embeddedUpdateId IS NULL`**.
- Для iOS 1.7.5 нет записей `MobileOtaRelease` и `MobileOtaPublication`. API: `MOBILE_OTA_IOS_YOOKASSA_ENABLED` выключен, оба новых публичных переключателя отсутствуют/выключены.
- Локальные Xcode-архивы 1.7.5 сборок 98, 99, 101 содержат Expo signed self-hosted OTA `https://gafus.ru/ota/manifest`, runtime 1.7.5 и встроенный Expo update ID. В архивных entitlements нет `com.apple.developer.storekit.external-purchase-link`. Наличие архивов не подтверждает совпадение с App Store IPA.
- `main` сохраняет `apps/mobile/app.json` и `apps/mobile/package.json` на **1.7.6 для Android**. В отдельной рабочей ветке `release/ios-175-yookassa-ota` (`/Users/asmtv1/Desktop/gafus-ios-175-ota`) версия приложения и пакета **1.7.5**. Ветка основана на исходном коммите App Store build 101 `f6e6994e1167e9dbdf4c9ab13bbfbcaa7168c9d2`. После внесения JS-only изменений нативный SHA-256 fingerprint всё ещё совпадает с реестром: `284430e1d2a1a137be0a456b69731c40c1a266d608669c7b00e2d34b1f5150f1` (79 входов). Подготовленный release-source коммит: `322e95ec5`.
- В CI добавлена ветка доверия только для `ios` + runtime `1.7.5`: source SHA обязан быть **точным HEAD** ветки `release/ios-175-yookassa-ota`, допускаются профили `standard` или `ios-public-yookassa`; native SHA всё равно должен быть предком источника и fingerprint должен полностью совпадать. Для Android и остальных платформ сохраняется проверка по `origin/main`.
- На подключённом физическом iPhone стоит GAFUS **1.7.5 (99)**, не App Store build **101**; этот телефон пока нельзя считать QA-доказательством build 101.
- Офлайн выполнены **настоящие Expo Hermes/Metro exports** из релизной ветки (без production signing и публикации): `ios-public-yookassa` — 8 526 392 байт, 115 ассетов, HBC SHA-256 `b0eec222f8ae69c60513e7e3dad344ec9c3098764aba78fceed76e4ada7b269c`; `standard` (для отката) — 8 501 756 байт, 115 ассетов, HBC SHA-256 `8a74fd9818c2447086c0e75445e84743769dbc621e948d2c8ef67e902302d06c`. Верификатор бандла подтвердил наличие checkout только в первом профиле.
- Для offline-smoke использовался временный, **имитационный** descriptor с `verified=true`, а на проде запись build 101 по-прежнему `verified=false`. Тестовый дескриптор не является источником доверия для подписи или публикации.

## Блокирующие условия до выпуска

1. **Подтверждение Apple**: пользователь сообщает, что имеет письменное разрешение на такой OTA без нового App Store-бинарника. Не добавлять в технический выпускной скрипт запрет из-за отсутствия нового native entitlement. Для последующего аудита сохранить текст/дату письма и фактический охват разрешения (при наличии), не представлять неподтверждённое письмо как собственную проверку.
2. **Установка на устройство**: IPA build 101 подписан как App Store distribution и не устанавливается напрямую через `xcrun devicectl`: `0xe800801f (Attempted to install a Beta profile without the proper entitlement)`. После отказа на подключённом физическом iPhone остался GAFUS 1.7.5 build 99. Для физического QA build 101 нужен штатный канал установки App Store/TestFlight, а не изменение подписи в IPA.
3. Для build 101 завершить независимое подтверждение фактического App Store IPA и физическую QA-проверку на устройстве (сейчас подключённая сборка 99). Штатно зарегистрировать `embeddedUpdateId=cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e` и `verified=true` только через API админки после фактических доказательств. Production native ID `0093f03d-3a04-4968-878c-c7e30f77fa66` пока НЕ verified; не подменять проверку SQL-правкой.
4. Проверить YooKassa prod-ключи, webhook/callback, idempotency платежей, начисление Premium, тарифы, отмену автопродления, возврат средств, отсутствие двойной подписки Apple+ЮKassa и UI на реальном iPhone 1.7.5.
5. Отдельно собрать `ios-public-yookassa` через GitHub Actions **после** выполнения пп. 1–4. Затем протестировать TEST с ограниченными аккаунтами (admin/asmtv1), опубликовать подписанный пакет `ALL` без mandatory, проверить мониторинг; иметь подписанный `standard` recovery с новой ревизией и командой STOP/RECOVER.

## Действия оператора после снятия блокировок

- Подписать разрешённую для соответствующего storefront нативную сборку и занести её в реестр; до этого не включать новый checkout.
- Проверить CI `payment_content=ios-public-yookassa` на выбранном verified `native_release_id`, `platform=ios`, `runtime_version=1.7.5`; запускать только из `main`, новый revision/update_id, signed assets в Cloud.ru S3.
- TEST → наблюдение OTA на физическом iPhone и реальная тестовая оплата → включить `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED=true` → проверить preview `ALL` → публиковать `ALL` → включать API `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED=true` при сохранённом общем kill-switch.
- При инциденте немедленно выключить публичный API-флаг, остановить OTA через `STOP`, затем публиковать подписанный `standard` RECOVER; отдельно сверить незавершённые платежи.

Нельзя считать изменение `distribution` или показ платёжной кнопки подтверждением разрешённости внешней оплаты в App Store.

## Подтверждённые артефакты и последние технические проверки

- App Store build 101 IPA: `apps/mobile/gafus-1.7.5.ipa`, 124 532 291 байт; SHA-256 `af7c70284c21dbafbe5d813042df0798d9afdf91a5e8d181aef70265f222970f`. `codesign --verify --deep --strict` для извлечённого приложения проходит; `TeamIdentifier=PJQ8PP666S`, `bundle=ru.gafus.app`, `CFBundleVersion=101`.
- В IPA build 101 OTA `runtime=1.7.5`, `channel=production`, native fingerprint `284430e1d2a1a137be0a456b69731c40c1a266d608669c7b00e2d34b1f5150f1`, pinned certificate SHA-256 `58859944bd6e3837b579ede3b5bcb2197db31dcbbae0d3264196fd88b3c667ca`, embedded update ID `cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e`; URL `https://gafus.ru/ota/manifest`.
- IPA содержит URL-схему `gafus://`; `https://gafus.ru/subscription-return.html` отдаёт HTTP 200. В production API присутствуют переменные YooKassa shop id/secret и web URL. Секреты не копировались и не выводились.
- `EXUpdatesCheckOnLaunch=NEVER` не блокирует OTA: `RequiredOtaUpdateGate` вызывает `Updates.checkForUpdateAsync`, `fetchUpdateAsync`, `reloadAsync` через `useOtaCheckOnOpen` при открытии/возврате из фона независимо от обязательности обновления. Не включать принудительный режим только ради фоновой доставки.
- Ветви исходников для всех версий 1.7.5 в GitHub: 97=`d6b6dc6ae`, 98=`a66a7bfeb`, 99=`925059c2a`, 100/101=`322e95ec5`. В каждой fingerprint совпадает с соответствующей записью production registry.
- Сборки 97, 98, 99, 100/101 успешно проходят локальный production-style Hermes/Metro export с ЮKassa и проверку состава JS. Для 97/98/99 также запускались отдельные тесты профиля (6/6). TypeScript для всех четырёх исходных веток проходит после сборки соответствующих зависимостей.
- Реальные HBC SHA-256 для тестового профиля: 97/98=`7fa2eea20070f33f1e4a6749da82d866a7ad8868489b5a0a00d9ecd9470ab44b`, 99=`91890b25632a926f147eccfa5eeb43c91b588fb46c803d79512c29066363e070`, 100/101=`b0eec222f8ae69c60513e7e3dad344ec9c3098764aba78fceed76e4ada7b269c`. Все были **неподписанными локальными smoke exports**, не production OTA.
- На 22.11 в `MobileNativeRelease` для iOS 1.7.5: пять `app-store` кандидатов, **ноль `verified=true`**; в `MobileOtaRelease` **ноль** публикаций. Проверка физической поставки/реального платежа для всех пользователей ещё не выполнена.

**Не изменять булевы значения доказательств (`physicalDeviceVerified`, `distributionVerified`) или `verified` через SQL/фиктивный descriptor.** После надлежащей физической проверки формировать штатный запрос через `apps/mobile/scripts/prepare-self-hosted-native-verification.mjs`, публиковать сначала `TEST`, затем `ALL`, сохраняя `standard` и `STOP` для отката.

## Физическая проверка сборки 101 — 22.11.2026

- Для сохранённого Xcode-архива `Gafus 2026-11-21 06.15.56.xcarchive` успешно выполнен `xcodebuild -exportArchive` с методом `development` (без новой App Store публикации). Получен локальный QA IPA `/tmp/gafus-ios101-dev-export/out/Gafus.ipa` с SHA-256 `be56878a600e4a9f4e1ff2bb6c0d979ebaba97a0b9d662a57f0689339584731f`.
- Его подпись проходит `codesign --verify --deep --strict`; Team ID тот же `PJQ8PP666S`. До установки проверены `ru.gafus.app`, `version=1.7.5`, `build=101`, `runtime=1.7.5`, native fingerprint, pinned OTA certificate SHA256, embedded update ID и URL manifest — **все значения совпали** с App Store IPA build 101 и production native record.
- QA-экспорт **успешно установлен на физический iPhone** через `xcrun devicectl device install app` без удаления существующего приложения. `devicectl device info apps` показал `Гафус 1.7.5 build 101`, запуск `devicectl device process launch ru.gafus.app` прошёл и процесс приложения запущен.
- Важно: screenshot физического iPhone в этот момент показывал Safari, а не пользовательский интерфейс GAFUS; это **не является проверкой экрана подписки или полным e2e тестом**. Apple distribution IPA build 101 по-прежнему нельзя напрямую установить через `devicectl` из-за App Store profile `0xe800801f`; QA-экспорт имеет development-подпись. Это два разных артефакта, сформированных из одного Xcode-архива.
- До публичной оплаты остаётся физически открыть GAFUS 101, проверить вход, paywall, обновление `TEST`, реальную тестовую оплату ЮKassa и восстановление Premium; после этого собрать доказательства для штатной верификации native record. Нельзя считать запуск процесса доказательством успешного checkout.
