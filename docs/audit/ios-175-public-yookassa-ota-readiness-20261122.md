# iOS 1.7.5 — публичный OTA с ЮKassa: готовность и блокирующие проверки

Статус: **НЕ ПУБЛИКОВАТЬ ДЛЯ ВСЕХ**. Подготовлены независимые CI/API-выключатели, но это не подтверждает соответствие требованиям Apple или работоспособность платежей.

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

1. **App Review/StoreKit**: актуальная App Store 1.7.5 не имеет `com.apple.developer.storekit.external-purchase-link` и не реализует Apple `ExternalPurchaseLink.open()/canOpen`, передачу токена и отчётность. Apple допускает региональные внешние ссылки (в частности, RU) только с соответствующим entitlement, требованиями StoreKit и одобренными назначениями. Добавить нативный entitlement существующей App Store 1.7.5 через JS OTA нельзя. Публичное включение сейчас не утверждено.
2. Публичное предложение **для всех стран** не соответствует региональным ограничениям Apple. Требуется проверка storefront на устройстве через поддерживаемый нативный StoreKit API, а не по языку/IP или заголовку клиента. Для пользователей вне разрешённых storefront оставить Apple IAP.
3. Для build 101 завершить независимое подтверждение фактического App Store IPA и физическую QA-проверку на устройстве (сейчас подключённая сборка 99). Штатно зарегистрировать `embeddedUpdateId=cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e` и `verified=true` только через API админки после фактических доказательств. Production native ID `0093f03d-3a04-4968-878c-c7e30f77fa66` пока НЕ verified; не подменять проверку SQL-правкой.
4. Проверить YooKassa prod-ключи, webhook/callback, idempotency платежей, начисление Premium, тарифы, отмену автопродления, возврат средств, отсутствие двойной подписки Apple+ЮKassa и UI на реальном iPhone 1.7.5.
5. Отдельно собрать `ios-public-yookassa` через GitHub Actions **после** выполнения пп. 1–4. Затем протестировать TEST с ограниченными аккаунтами (admin/asmtv1), опубликовать подписанный пакет `ALL` без mandatory, проверить мониторинг; иметь подписанный `standard` recovery с новой ревизией и командой STOP/RECOVER.

## Действия оператора после снятия блокировок

- Подписать разрешённую для соответствующего storefront нативную сборку и занести её в реестр; до этого не включать новый checkout.
- Проверить CI `payment_content=ios-public-yookassa` на выбранном verified `native_release_id`, `platform=ios`, `runtime_version=1.7.5`; запускать только из `main`, новый revision/update_id, signed assets в Cloud.ru S3.
- TEST → наблюдение OTA на физическом iPhone и реальная тестовая оплата → включить `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED=true` → проверить preview `ALL` → публиковать `ALL` → включать API `MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED=true` при сохранённом общем kill-switch.
- При инциденте немедленно выключить публичный API-флаг, остановить OTA через `STOP`, затем публиковать подписанный `standard` RECOVER; отдельно сверить незавершённые платежи.

Нельзя считать изменение `distribution` или показ платёжной кнопки подтверждением разрешённости внешней оплаты в App Store.
