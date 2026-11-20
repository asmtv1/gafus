# Android-подписки GAFUS и тестовый checkout через OTA

Android использует один пакет `ru.gafus.app` и один стандартный AAB. Встроенный paywall читает цены и периоды подписок из Google Play. Google Play показывает только доступные для текущего аккаунта базовые планы. Цены, валюта и идентификаторы товаров не зашиты в JS. ЮKassa для существующих клиентов остаётся провайдером действующих подписок, включая управление автопродлением.

## Нативные зависимости

Текущий проект использует Expo SDK `57.0.33`, `expo-iap 3.4.13` и Gradle `9.3.1`. Android Gradle закрепляет `openiap-google 1.3.31` с Google Play Billing `8.3.0`. В `1.3.31` исправлены сбои при работе с поздними и повторными событиями покупки. [Загрузка тарифов](https://github.com/hyodotdev/openiap/pull/89), [Результат покупки](https://github.com/hyodotdev/openiap/pull/95).

## Подготовка Google Play

Создайте товары и базовые планы в Play Console и передайте их серверу в `GOOGLE_PLAY_SUBSCRIPTION_PLANS`. Каждый элемент сопоставляет `productId` и `basePlanId` с одним из кодов GAFUS `TWO_WEEKS`, `MONTHLY`, `THREE_MONTHS`. Проверяйте соответствие срока и прав Premium каждого плана. Ниже пример структуры с условными идентификаторами.

```json
[
  { "productId": "example_premium", "basePlanId": "monthly", "planCode": "MONTHLY" },
  { "productId": "example_premium", "basePlanId": "three-months", "planCode": "THREE_MONTHS" }
]
```

При продаже нескольких базовых планов у одного товара приложение передаёт полученный от Play offer token выбранного плана. Промооферы и рассрочка Google Play в текущем интерфейсе не продаются. Реальные идентификаторы продуктов и цены подтверждаются в Play Console и на устройстве.

Выдайте сервисному аккаунту доступ к приложению в Play Console и к Android Publisher API. Сервер читает `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`. Храните закрытый ключ в серверном хранилище секретов. Миграция `20261120120000_google_play_subscriptions` добавляет провайдера, непрозрачный идентификатор аккаунта и уникальную привязку токена подписки.

При восстановлении через `getAvailablePurchases()` Google Play может не вернуть клиенту `obfuscatedAccountIdAndroid`. Такой токен не отбрасывается только из-за отсутствия этого поля: клиент исключает явно чужие ID, а **сервер** проверяет оригинальный токен через Google, привязку к аккаунту и запрет повторной выдачи доступа. Это общее поведение для автоматической сверки при входе и кнопки «Восстановить покупки».

Запрос `POST /api/v1/app-subscription/google/play/prepare` возвращает каталог и постоянный непрозрачный идентификатор GAFUS для Billing Flow. Клиент передаёт токен покупки на `POST /api/v1/app-subscription/google/play/verify`. Сервер проверяет состояние и план через `purchases.subscriptionsv2.get` в области пакета `ru.gafus.app`, сверяет владельца, идемпотентно записывает доступ и подтверждает покупку в Google. Повторная доставка токена не выдаёт ещё один период. При замене сервер прекращает доступ по предыдущему токену после подтверждённого вступления замены в силу. Pending, hold и pause не дают доступ. Отмена продления сохраняет оплаченный период, а grace period и возврат обрабатываются по актуальному состоянию в Google.

### RTDN и периодическая сверка

- Настройте в Play Console Real-time Developer Notifications и отдельную аутентифицированную подписку Pub/Sub Push на `POST /api/v1/google-play/rtdn`.
- Задайте `GOOGLE_PLAY_RTDN_AUDIENCE` и `GOOGLE_PLAY_RTDN_EMAIL` с точными значениями audience и email аккаунта Push. Сервер проверяет подпись, поля JWT и имя пакета. Уведомление инициирует запрос к Android Publisher API. Временная ошибка возвращает 503 для повторной доставки.
- Настройте Cloud Scheduler с отдельным сервисным аккаунтом и OIDC для `POST /api/v1/google-play/reconcile`. Задайте `GOOGLE_PLAY_RECONCILE_AUDIENCE` и `GOOGLE_PLAY_RECONCILE_EMAIL`. Сверка читает до 20 токенов в порядке времени последней проверки. Выберите частоту с запасом относительно объёма покупок и контролируйте отставание.
- Для повторных сверок оставляйте в каталоге сопоставления ранее проданных базовых планов, пока их подписки действуют.

Документация Google описывает жизненный цикл и подтверждение покупки. [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions), [Subscriptions v2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2), [Acknowledgement](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/acknowledge).

## Android OTA для QA

Стандартный Metro export подключает пустой `OptionalCardCheckout`. Профиль `android-qa-yookassa` использует браузерный checkout и `expo-web-browser` уже из нативной сборки. Он допускается для проверенной внутренней Android-сборки с совпадающими runtime и native fingerprint. Профиль `internal-yookassa` по-прежнему относится к предусмотренной внутренней сборке iOS. Текущий алгоритм fingerprint включает общие `app.json` и `package.json` для обеих платформ. Android-правки в этих файлах меняют fingerprint исходников и для iOS. Для публикации поверх ранее подписанной iOS-сборки используйте её совместимый снимок исходников и прежнюю проверку совпадения fingerprint.

1. Подготовьте внутреннюю установку из того же нативного проекта и зарегистрируйте проверенный descriptor в изолированной среде. Используйте QA API с тестовым магазином ЮKassa.
2. На сервере QA включите `MOBILE_OTA_ANDROID_QA_YOOKASSA_ENABLED=true`. Укажите `MOBILE_OTA_ANDROID_QA_YOOKASSA_SHOP_ID`, равный `YOOKASSA_SHOP_ID` тестового магазина. Используйте штатный OTA transport и отдельные тестовые секреты.
3. В защищённом процессе подписания укажите `payment_content=android-qa-yookassa` и точные идентификатор внутренней сборки и runtime. CI проверяет fingerprint и состав пакета. Публикация доступна действием TEST для зарегистрированных тестеров. Действие ALL для Android с этим checkout заблокировано.
4. Проверьте воспроизведение на одной и той же установке. Начните со стандартного paywall, примените подписанный OTA, войдите под `admin` или `asmtv1` и проверьте получение тестовой ссылки оплаты. Затем проверьте отказ для обычного аккаунта.
5. Остановите тестовую публикацию и проверьте отказ старого QA checkout на API. Примените подписанный recovery-пакет с профилем `standard` для того же runtime и fingerprint. Проверьте восстановление экрана Google Play и отсутствие checkout ЮKassa на той же установке.

Веб-запросы проходят существующие проверки cookie и origin. Для старых Android-клиентов, которым нужно сохранить создание новых платежей, сервер явно разрешает аккаунты через `ANDROID_LEGACY_YOOKASSA_USER_IDS` и версии через `ANDROID_LEGACY_YOOKASSA_VERSIONS` (списки через запятую). Старые версии передают заявленный номер сборки, поэтому одна версия в заголовке никаких прав не даёт. Списки нужно подготовить до включения нового API для старых клиентов. Действующие оплаты, доступ, webhook, автопродление и отмена существующей подписки продолжают использовать прежние маршруты.

Для магазинной альтернативной оплаты нужен отдельный одобренный процесс, учитывающий условия программы магазина. QA-профиль предназначен для внутреннего тестирования. [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).

## Релизные проверки

- `verify-android-payment-export.mjs` проверяет реальные Android source maps Metro. Стандартный пакет включает Google Play Billing и исключает модули оформления ЮKassa. QA-пакет обязан содержать браузерный checkout.
- `verify-android-payment-aab.mjs` проверяет DEX и встроенный бандл стандартного AAB. Локальный релизный сборщик запускает эту проверку перед завершением.
- На Google Play Internal Testing проверьте покупку, отмену, pending, повторную верификацию, повторный вход, восстановление, продление, удержание, возврат и отзыв. Используйте лицензированного тестера и согласованный сценарий оплаты.
- Установите подписанный QA OTA и recovery на устройство. Проверьте, что Web ЮKassa, iOS StoreKit, существующие подписки, доступ к платным и приватным курсам и обычный вход продолжают работать.

## Файлы

| Область | Изменения |
| --- | --- |
| Android | `AppSubscriptionPaywall.android.tsx`, `GooglePlayPurchaseSync.android.tsx`, `appSubscriptionGoogleApi.ts`, `appSubscriptionApi.android.ts`, `googlePlayOffers.ts` |
| Нативная конфигурация | `apps/mobile/app.json`, `apps/mobile/package.json`, `plugins/withGooglePlayBilling.js` |
| API и данные | `google-play-client.ts`, `google-play-service.ts`, `google-play-notifications.ts`, `routes/v1/app-subscription.ts`, `app-subscription-rate-limit.ts`, `schema.prisma`, миграция и совместимые контракты доступа |
| OTA | `AndroidQaCardCheckout.tsx`, `InternalCardCheckout.tsx`, `ota-payment-profile.mjs`, `export-self-hosted-ota.mjs`, `prepare-self-hosted-ota.mjs`, `ci-registration.ts`, `version-selection.ts`, `version-selection-repository.ts`, `version-publication.ts` |
| Релизные проверки | `verify-android-payment-export.mjs`, `verify-android-payment-aab.mjs`, `build-android-production-local.mjs`, `gafus-sdk57-qa.yml`, `gafus-self-hosted-ota-production.yml` |

Для изолированной проверки новой миграции и обработки покупок используйте `bash scripts/qa/google-play-isolated-pg.sh` после генерации Prisma Client. Сценарий создаёт собственный PostgreSQL, накатывает SQL-миграцию на предыдущую структуру и подменяет только сетевые ответы Google. `bash scripts/qa/ota-version-publication-isolated-pg.sh` проверяет доставку и отзыв разрешения на checkout.

## Локальная приёмка — 20 ноября 2026 года

Проверки выполнены в локальном `/Users/asmtv1/Desktop/gafus-refactor` без коммита,
push, изменения production, публикации OTA или загрузки сборки в магазины.
При запуске HEAD был `04052d616`, рабочее дерево содержало изменения других задач.

- `apps/api`, `apps/mobile`, `packages/subscription-payment-server`,
  `packages/mobile-ota-server`: TypeScript typecheck — PASS.
- Google Play: unit-тесты сервиса и HTTP API — PASS; Pub/Sub RTDN и
  authenticated reconcile — PASS; Google migration и конкурентная идемпотентная
  привязка токена к аккаунту проверены с изолированным PostgreSQL (3 теста) — PASS.
- Изолированная PostgreSQL-проверка OTA publication/selection: 28 PASS,
  7 SKIP (необязательные диагностические тесты).
- Metro Android `standard`: PASS — Google Play Billing присутствует, новые
  checkout-обработчики ЮKassa отсутствуют. `android-qa-yookassa`: PASS —
  дополнительный JS checkout включается для внутреннего профиля. Возврат
  `standard` после QA export: PASS. После QA export исходная точка
  `OptionalCardCheckout` восстанавливается точно.
- Android autolinking: `expo-iap` обнаружен, `yookassa-payments` не обнаружен.
- Android Gradle `:app:bundleRelease` — BUILD SUCCESSFUL. Создан проверочный
  `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`,
  SHA-256 `4787d7c7a89ffa87072abf31008b277fefd0a6c46bcebbebf0006f42cd7d086a`.
  `verify-android-payment-aab.mjs` — PASS, `verify-android-aab-16k.mjs`
  — PASS (67 ELF), проверка compressor — PASS (10 DEX), проверка
  Android App Links в AAB — PASS (2 домена).
- Отдельные regression-тесты Apple StoreKit, YooKassa, Web-подписок,
  чек-аутов и OTA rollout — PASS; два новых теста восстановления Google
  токенов без клиентского obfuscated account ID — PASS.

**Оставшиеся условия релизной приёмки:** локальный Gradle AAB подписан
`signingConfigs.debug` и **не предназначен для загрузки в магазин**.
Потребуются реальная production-подпись и CI, настройка товаров и
сервисного аккаунта в Google Play Console, привязка Google Cloud Pub/Sub
и Scheduler, тестирование Google Play Internal Testing на устройстве с
лицензированным тестером (покупка, pending, отмена, refund, продление),
проверка подписанного QA OTA и recovery на одной установке с серверным
разрешением и отдельным тестовым магазином, проверка assetlinks/
Google Play App Signing SHA и Android с 16-KiB page size.
Ни одна из этих внешних проверок не считается выполненной.

## RuStore Push removal (2026-11-20)

- The single Android binary no longer depends on `react-native-rustore-push`; the former RuStore Push Maven repository was removed from Expo config.
- Only Web Push and Expo Push remain in the client and server notification paths. Stored legacy RuStore endpoints, if any, are excluded from routing; they must not fall back to Web Push.
- The standard Android AAB verifier rejects `com.vk.push` / `VkpnsClientSdk` / `RustorePush` native or JS artifacts. A newly compiled AAB is required; removing a native SDK cannot be delivered as an OTA-only change.
- Actual Expo Push delivery on Android devices without Google Play Services is not guaranteed; test that device class separately if supported.

**Local acceptance receipt (2026-11-20):**

- `pnpm --filter @gafus/mobile remove react-native-rustore-push --lockfile-only`: passed; native autolinking no longer contains the module.
- Web Push + Mobile registration/owner tests: 41 passed. Worker + notification broadcast tests: 22 passed. Additional mobile push, profile, reminders tests: 40 passed (103 passing tests total).
- Mobile, Web Push, Notifications Server TypeScript: passed. Worker TypeScript remains blocked by a separate pre-existing `@gafus/gallery-storage` declaration error in `src/gallery-local-maintenance.ts`; not attributed to this change.
- `:app:bundleRelease` with offline Gradle: passed; 193 MB AAB at `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`, SHA-256 `89bb67d8589bf92bdd255567969fc4825a88c1a7c3b6854f2b3cfb4cbad8a3de`.
- AAB checks: Google Play Billing, no default YooKassa code, no RuStore Push classes/JS/resources, 16-KiB ELF, native compressor and Android App Links all passed.
- This local AAB is not a signed Google Play production artifact; no device push delivery, Play upload, CI publishing or production rollout was performed.
