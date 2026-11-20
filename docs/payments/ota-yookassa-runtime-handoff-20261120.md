# Многоверсионный OTA с ЮKassa — подготовка и передача на QA

20 ноября 2026 года. Локальная подготовка. Подтверждение и публикация будущих поставок остаются отдельными решениями владельца GAFUS.

## Аудит

| Область | На исходном HEAD | После правок |
| --- | --- | --- |
| Обычная оплата | Платформенные экраны StoreKit на iOS и Google Play Billing на Android. Запасная точка входа возвращала `null`. | `standard` по умолчанию. Оба магазинных экрана используют прежние способы оплаты. |
| Внутренний checkout | Один `InternalCardCheckout`, небольшой QA-адаптер Android. iOS был привязан к `1.7.5` в экспорте, регистрации CI и проверке права на покупку. | Один checkout для двух платформ и любого подтверждённого совместимого runtime. Проверки профиля, подписи и допуска проходят на каждом соответствующем этапе. |
| Экспорт и recovery | Временная перезапись точки входа checkout и номера OTA-ревизии. | Отдельная конфигурация Metro и собственный кэш сборки. Expo встраивает ревизию, скрипт подписания проверяет её в пакете. Исходники читаются без записи. Recovery использует `standard`. |
| Доставка и обязательность | Подписанный manifest, выбор по платформе, runtime и отпечатку сборки, `MobileOtaMandatoryPolicy` для ранее развёрнутых OTA, состояние `required` в публикациях по версиям. | Используются прежние записи и выбор пакета. Для публикаций по версиям `MANDATORY` обновляет обязательность текущей ревизии отдельным действием. `RequiredOtaUpdateGate` по-прежнему ждёт загрузку, установку и перезапуск, чтобы открыть защищённый интерфейс. |
| Админка | Ручной ввод версии. Публикация и назначение обязательности выполнялись одной операцией. | Выбор платформы и подтверждённой сборки. Runtime берётся из реестра. Показаны подписанные ревизии для выбранной сборки, их платёжное содержимое и состояние публикации. |
| API и подписки | `offer` и `yookassa/start` независимо проверяли право на checkout. `yookassa/cancel` использовал действующее серверное управление подпиской. | Обе платформы используют общую проверку текущего внутреннего OTA. Для Android сохранено требование отдельного тестового магазина. Тарифы, платежи, webhook, возвраты, права, автопродление, отмена и веб-чекаут используют прежние механизмы. |

Сохранены существующие ключи области, сертификаты, проверка fingerprint, наблюдение установленной ревизии, серверное подтверждение покупок, проверки владельца и `authEpoch`, ограничения старых Android-клиентов и legacy-политики обязательного обновления. Изменение не требует миграции.

## Профили

| Профиль | Сборки и аудитория | Содержимое и допуск |
| --- | --- | --- |
| `standard` | Совместимая подтверждённая сборка iOS или Android. Preview, обычная поставка и recovery. | StoreKit или Google Play Billing. Новый мобильный checkout ЮKassa отсутствует в пакете. |
| `internal-yookassa` | Подтверждённая внутренняя iOS-сборка в self-hosted канале `production`, опубликованная тестерам отдельным действием. | Общий браузерный checkout. Сервер сверяет аккаунт тестера, платформу, runtime, fingerprint, публикацию и наблюдаемый ID текущего обновления. |
| `android-qa-yookassa` | Подтверждённая внутренняя Android-сборка в том же канале, опубликованная тестерам отдельным действием. | Общий checkout с Android-адаптером и отдельным серверным ограничением на тестовый магазин. |

Для каждого runtime и каждой подтверждённой сборки нужен свой пакет. Один и тот же checkout-код пригоден для `1.7.5`, `1.7.6` и последующих совместимых runtime. Совпадение номера версии само по себе прав на экспорт или доставку не даёт. Self-hosted OTA меняет JS и ресурсы. Новые нативные зависимости требуют новой сборки.

У внутренних профилей разрешена публикация `TEST`. Публикация `ALL` для таких пакетов блокируется на обеих платформах. Утверждённый вариант альтернативной оплаты для магазинного распространения потребует отдельного проекта и проверки правил конкретного магазина и региона. [Правила Apple](https://developer.apple.com/app-store/review/guidelines/#payments) · [Правила Google Play](https://support.google.com/googleplay/android-developer/answer/9858738)

## Будущий порядок работы

1. В реестре выберите подтверждённую нативную сборку. Для внутренних профилей запись должна содержать ID встроенного обновления, подтверждённый вместе с фактическим бинарником и способом распространения.
2. Владелец при отдельном разрешении запускает ручной защищённый workflow подписания. Он задаёт `native_release_id`, платформу, проверенный `source_sha`, название, номер ревизии, ID обновления и операции, время создания и явный `payment_content`, если нужен внутренний профиль. `runtime_version` можно передать как дополнительную проверку ожидаемого значения.
3. CI получает runtime, канал, fingerprint и ключ подписи из реестра. Он сверяет версию манифестов проекта, сертификат, происхождение исходников и фактический fingerprint. Проверяет iOS/Android-граф оплаты, встраивает номер ревизии и подписывает пакет. Результат регистрируется как `READY`. Подготовка включает загрузку неизменяемых файлов и проверку чтения. Устройства получают пакет после отдельной публикации.
4. В админке откройте **Мобильные релизы → Выпуск по версии приложения**. Выберите платформу, подтверждённую сборку и ревизию. Для публикации нужен полный набор совместимых пакетов для целевых сборок этого runtime. Действие «Выпустить тестерам» публикует этот набор. «Выпустить всем» доступно для проверенного стандартного набора.
5. Отдельное действие «Сделать OTA обязательной» доступно для текущей опубликованной ревизии. Оно использует прежний набор подписанных пакетов и прежнюю аудиторию. Сервер ещё раз проверяет, что каждый пакет доступен с учётом реестра, срока подписи и подтверждения файлов. Инвалидация совпадающего пакета исключает обязательность для соответствующей установки. Для прежних deployment-публикаций остаётся отдельная вкладка «Обязательное OTA iOS / Android».
6. Recovery готовится отдельной более новой ревизией `standard` с `recovery_for` и пакетами для того же набора совместимых сборок. Административный откат сначала прекращает выдавать разрешение на новый checkout для заменяемой публикации, затем публикует подписанное безопасное обновление. Обязательность recovery при необходимости назначается после публикации.

## Передача второму агенту

Повторить на изолированных сервисах и затем провести приёмку с физическими устройствами после отдельного разрешения владельца.

```bash
node --test apps/mobile/scripts/{ota-payment-profile,verify-ota-production-workflow,verify-ota-preview-workflow,self-hosted-ota-artifact,verify-ota-production-native-trust,self-hosted-ota-public-env}.test.mjs
pnpm --filter @gafus/mobile-ota-server build
pnpm --filter @gafus/mobile --filter @gafus/mobile-ota-server --filter @gafus/api --filter @gafus/admin-panel typecheck
pnpm --filter @gafus/mobile exec vitest run src/features/app-subscription/components/InternalCardCheckout.test.tsx src/shared/lib/otaPolicy.test.ts src/shared/components/RequiredOtaUpdateGate.mounted.test.tsx
pnpm --filter @gafus/api exec vitest run src/modules/mobile-ota/ci-registration.test.ts src/routes/v1/admin-mobile-ota.test.ts src/routes/v1/app-subscription.route.test.ts
pnpm --filter @gafus/admin-panel exec vitest run src/admin-live/VersionPublicationForm.test.ts
bash scripts/qa/ota-version-publication-isolated-pg.sh
```

- Повторить стандартные и внутренние JS-экспорты с разными ревизиями одновременно, а также экспорт recovery для обоих runtime. Проверить состав Hermes и точную ревизию. Для фактических подписанных поставок нужны проверенные дескрипторы, сертификаты и подтверждённые бинарники.
- Подтвердить отказ для другой платформы, runtime, fingerprint, сертификата, встроенного ID, магазинной сборки и обычного аккаунта. Проверить выключение доступа после отзыва публикации и переход назад к стандартному платёжному экрану.
- На iOS и Android отдельно проверить несовпадающий runtime, отключение политики, истечение или отзыв подписи и недоступность файлов. У доступной обязательной ревизии проверить загрузку, перезапуск и блокировку до запуска установленного OTA.
- Отдельно проверить StoreKit Sandbox, Google Play Billing с лицензированным тестером, внутренний checkout с изолированным платёжным провайдером, повторный вход, смену аккаунта во время возврата из браузера и управление существующей подпиской. Убедиться в правильном доступе после отмены, продления и возврата.

### Локальные проверки

- Прошли 32 проверки скриптов профилей, подписи и workflows, 49 тестов API, 13 тестов мобильного checkout и ревизий, 4 теста ответа админки и 2 сценария в отдельном временном PostgreSQL. TypeScript проверен для Mobile, OTA Server, API и Admin.
- Проверен iOS Hermes с внутренним checkout на синтетическом дескрипторе `1.7.6` и без checkout по графу стандартного iOS. Параллельные Android-экспорты `standard` и `android-qa-yookassa` дали разные заданные ревизии, правильные платёжные модули и идентичный diff отслеживаемого дерева до и после.

### Ограничения этой подготовки

- Временные дескрипторы в локальных проверках имитируют runtime. Пригодность конкретной сборки `1.7.6` подтверждают регистрация реального бинарника, fingerprint, аппаратная проверка и защищённый CI.
- Замена точки входа использует возможность переопределить конфигурацию Metro в закреплённом Expo SDK 57. При обновлении Expo для неё нужно повторить проверку фактического Hermes-пакета и изоляции кэша. Неверную ревизию отклоняет скрипт подписания.
- CI получает расширенный дескриптор с `embeddedUpdateId` через защищённый API. Будущая подготовка внутренних пакетов требует совместимой версии API. Админка и API с отдельным действием обязательности должны обновляться согласованно.
- Если сеть становится недоступной после ответа с действующей обязательной политикой, существующий экран показывает ошибку и повторяет попытку. Проверить отзыв политики при недоступности файлов и повторное получение решения на устройстве.
- Полный набор тестов, нативные release-сборки, QA устройств и приёмка внешних сервисов относятся к следующему этапу.

### Состояние рабочей копии

Git HEAD `2c9a5880e9ee982d6a2900d856c1aea4efb3fb87`, рабочая ветка `main`. На старте ветка совпадала с локальной ссылкой `origin/main`. Изменения только в рабочей копии. Существующий каталог `packages/worker/.qa/` оставлен как был.

Публикаций, активации OTA и оплаты, внешних workflow, операций с production, загрузок в магазины и реальных платежей в рамках задачи не было.

### Файлы

`M` — изменён, `A` — новый, `D` — удалён.

```text
M  .github/workflows/gafus-sdk57-qa.yml
M  .github/workflows/gafus-self-hosted-ota-preview.yml
M  .github/workflows/gafus-self-hosted-ota-production.yml
M  apps/admin-panel/src/admin-live/MobileReleasesPanel.tsx
M  apps/admin-panel/src/admin-live/VersionPublicationForm.tsx
M  apps/api/src/modules/mobile-ota/ci-registration.test.ts
M  apps/api/src/routes/v1/admin-mobile-ota.ts
M  apps/mobile/scripts/export-self-hosted-ota.mjs
M  apps/mobile/scripts/fetch-self-hosted-native-release.mjs
M  apps/mobile/scripts/ota-payment-profile.mjs
M  apps/mobile/scripts/ota-payment-profile.test.mjs
D  apps/mobile/scripts/ota-revision-release.mjs
D  apps/mobile/scripts/ota-revision-release.test.mjs
M  apps/mobile/scripts/prepare-self-hosted-ota.mjs
M  apps/mobile/scripts/self-hosted-ota-artifact.mjs
M  apps/mobile/scripts/self-hosted-ota-artifact.test.mjs
A  apps/mobile/scripts/self-hosted-ota-metro.config.mjs
M  apps/mobile/scripts/verify-ios-payment-export.mjs
M  apps/mobile/scripts/verify-ios-payment-graph.mjs
M  apps/mobile/scripts/verify-ota-production-workflow.test.mjs
M  apps/mobile/src/features/app-subscription/components/AndroidQaCardCheckout.tsx
M  apps/mobile/src/features/app-subscription/components/InternalCardCheckout.tsx
M  apps/mobile/src/shared/lib/otaRevision.generated.ts
M  docs/deployment/ota-mandatory-per-platform-175.md
M  docs/payments/android-google-play-and-ota.md
M  docs/payments/ios-yookassa-and-ota-plan-20261112.md
A  docs/payments/ota-yookassa-runtime-handoff-20261120.md
M  packages/mobile-ota-server/src/ci-registration.ts
M  packages/mobile-ota-server/src/queries.ts
M  packages/mobile-ota-server/src/version-publication-repository.ts
M  packages/mobile-ota-server/src/version-publication.ts
M  packages/mobile-ota-server/src/version-selection-repository.ts
M  packages/mobile-ota-server/src/version-selection.ts
M  packages/mobile-ota-server/tests/version-publication.realpg.test.ts
M  scripts/qa/verify-sdk57-bundles.mjs
```
