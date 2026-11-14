# GAFUS — план миграции Expo SDK 55 → 56 → 57

Аудит исходников и публичных источников · 12 ноября 2026 г. · GAFUS Mobile, iOS и Android.

## 1. Executive summary

- **Целевой кандидат — `expo@57.0.33`, React Native 0.86.3 и React 19.2.3.** Пройти через `expo@56.0.24` как локальную контрольную точку. SDK 56 имеет известную регрессию памяти Hermes v1 при использовании Worklets/Reanimated, исправленную в SDK 57. Для Expo Observe минимальный SDK зависит от цели: SDK 55 для базовых метрик, SDK 57 для JS-ошибок в preview, SDK 57 и `expo-observe ≥57.0.21` для нативных падений. В целевом пакете Expo рекомендован `~57.0.28`. [SDK 56](https://expo.dev/changelog/sdk-56) · [SDK 57](https://expo.dev/changelog/sdk-57) · [Observe](https://docs.expo.dev/eas/observe/errors/)
- **Диагностика — Uptrace Cloud, проект 9378.** Observe на SDK 57 можно направить на шлюз GAFUS для метрик и OTLP-логов. Выделенный нативный адаптер нужен для сырых iOS-кадров, Android tombstones и выхода из процесса, а собственная мобильная инструментация — для W3C-трасс, управляемой очереди и надёжной атрибуции OTA. На первом этапе Observe включается только в экспериментальной сборке. Решение о включении в production зависит от пользы метрик, проверки сетевого маршрута, объёма и приватности. [Настройка Observe](https://docs.expo.dev/eas/observe/configuration/) · [OTLP Uptrace](https://uptrace.dev/ingest)
- **OTA — отдельный нативный runtime для SDK 57.** Действующие сборки продолжают обращаться на вшитый EAS endpoint, а новый кандидат проходит отдельный signed self-hosted preview и затем отдельный production-контур. При недоказанной готовности собственного контура отложить production cutover и сохранить обслуживание действующих клиентов. Вшитый endpoint, сертификат и SDK меняются выпуском бинарника. [Expo runtime](https://docs.expo.dev/eas-update/runtime-versions/) · [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/)
- **Критические условия до выпуска.** Xcode ≥26.4 и Node ≥22.13 для целевого SDK. iOS 15.1–16.3 остаётся на последней поддерживаемой сборке; проверить размер этой когорты и API-совместимость. Для нового runtime нужны обе подписанные нативные сборки, точное соответствие ключа, канала и отпечатка, тест OTA-отката на устройствах, платёжный граф iOS без нового внешнего checkout, подтверждённый символизированный JS/iOS/Android-стек в Uptrace. [Матрица Expo](https://docs.expo.dev/versions/v57.0.0/) · [App Review](https://developer.apple.com/app-store/review/guidelines/)
- **Статус аудита.** Прочитано рабочее дерево `main` на `0dcd18c13c8d567d543d1981b18d3caa52b16503`, включая незакоммиченные изменения. Это снимок исходников, а не идентификатор релизного содержимого. Первичный короткий обзор Git до прочтения ограничения из вложения был выполнен стандартным терминалом. Дальнейшие проверки репозитория, чтение опубликованных npm-архивов и запись плана выполнены через McpGo-Terminal1. Сборки, тестовые падения, обращения к приватному Uptrace API и выкладки в рамках аудита не выполнялись. Номера и результаты из отчётов других работ ниже относятся к указанным там средам.

## 2. Фактическое состояние мобильного GAFUS

| Область | Наблюдение и участок кода | Следствие для миграции |
| --- | --- | --- |
| Сборочный граф | [mobile/package.json](../../apps/mobile/package.json#L1-L27) задаёт `widget-entry.ts`, pnpm-скрипты и postinstall сборки `core-client`, `chat-media-quality`, `analytics`, `consultation-shared`. [package.json](../../package.json#L91-L177) фиксирует pnpm 10.12.4, общие overrides и патчи. [pnpm-workspace.yaml](../../pnpm-workspace.yaml#L1-L13) включает apps и packages. | Устанавливать из корня в выделенной копии с общим lockfile. Сначала построить workspace-пакеты, затем проверять мобильный Metro. Корневой React Native 0.83.10 тоже входит в граф. Выяснить его потребителей перед выравниванием и доказать один RN/React в мобильном бандле. |
| Версии | [app.json](../../apps/mobile/app.json#L1-L55) и mobile package показывают 1.7.4, локальный iOS buildNumber 15; EAS использует remote version source. Hermes 0.14.1 виден в локальном Podfile.lock, Hermes включён в обоих сгенерированных проектах, New Architecture включена. | В магазине проверять реальный build number и versionCode. Смена SDK/Hermes и состава native modules требует нового runtime даже при прежних бизнес-функциях. |
| CNG, iOS | Git игнорирует `apps/mobile/ios` и `apps/mobile/android`. Существующий `ios/Podfile:25–59,98–118` содержит iOS 15.1, `use_expo_modules!`, OKTracer 1.5.2, локальный YandexMobileAds podspec, Voximplant 3.3.0, отдельный widget target с `use_expo_modules_widgets!`. `ios/Podfile.lock:481–483,528` показывает Hermes и OKTracer. `ios/Gafus.xcodeproj` сгенерирован. | Источник изменений — config plugins и локальные модули. Сравнить старые native директории с чистым prebuild SDK 55 из того же SHA и профиля, извлечь любые необходимые ручные изменения в воспроизводимый источник. |
| CNG, Android | Сгенерированный Gradle wrapper 8.14.3; `android/build.gradle:4–43` принудительно устанавливает minSdk 24; `android/gradle.properties:38–42,67` включает New Architecture/Hermes. [app.json](../../apps/mobile/app.json#L347-L367) задаёт minSdk 24, Maven RuStore и плагины. [Скрипт установки NDK](../../apps/mobile/scripts/install-ndk26.sh#L1-L28) нацелен на 26.2.11394342. | Версии локальных generated-проектов могут расходиться с чистым template. Не переносить wrapper и NDK-установщик по привычке. Проверить AAB по всем ABI и совместимость поставляемых .so с 16 KB. |
| Рабочий Mac | Терминал показал Node 20.20.2, pnpm 10.12.4, Xcode 26.3, CocoaPods 1.16.2, Homebrew JDK 17.0.18, Android NDK 27.1.12297006. JDK доступен по полному пути; стандартный `java` не находил Java. | Выделенной сборочной среде задать Node 22, подходящий Xcode, явный JAVA_HOME и NDK выбранного native template. |
| Metro, Babel, TS | [Metro](../../apps/mobile/metro.config.js#L1-L36) расширяет Expo defaults, добавляет WASM для SQLite, watchFolders, nodeModulesPaths и minification. [Babel](../../apps/mobile/babel.config.js#L1-L7) использует Expo preset и Reanimated plugin. [TS](../../apps/mobile/tsconfig.json#L17-L42) объявляет aliases на source, build-пакеты и Core utilities/validation. | Проверить wasm, граф platform exports, один React, worklet transformation и отсутствие Prisma/Node-only в Mobile. Решение об удалении ручных путей Metro принять после сравнения экспортов. |
| Router и запуск | [widget-entry.ts](../../apps/mobile/widget-entry.ts#L1-L23) импортирует GPS-задачу до Expo Router и регистрирует Android widget при наличии native module. [Root layout](../../apps/mobile/app/_layout.tsx#L88-L202) управляет splash, загрузкой шрифтов, boundary и провайдерами. | Сохранить точки и порядок инициализации. Зарегистрировать диагностический контекст достаточно рано и без сети в критическом пути запуска. |
| Сборки и магазины | [apps/mobile/eas.json](../../apps/mobile/eas.json#L1-L70) содержит development, development-device, preview/APK, production/AAB с remote autoIncrement, production-local с отключённым increment. Корневой [eas.json](../../eas.json) имеет другой набор настроек. [Android release wrapper](../../apps/mobile/scripts/build-android-production-local.mjs#L14-L149) проверяет source, вызывает EAS CLI 27.4.1 и аудирует AAB. | Запуск EAS из `apps/mobile`. Перед новым профилем проверить merged profile и подписанный артефакт. Root EAS config не использовать как источник mobile channel. |
| OTA | [app.json](../../apps/mobile/app.json#L456-L464) содержит appVersion policy и EAS URL с ON_LOAD. [app.config.js](../../apps/mobile/app.config.js#L89) применяет [self-hosted profile](../../apps/mobile/scripts/self-hosted-native-profile.cjs#L8-L66) только при выбранном транспорте. [Preview workflow](../../.github/workflows/gafus-self-hosted-ota-preview.yml#L103-L239) фиксирует Node 20.20.2, проверяет SHA/дескриптор/отпечаток, экспортирует, подписывает, загружает и регистрирует preview. | На дату аудита signed preview и часть серверного контура присутствуют как активные изменения. [Локальный отчёт](../implementation/gafus-ios-ota-local-checkpoint-20261112.md#L36-L46) отмечает, что запуск GitHub и физический signed OTA не подтверждены. |
| Диагностика | [reportClientError](../../apps/mobile/src/shared/lib/tracer/reportClientError.ts#L61-L134) ждёт device ID, формирует AppTracer payload со стеком и OTA, затем отправляет напрямую. [Global handler](../../apps/mobile/src/shared/lib/tracer/installGlobalJsErrorHandler.ts#L14-L28) вызывает прежний handler сразу после вызова репортера. [Native plugin](../../apps/mobile/plugins/withAppTracerNative.js#L141) меняет Podfile, AppDelegate и Android сборку. | JS fatal delivery сейчас нельзя выводить из факта вызова репортера. Текущий редактирующий фильтр signed URL полезен, но новая схема должна исключить device ID, user ID и произвольные контексты из экспорта. |
| Backend | [Hono app](../../apps/api/src/app.ts#L145-L153) подключает observability middleware и request ID. В рабочем дереве `packages/logger/src/serverTelemetry.ts:18–134` есть W3C parsing, trace OTLP HTTP и ограниченный sampling, рядом [operation-observability](../../apps/api/src/lib/operation-observability.ts). Worker находится в [packages/worker](../../packages/worker/src/index.ts#L1-L88), очереди — `packages/queues/src`, Web — `apps/web-vite`. | Расширять существующую серверную OTel-работу после её интеграции. В исходниках и локальных отчётах нет квитанции действующей сквозной доставки всех четырёх клиентов и Worker в проект 9378. [Локальные статусы](gafus-agent-2-observability-20261111.md#L28-L46) |
| Тесты | `apps/mobile/vitest.config.ts`, package scripts, `plugins/*.test.cjs`, `scripts/*.test.mjs`, тесты API manifest/CI/admin, реальные PG-проверки OTA в локальном отчёте. | Записать воспроизводимый PASS SDK 55 перед изменениями. Существующие отчёты и проверки конфигурации дополняются устройствами и испытанием транспорта. |

## 3. Проверенная матрица версий и совместимости

| Параметр | SDK 55 в GAFUS | SDK 56, контрольная точка | SDK 57, кандидат |
| --- | --- | --- | --- |
| Expo / React Native / React и React DOM | 55.0.32 / 0.83.10 / 19.2.0 | 56.0.24 / 0.85.3 / 19.2.3 | 57.0.33 / 0.86.3 / 19.2.3 |
| Hermes | RN compiler 0.14.1, Hermes v1 opt-in в SDK 55, текущий Pod lock 0.14.1 | Hermes v1 по умолчанию, compiler RN 250829098.0.10 | Hermes v1 по умолчанию, compiler RN 250829098.0.17 |
| New Architecture | Обязательна для SDK 55, enabled в generated проектах | Обязательна | Обязательна |
| Node | Expo 20.19.x, RN 0.83.10 требует ≥20.19.4, локально 20.20.2 | Expo 20.19.x; для этих трёх этапов выделить одну линию Node 22.23.1, совместимую с RN | Expo 22.13.x минимум; первый pin Node 22.23.1 в CI/локально, сверить доступность и security patch на момент реализации |
| iOS / Xcode | iOS ≥15.1 / Xcode ≥26.2; локально 26.3 | iOS ≥16.4 / Xcode ≥26.4 | iOS ≥16.4 / Xcode ≥26.4; первый кандидат образа `macos-tahoe-26.5-xcode-26.6` (Xcode 26.6), проверить доступность перед закреплением. При необходимости Xcode 27 нужен scene lifecycle из Expo ≥57.0.23 и тест §6 |
| CocoaPods | 1.16.2 локально | 1.16.2 как базовый выбор с Xcode 26, зафиксировать фактическую версию образа | Аналогично, сохранить Podfile.lock и отпечатки из того же release archive |
| Android OS / compile / target | Android 7 / API 24, compile/target Expo 36/36 | Android 7 / API 24, 36/36 | Android 7 / API 24, 36/36; перед загрузкой сверить требования каждой консоли |
| Gradle | generated GAFUS 8.14.3, опубликованный template SDK 55.0.44 — 9.0.0 | template 56.0.38 — 9.3.1 | template 57.0.35 — 9.3.1 |
| AGP / Kotlin | Каталог RN Gradle plugin 8.12.0 / 2.1.20; отдельно проверить effective каталог app | Каталог RN Gradle plugin 8.12.0 / 2.1.20; effective значения из чистого Expo template и Gradle resolution | Каталог RN Gradle plugin 8.12.0 / 2.1.20; effective значения из чистого Expo template и Gradle resolution |
| NDK | RN catalog 27.1.12297006, установлен локально; старый скрипт предлагает 26.2.11394342 | RN 27.1.12297006, подтвердить в generated app | RN 27.1.12297006, подтвердить effective значение и 16 KB всего AAB |
| Java | Homebrew 17.0.18 | JDK 17, задать явно | JDK 17, задать явно |
| Expo Observe | Пакет отсутствует в GAFUS; Expo map 0.2.6 для базовых метрик | Expo map ~56.0.31, метрики | Expo map ~57.0.28, ошибки и native crash preview. Отдельный эксперимент после проверки чистого SDK 57 |

Версии Expo и маппинги взяты из опубликованных пакетов, включая 57.0.33 от 12.11.2026. Значения Gradle в строке template относятся к опубликованным bare-minimum template. При реализации записать также версию **фактически выбранного** prebuild template, effective AGP/Kotlin/NDK и source или prebuilt происхождение каждого patched native module. Доказательство совместимости с конкретным AAB/IPA даёт только CI и устройство. [Матрица Expo](https://docs.expo.dev/versions/v57.0.0/) · [SDK 56 npm map](https://unpkg.com/expo@56.0.24/bundledNativeModules.json) · [SDK 57 npm map](https://unpkg.com/expo@57.0.33/bundledNativeModules.json) · [RN Android catalog](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/gradle/libs.versions.toml) · [RN Gradle plugin](https://github.com/facebook/react-native/blob/v0.86.3/packages/gradle-plugin/gradle/libs.versions.toml) · [Образы EAS](https://docs.expo.dev/build-reference/infrastructure/)

## 4. Breaking changes SDK 55 → 56 → 57

### 55 → 56

1. **Router.** Перенести прямые импорты `@react-navigation/native` на `expo-router/react-navigation`, включая `features/gallery/data.ts:4`, `features/pets/PetVetVisits.tsx:20` и `shared/providers/ThemeProvider.tsx:12`, тестовые моки и весь app/src. Удалить direct dependency после проверки третьих пакетов и Expo Doctor. Проверить cold/warm links, back, навигационные guards и remount. [Миграция Expo Router](https://docs.expo.dev/router/migrate/sdk-55-to-56/)
2. **Новый глобальный fetch.** Expo становится поставщиком `globalThis.fetch`. Сравнить семантику abort/timeout, streams, Blob, FormData, binary PUT, подписанные заголовки, secure cookies, 401 refresh, ошибки и повторные запросы. Сначала тестировать дефолт. При воспроизводимой несовместимости использовать документированный `EXPO_PUBLIC_USE_RN_FETCH=1` как временное решение сразу во всех профилях сборки/OTA данной линии и повторить все HTTP/media контракты. [SDK 56](https://expo.dev/changelog/sdk-56)
3. **FileSystem и SQLite.** `File/Directory.copy()` и `move()` становятся async. Проверить оба receiver типа и косвенные вызовы в upload/offline, добавить await перед probe/read/delete; сохранить существующие imports `expo-file-system/legacy` там, где используются старые методы. Проверить SQLite WASM в web-графе и бинарные данные по новой типизации. [SDK 56](https://expo.dev/changelog/sdk-56)
4. **Metro и TS.** On-demand filesystem и встроенный Node watcher меняют resolution/crawl. Отдельно доказать Metro graph всех exports, aliases, WASM, platform suffixes и worklets. На время SDK-миграции сохранить TS 5.9.3 через `expo.install.exclude`, как разрешает Expo. Согласованный TS 6.0.3 отдельной группой допустим после совместимости Turbo/workspace. [SDK 56](https://expo.dev/changelog/sdk-56)
5. **Native builds.** Новый минимум iOS/Xcode, Hermes v1, precompiled Expo iOS modules, возможные изменения generated Podfile, Gradle и Swift. Native patches должны компилироваться из исходников там, где готовый framework/AAR иначе обходит изменения. SDK 56 bytecode diff включён по умолчанию для поддерживаемой Expo delivery; свой CDN использует полные bundles до отдельной реализации/доказательства протокола. [SDK 56](https://expo.dev/changelog/sdk-56)
6. **Библиотеки.** `@expo/vector-icons` перестаёт быть транзитивной частью Expo, в GAFUS уже прямой пакет; миграция иконок может быть отдельной задачей. `@expo/dom-webview` меняет умолчание для DOM components, прямой RN WebView сохраняется до проверки вызовов. Устаревшие старые Calendar/Contacts/MediaLibrary API в mobile manifest не заявлены. `expo-av` отсутствует; видео использует `expo-video`. iOS Expo Widgets переходит в stable, что требует сравнить API расширения и патч GAFUS. [SDK 56](https://expo.dev/changelog/sdk-56)

### 56 → 57

1. Перейти на RN 0.86.3, Worklets 0.10.1, Reanimated 4.5.1, Gesture Handler 2.32.x. Выпуск RN 0.86 заявлен как совместимый с API 0.85. Нативные C++/JSI, prefab и shared objects GAFUS всё равно пересобираются. Перепроверить RAM на анимированных экранах, запуск, WebView, жесты и клавиатуру. [SDK 57](https://expo.dev/changelog/sdk-57)
2. `expo prebuild` теперь по умолчанию регенерирует каталоги. Только выделенная чистая копия используется для воспроизводимого prebuild. Общий checkout, действующие симуляторы и ресурсы других работ исключить из операций. [SDK 57](https://expo.dev/changelog/sdk-57)
3. Закрепить сборку на Xcode 26.x, пока магазины и Expo её принимают. При переходе на Xcode 27 включить `ios.enableSceneSupport`, перенести только необходимые AppDelegate/SceneDelegate hooks и повторить холодный старт, callbacks, push, app links, Widgets и StoreKit на iOS 27. [Expo о Xcode 27](https://expo.dev/changelog/sdk-57) · [Требования Apple](https://developer.apple.com/news/upcoming-requirements/)
4. SDK 57 подтверждён как минимальный для ошибок Observe. Expo Router per-route метрики и сетевые spans из актуальных руководств могут зависеть от SDK 58 или конкретной версии; для 57 заявить только измеренные signals и использовать собственные W3C spans. [Конфигурация Observe](https://docs.expo.dev/eas/observe/configuration/) · [Интеграция Router](https://docs.expo.dev/eas/observe/integrations/expo-router/)

## 5. Инвентаризация зависимостей

Текущая колонка показывает разрешение именно импортера `apps/mobile` из `pnpm-lock.yaml`, включая workspace links. Для Expo-управляемых пакетов показан диапазон из `bundledNativeModules.json` выбранного релиза и, где применимо, точный pin. Для независимых пакетов начальный кандидат — их уже разрешённая версия. Это конкретный набор для первого прохода. Обновлять отдельную независимую библиотеку до другого релиза только после ошибки сборки или теста, по официальным release notes и с фиксированным новым pin. Широкие peer ranges подтверждают разрешение npm, а совместимость с RN 0.86 проверяется на бинарниках. [Пакет GAFUS](../../apps/mobile/package.json#L29-L137) · [Карта SDK 56](https://unpkg.com/expo@56.0.24/bundledNativeModules.json) · [Карта SDK 57](https://unpkg.com/expo@57.0.33/bundledNativeModules.json)

| Зависимость | Текущая версия | Цель 56 / 57 | Совместимость | Требуемое действие | Риск |
| --- | --- | --- | --- | --- | --- |
| `@appmetrica/react-native-analytics` | `3.6.0` | 3.6.0 | Кандидат без смены версии | Сверить iOS pod graph и Android, consent и coexistence | Высокий |
| `@expo-google-fonts/anton` | `0.4.2` | 0.4.2 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `@expo-google-fonts/montserrat` | `0.4.2` | 0.4.2 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `@expo/env` | `2.0.12` | 2.0.12 | Кандидат без смены версии | Сохранить direct; сверить с CLI, загрузку профилей и экспорт public config | Низкий |
| `@expo/ui` | `55.0.17` | ~56.0.26 / ~57.0.26 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `@expo/vector-icons` | `15.0.3` | 15.0.3 | Матрица Expo | Оставить прямую зависимость; проверить шрифты и иконки | Средний |
| `@gafus/analytics` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Низкий |
| `@gafus/chat-media-quality` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Низкий |
| `@gafus/consultation-shared` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Низкий |
| `@gafus/core-client` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Высокий |
| `@gafus/logger` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Высокий |
| `@gafus/types` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Низкий |
| `@maplibre/maplibre-react-native` | `11.5.1` | 11.5.1 | Peer range разрешает; нужен native gate | Проверить upstream peer minima; карты, 16 KB, tile/offline и память | Высокий |
| `@react-native-async-storage/async-storage` | `2.2.0` | 2.2.0 / 2.2.0 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `@react-native-community/netinfo` | `11.5.2` | 12.0.1 / 12.0.1 | Матрица Expo | Проверить смену major и поведение очередей offline | Средний |
| `@react-navigation/native` | `7.1.33` | удалить прямую после миграции | Несовместимый путь импорта | Перенести импорты приложения и моки в Expo Router; убрать direct если peer-graph позволяет | Высокий |
| `@shopify/flash-list` | `2.0.2` | 2.0.2 / 2.0.2 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `@tanstack/react-query` | `5.90.20` | 5.90.20 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `@voximplant/react-native-calls` | `2.0.0` | 2.0.0 | Peer range разрешает; нужен native gate | Проверить патч, Pods 3.3.0, вызов и звук на устройстве | Блокирующий при FAIL |
| `@voximplant/react-native-core` | `2.0.0` | 2.0.0 | Кандидат без смены версии | Держать одной версией с calls; проверить peer @voximplant/react-native-shared | Блокирующий при FAIL |
| `centrifuge` | `5.8.0` | 5.8.0 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `expo` | `55.0.32` | 56.0.24 / 57.0.33 | Матрица Expo | Pin patch SDK и связанные native template | Блокирующий при FAIL |
| `expo-application` | `55.0.19` | ~56.0.3 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-asset` | `55.0.20` | ~56.0.25 / ~57.0.21 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-auth-session` | `55.0.19` | ~56.0.20 / ~57.0.17 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-build-properties` | `55.0.18` | ~56.0.27 / ~57.0.23 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Высокий |
| `expo-camera` | `55.0.23` | ~56.0.8 / ~57.0.6 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-clipboard` | `55.0.17` | ~56.0.4 / ~57.0.2 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-constants` | `55.0.17` | ~56.0.27 / ~57.0.24 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-crypto` | `55.0.19` | ~56.0.5 / ~57.0.4 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-dev-client` | `55.0.41` | ~56.0.28 / ~57.0.21 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Высокий |
| `expo-device` | `55.0.21` | ~56.0.4 / ~57.0.2 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-document-picker` | `55.0.17` | ~56.0.4 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-file-system` | `55.0.26` | ~56.0.11 / ~57.0.7 | Матрица Expo | Async copy/move, URI, offline и загрузки | Высокий |
| `expo-font` | `55.0.8` | ~56.0.7 / ~57.0.4 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-haptics` | `55.0.18` | ~56.0.3 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-iap` | `3.4.13` | 3.4.13 | Peer range разрешает; нужен native gate | Сохранить StoreKit, purchase/restore/JWS и App Review граф | Блокирующий при FAIL |
| `expo-image` | `55.0.11` | ~56.0.13 / ~57.0.5 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-image-manipulator` | `55.0.21` | ~56.0.26 / ~57.0.22 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-image-picker` | `55.0.24` | ~56.0.25 / ~57.0.21 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-linear-gradient` | `55.0.18` | ~56.0.4 / ~57.0.2 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-linking` | `55.0.17` | ~56.0.19 / ~57.0.14 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-location` | `55.1.15` | ~56.0.26 / ~57.0.23 | Матрица Expo | Перенести только отсутствующую upstream логику из патча, проверить source AAR | Блокирующий при FAIL |
| `expo-notifications` | `55.0.27` | ~56.0.26 / ~57.0.25 | Матрица Expo | APNs/Expo/FCM, Android permissions и push cold start | Высокий |
| `expo-router` | `55.0.18` | ~56.2.22 / ~57.0.31 | Матрица Expo | Мигрировать импорты и route graph | Блокирующий при FAIL |
| `expo-screen-capture` | `55.0.18` | ~56.0.5 / ~57.0.4 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-screen-orientation` | `55.0.20` | ~56.0.5 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-secure-store` | `55.0.18` | ~56.0.4 / ~57.0.4 | Матрица Expo | Обновление поверх старой сборки, login/refresh/logout | Высокий |
| `expo-sensors` | `55.0.19` | ~56.0.6 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-splash-screen` | `55.0.25` | ~56.0.16 / ~57.0.11 | Матрица Expo | Проверить system splash и native startup | Высокий |
| `expo-sqlite` | `55.0.20` | ~56.0.6 / ~57.0.5 | Матрица Expo | Проверить схемы/старые данные, GPS/offline и WASM | Высокий |
| `expo-status-bar` | `55.0.6` | ~56.0.4 / ~57.0.1 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-task-manager` | `55.0.20` | ~56.0.27 / ~57.0.23 | Матрица Expo | Task name, headless entry, OS lifecycle | Блокирующий при FAIL |
| `expo-updates` | `55.0.33` | ~56.0.28 / ~57.0.28 | Матрица Expo | Полный Hermes bundle, два транспорта, подпись и runtime | Блокирующий при FAIL |
| `expo-video` | `55.0.21` | ~56.1.4 / ~57.0.5 | Матрица Expo | Физические устройства, quality switch, playback lifecycle | Высокий |
| `expo-web-browser` | `55.0.20` | ~56.0.6 / ~57.0.3 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `expo-widgets` | `55.0.20` | ~56.0.27 / ~57.0.28 | Матрица Expo | Сверить AppIntent/queue patch и embedded extension | Блокирующий при FAIL |
| `libphonenumber-js` | `1.12.8` | 1.12.8 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `react` | `19.2.0` | 19.2.3 / 19.2.3 | Матрица Expo | Один React в Metro; сверить Workspace peers | Блокирующий при FAIL |
| `react-dom` | `19.2.0` | 19.2.3 / 19.2.3 | Матрица Expo | Выравнять с React; проверить Expo Web graph | Блокирующий при FAIL |
| `react-native` | `0.83.10` | 0.85.3 / 0.86.3 | Матрица Expo | Проверить корневой RN, ABI, Hermes, сборку | Блокирующий при FAIL |
| `react-native-android-widget` | `0.26.0` | 0.26.0 | Peer range разрешает; нужен native gate | Сохранить патч, receiver и CNG registration | Блокирующий при FAIL |
| `react-native-compressor` | `1.16.0` | 1.16.0 | Peer range разрешает; нужен native gate | Сохранить патч и доказать реальные native export/16 KB | Блокирующий при FAIL |
| `react-native-gesture-handler` | `2.30.1` | ~2.31.1 / ~2.32.0 | Матрица Expo | Жесты/overlay и RN/Reanimated contract | Средний |
| `react-native-markdown-display` | `7.0.2` | 7.0.2 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `react-native-paper` | `5.14.5` | 5.14.5 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `react-native-reanimated` | `4.2.1` | 4.3.1 / 4.5.1 | Матрица Expo | Обновить комплект; rebase/снять patch по проверке CMake | Блокирующий при FAIL |
| `react-native-rustore-push` | `0.9.2` | 0.9.2 | Peer range разрешает; нужен native gate | Проверить Maven, vendor device без GMS и получение push | Высокий |
| `react-native-safe-area-context` | `5.6.2` | ~5.7.0 / ~5.7.0 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `react-native-screens` | `4.23.0` | ~4.26.0 / ~4.26.0 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `react-native-svg` | `15.15.3` | 15.15.4 / 15.15.4 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `react-native-teleport` | `1.2.2` | 1.2.2 | Кандидат без смены версии | Проверить New Architecture overlay, keyboard и gesture | Высокий |
| `react-native-web` | `0.21.2` | 0.21.2 (в пределах ~0.21.0) | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `react-native-webview` | `13.16.0` | 13.16.1 / 13.16.1 | Матрица Expo | Выровнять через Expo; адресный smoke по использованию | Средний |
| `react-native-worklets` | `0.7.4` | 0.8.3 / 0.10.1 | Матрица Expo | Сверить Babel и совместимость Reanimated | Блокирующий при FAIL |
| `yandex-mobile-ads` | `7.18.0` | 7.18.0 | Кандидат без смены версии | Сохранить Podspec и Android native path до проверки SDK; rewarded lifecycle | Высокий |
| `zod` | `4.6.7` | 4.6.7 | Кандидат без смены версии | Сверить override/lock 4.6.7 при declared ^3.24.1; тестировать фактический graph | Низкий |
| `zustand` | `5.0.7` | 5.0.7 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `@apptracer/sourcemap` | `1.1.12` | 1.1.12 | Кандидат без смены версии | Для прежних артефактов; новый private symbol pipeline §8 | Низкий |
| `@babel/core` | `7.29.0` | 7.29.0 | Кандидат без смены версии | Зафиксировать из lockfile; адресный smoke | Низкий |
| `@gafus/core` | `workspace:*` | workspace:* | Сборка workspace | Проверить platform exports, build и отсутствие server-only imports | Высокий |
| `@types/react` | `19.2.18` | 19.2.18 | Кандидат без смены версии | Сохранить явный pin/exclude, проверка tsc и React peers | Низкий |
| `typescript` | `5.9.3` | 5.9.3 | Кандидат без смены версии | Pin на время миграции и добавить в expo.install.exclude | Низкий |
| `expo-modules-core` (транзитивный) | 55.0.27, patched | ~56.0.27 / ~57.0.26 | Матрица Expo | Снять несовместимый patch mapping; доказать перенос поведения и linking | Высокий |
| `hermes-compiler` (транзитивный) | 0.14.1 | 250829098.0.10 / 250829098.0.17 | Манифесты RN | Компилятор и engine из одной версии RN; digest итогового HBC/карты | Блокирующий при FAIL |
| `expo-observe` (опциональный) | отсутствует | не устанавливать / 57.0.28 для эксперимента | Native crash preview | Зафиксировать разрешённые `expo-app-metrics` и `expo-eas-client`; проверить export §7 | Высокий |

Для MapLibre 11.5.1 опубликованы Expo ≥54 и RN ≥0.80; для Android widget 0.26.0 Expo ≥54; для Voximplant calls 2.0.0 React ^19.2.0, RN ≥0.77 <1 и связанные Voximplant peers 2.0.0. Для Expo IAP 3.4.13, compressor 1.16.0, RuStore push и teleport широкий RN peer не фиксирует ABI. Проверить каждую связанную Maven/CocoaPods поставку и соответствие архитектур, в том числе binary-only зависимости, прежде чем считать кандидат готовым. [MapLibre](https://github.com/maplibre/maplibre-react-native) · [Expo IAP](https://github.com/hyochan/expo-iap) · [Voximplant](https://github.com/voximplant/react-native-voximplant) · [Compressor](https://github.com/numandev1/react-native-compressor) · [Android widget](https://github.com/sAleksovski/react-native-android-widget)

Сверить `pnpm why` по RN, React, React DOM, Hermes, Expo Core, Expo CLI, worklets и Router. В lockfile видны несколько Expo/React peer contexts. Само наличие нескольких записей не означает дубликат в mobile bundle. PASS требует одного runtime React/RN в графе Metro, совпадения native autolinking graph с версией JS и согласованного lockfile у соседних импортёров. Актуальные патчи задаёт корневой `pnpm.patchedDependencies`. Наличие старых патчей в папке не делает их активными.

## 6. Аудит нативных модулей

Пути внутри `apps/mobile` указаны относительно пакета, кроме корневых `patches/`. Сценарии приёмки на устройствах в §13.

### 6.1 CNG, плагины и патчи

| Участок | Изменение и проверка |
| --- | --- |
| `plugins/withExpo55ReactHost.js:6–48` | Переписывает Kotlin host block под ExpoReactHostFactory. Начать с чистого template 56/57. Удалить plugin из новой линии, если template уже создаёт нужный ReactHost. Проверить native packages walk/startup в MainApplication. При необходимости адаптировать только отсутствующий hook и покрыть новым fixture. |
| `plugins/withExpo55IosAppDelegate.js:6–32` | Меняет `@UIApplicationMain`, Swift import, объявление класса и убирает `bindReactNativeFactory`. Вывести из профиля 56/57, если новый template собирается. Сохранить правильный factory binding. AppDelegate/SceneDelegate проверить вместе с analytics, updates и deep links. |
| `plugins/withHermesCompiler.js:6–24` | Патчит Gradle путь к RN compiler по regex. Сравнить generated Gradle с SDK 57, доказать правильный compiler path и bytecode format в обоих exports. Снять patch, если Expo уже разрешает нужный compiler. |
| `plugins/withMinSdkFromGradleProps.js`, `withAndroidTabletSupport.js`, `app.json:347–367` | Сохранить minSdk 24 и tablet policy в merged Manifest. Проверить дублирование build-properties, взаимодействие с AAR и повторный prebuild. |
| `plugins/withStartupWindowBackground.js`, `withNativeAndroidStartup.js:9–49`, `native/android-startup/src` | Сохранить Kotlin MainActivity.onCreate и package registration. Обновить якоря под RN 0.86, idempotency и отсутствие двойного splash. Проверить startup poster, night mode, поворот и переход к доступному экрану при сбое загрузки. |
| `plugins/withDogWalkBackgroundSteps.js:10–23`, `withDogWalkChronometer.js`, `native/android-walk` | Сохранить Java module/service/package, уведомление, chronometer, resources/receiver и activity recognition. Проверить merge со startup registration, FGS type, отсутствие дублей и release shrinker. |
| `plugins/withDogWalkWidgetEmbed.js:9–65`, `patches/expo-widgets@55.0.20.patch`, `patches/react-native-android-widget@0.26.0.patch` | iOS patch сохраняет AppIntent start/pause/finish в атомарные файлы App Group с проверенным owner и JS bridge. Перенести отсутствующее upstream поведение. При precompiled build доказать, что нужный Swift код входит в extension. Проверить embedding, entitlements и signer. Android patch защищает native обработку child widget; сохранить null/empty case и receiver. |
| `plugins/withIosAppMetrica516Compatibility.js:13–68`, `YandexMobileAds-7.18.0-AppMetrica5.podspec.json` | Проверить Pod graph на Xcode 26.x и workaround `typeof` на AppMetrica. Собрать Yandex Ads и AppMetrica на одном Pod graph, проверить privacy manifests и разграничить analytics и crash-reporting. |
| `plugins/withVoximplantIosPods.js`, `patches/@voximplant__react-native-calls@2.0.0.patch` | Оставить согласованные Core/Calls/WebRTC 3.3.0 podspec и bridge fixes до compile/device тестов. Сохранить mic, audio route, interrupt, remote leave. Проверить binary AAR/Pods и 16 KB Android. |
| `plugins/withAppTracerNative.js`, `scripts/upload-apptracer-sourcemaps.mjs` | SDK 55 продолжает обслуживаться. В новой линии удалить native crash injection после Uptrace PASS, сохранив одного владельца fatal hooks. AppMetrica crash flags и vendor egress проверить отдельно. |
| `patches/expo-location@55.1.15.patch`, `package.json:130–135` | Сверить upstream Kotlin LocationModule/arguments/task consumer, включая передачу deferred timeout. Проверить locked/background на API 34/36. Перенести отсутствующее и сохранить `buildFromSource`, если готовый AAR обходит fix. |
| `patches/expo-modules-core@55.0.27.patch`, `patches/react-native-reanimated@4.2.1.patch` | Содержат CMake/link build order. Снять старые mapping при bump. Проверить чистый debug и release на всех поставляемых ABI, CMake inputs и 16 KB. При воспроизводимом дефекте перенести минимальный fix. |
| `patches/react-native-compressor@1.16.0.patch` | Сохраняет Android FPS по render/mux timestamps, Swift размеры/кодеки/аудио. Проверить на реальных файлах и итоговом AAB. |
| `modules/modules/yookassa-payments` | Android использует Expo Module plugin и compile SDK fallback 36. Есть iOS Swift и шаблон podspec внутри `package/`. Проверить фактический autolinking и binaries обеих платформ. Для нового iOS checkout держать Apple-only профиль. Наличие шаблона podspec само по себе линковку не доказывает. |

Для каждого обновлённого патча сохранить проверку поведения и итогового артефакта. GPS, виджеты, startup, payment boundary и link order проверяются в бинарнике после чистой генерации.

### 6.2 Пользовательские функции и данные

| Подсистема | Реализация и миграционные требования |
| --- | --- |
| GPS | `src/features/walk/walkGpsTask.ts:24–168` регистрирует глобальную задачу, запрашивает foreground/background отдельно, запускает Android FGS с `killServiceOnDestroy:false`, останавливает после durable pause/finish. `walkGpsStorage.ts:91,146` сегментирует трек и защищает от поздних callback. `walkSync.ts:79,154` сливает маршруты и перечитывает состояние после сети. Сохранить task name, SQLite и owner scope. Lock, background, OS kill и явный force stop — разные проверки. После force stop гарантировать восстановление при ручном запуске с разрывом трека, если ОС остановила доставку. Проверить MapLibre, approximate/one-time и отказ. [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/) |
| Виджеты | `widget-entry.ts:3–23`, `WalkWidgetSessionSync.tsx`, `walkWidgetSnapshot.ts`, `iosWalkWidgetActions.ts:41,133`, `androidWalkWidgetActions.ts:40`. iOS — подписанный App Group/extension, snapshot, timer/AppIntent, очередь после background, быстрые нажатия и logout. Android — chronometer, шаги, resize, receiver и cold start. Повтор и поздняя команда из другой сессии не меняют новую прогулку. |
| Видео и звук | `src/shared/components/VideoPlayer.tsx`, `media/SocialVideoControls.tsx`, `src/features/feed/FeedV2Media.tsx`, `src/features/chat2/Chat2RoomScreen.tsx`, `videoPlaybackPolicy.ts`, `videoPlaybackCoordinator.ts`. MP4, 360p/720p, CDN fallback, позиция при смене источника, единственный активный плеер, replay/unmount. В mobile manifest нет прямых Expo Audio/AV. Проверить звук MP4, mute, Bluetooth/наушники, interruption и Voximplant. Если каталог релиза содержит отдельный audio asset, испытать его фактическим компонентом. |
| Подготовка вложений | `src/shared/lib/media/{prepareUploadVideo720,mp4UploadProbe,prepareVideoPosterWebp,prepareUploadPhoto,prepareUploadWebp}.ts`, `features/feed/uploads.ts`, `features/gallery/uploads.tsx` и `features/chat2/api.ts`. Сохранить 720 long edge, ограничения кодека/FPS, без upscale, постеры и WebP sanitization. `prepareUploadVideo720.ts:99–117` передаёт encoder target bitrate 1.45 Мбит/с Android и 1.8 Мбит/с iOS, проверяет общий предел 200 MiB. `mp4UploadProbe.ts:135,174–186` определяет точные допустимые FPS/bitrate для разных путей. У Моментов `features/feed/uploads.ts:153,192–193` применяет `FEED_LIMITS` из `packages/types/src/feed.ts`, включая 10 вложений и 3 видео. Chat2 в `features/chat2/api.ts:361,391–392` применяет 5 MiB для проверяемой ветки фото и 100 MiB для MP4 / 10 MiB для иных MIME в общей ветке. Проверить границы отдельно по поверхности. Проверить MP4 через probe/ffprobe, EXIF/rotation, cancel/retry, сеть между PUT и finalize, истёкший signed URL, идемпотентность. На подписанные сторонние PUT не добавлять traceparent. |
| Платежи iOS | `AppSubscriptionPaywall.ios.tsx:52–132`, `appSubscriptionApi.ios.ts`, `appSubscriptionAppleApi.ts`, `lib/appleAppSubscriptionPurchase.ts`, `verify-ios-payment-graph.mjs` и `verify-ios-payment-export.mjs`. Apple StoreKit через `expo-iap@3.4.13`. Проверить покупку, pending/cancel, restore после переустановки, повтор JWS, mismatch principal/auth epoch, environment/product/account validation и finish после server confirmation. Старую отмену YooKassa-renewal проверить отдельно. В binary/OTA графе iOS доказать отсутствие достижимого нового YooKassa checkout, включая динамические импорты. Sandbox/TestFlight, review notes и демо-аккаунт по правилам Apple. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) |
| Платежи Android | `lib/yookassaAppSubscriptionPurchase.ts` и локальный Expo module. Проверить checkout, возврат по deeplink, отмену, повтор, статус и смену аккаунта. RuStore Maven и `react-native-rustore-push` относятся к push. `expo-iap` основан на OpenIAP, отдельного direct OpenIAP/RuStore Billing в manifest нет. Подтвердить разрешённый Android billing flow по фактическому магазину до загрузки. |
| Push и chat | `src/shared/lib/utils/notifications.ts:87,300,337` и `app.json:373–375`. Реальная доставка Expo/APNs/FCM и RuStore vendor path, register/unregister, refresh, logout/account switch, background/foreground/cold tap. Chat2 — media, signed URLs, WS/reconnect, keyboard resize, paste/attachment cancel, повтор без дубликата и запрет доступа к чужому чату. |
| Links/auth | `app.config.js:62–98`, `app.json:26–55`, `src/shared/providers/AuthProvider.tsx`, `stores/authStore.ts` и `lib/api/client.ts`. Сохранить scheme, autoVerify, associated domains, VK callbacks, refresh, SecureStore и ownership. Сверить signer с assetlinks, AASA с team/bundle, cold/warm tap и истечение авторизации. |
| Курсы и offline | `src/shared/lib/offline/{downloadCourseForOffline,downloadHLSForOffline,offlineStorage}.ts`, `src/shared/stores/offlineStore.ts`. Сохранить cache schema, HLS/local paths, retry/resume. Проверить paid/assigned entitlements, partial downloads, logout/new account, in-place upgrade, replay без дублей. |
| Старт и разрешения | `app/_layout.tsx:88–202`, `src/shared/components/StartupLoader.tsx`, `plugins/withNativeAndroidStartup.js`, `src/features/rewarded-ads/adapter/yandexRewardedAds.ts` и `packages/analytics/src/appmetrica-mobile.ts`. Сохранить splash/first frame и startup fallback. Проверить deny/revoke/grant камеры, фото, mic, location, activity, push. Rewarded ad — показ, сбой SDK, account switch, единственный grant. |

## 7. Возможности Expo Observe

Изучены опубликованные `expo-observe@57.0.28` и `expo-app-metrics@57.0.24`. Первый заявляет `expo-app-metrics ~57.0.24` и `expo-eas-client ~57.0.5`. Перед прототипом записать resolved versions и повторить проверку при отличии lock. [SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/observe/) · [Observe tarball](https://registry.npmjs.org/expo-observe/-/expo-observe-57.0.28.tgz) · [App Metrics tarball](https://registry.npmjs.org/expo-app-metrics/-/expo-app-metrics-57.0.24.tgz)

| Возможность | Статус и инженерное решение |
| --- | --- |
| 1. Минимальный SDK | SDK 55 для базовых startup metrics, SDK 56 для ObserveRoot и расширенной интеграции, SDK 57 для preview ошибок. Нужна development/release build. [Настройка](https://docs.expo.dev/eas/observe/get-started/) |
| 2. Минимальный пакет | Документация фиксирует `57.0.21` для native crashes; для JS указаны SDK 57 и preview без отдельного min patch. Pin опыта `57.0.28`. [Ошибки](https://docs.expo.dev/eas/observe/errors/) |
| 3. JS | Официально unhandled global JS handler, `ObserveErrorBoundary`, `Observe.reportError`. `expo-app-metrics/src/installErrorHandler.ts:21–43` оборачивает ErrorUtils и делегирует прежнему. Проверить порядок импорта с GAFUS и native pending flush. |
| 4. Promise rejection | В прочитанном capture path отдельного rejection hook нет. ErrorUtils покрывает дошедшие до него ошибки. На Release проверить Hermes rejection tracking и late catch. Для своего capture внедрять один поддерживаемый RN/Hermes hook после опыта; browser `unhandledrejection` для RN не предполагать. |
| 5. iOS | MetricKit на реальном устройстве. Mach/Unix, uncaught Obj-C/Swift по документации с iOS 17. `CrashReport.swift:105,132–140` рендерит `exception.stacktrace` и может добавить binary UUIDs. `CrashReportSymbolicator.swift:53–93` ограниченно разрешает имена on-device. Проверить iOS 16.4+ и задержку после обновления. |
| 6. Java/Kotlin | Официально uncaught с cause chain. `CrashFileReader.kt:19–69` и `CrashReportProcessor.kt:41–104` связывают pending crash file и OS record. Обфусцированные кадры требуют mapping релиза вне Expo. |
| 7. NDK | Документированы native crash events на Android 11+. В проверенном `ExitInfoProvider.kt:28–59,97–101` отбираются причина, сигнал и описание, а `getTraceInputStream()` отсутствует. Receipt SIGSEGV/SIGABRT не доказывает наличие tombstone или стека. Собственный adapter читает tombstone начиная с API 31. [ApplicationExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo) |
| 8. ANR / OOM / hang | Expo явно исключает ANR и OOM, Android provider фильтрует эти причины. Полноценный hang-отчёт не подтверждён. Использовать отдельные OS diagnostics. |
| 9. После перезапуска | Документирован next launch/flush. Kill до записи, uninstall, отсутствие повторного запуска и delayed MetricKit ограничивают доставку. Проверить cold restart и offline restart. |
| 10. Offline | Документировано локальное хранение. В `ObservabilityManager.kt:80–115` и `Observability.swift:8–42` есть раздельный in-memory retry gate. TTL/DB limits, 429/503 и partial success проверить, для своей очереди см. §8. |
| 11. OTA/update ID | `AppMetadataProvider.kt:84–90` и `UpdatesMonitoring.swift:51–62` читают runtime/update ID; embedded без OTA ID. `OpenTelemetry.swift:374–377` содержит payload keys. Проверить custom OTA и crash → смена OTA → отправка. Нужно значение в момент сбоя. |
| 12. Hermes source maps | В Expo dashboard через Expo Build/EAS Update. CLI ≥22.0.0 для remote Build и ≥24.9.0 для Update upload; не работает как автоматическая символизация self-hosted OTA в Uptrace. Нужен свой pipeline. [Source maps](https://docs.expo.dev/eas/observe/errors/) |
| 13. dSYM / R8 / ELF | Загрузка native symbols и полная символизация в Observe dashboard официально отсутствуют. Сопоставлять релизные артефакты GAFUS. |
| 14. Custom OTLP | Официально `extra.eas.observe.endpointUrl` вшивается в binary. HTTP JSON на `<base>/<Expo project ID>/v1/logs` и `/v1/metrics`. Оба native exporters содержат эти пути. Встроенные network traces требуют SDK 58. [Конфигурация](https://docs.expo.dev/eas/observe/configuration/) |
| 15. Шлюз GAFUS | Протокольно совместим через валидацию и преобразование пути. Подтвердить staging JS и native logs, атрибуцию, sampling и retry. Доставка метрики и доставка расшифрованного crash stack проверяются отдельно. |
| 16. Только Uptrace | Custom endpoint заменяет путь отправки Observe. `dispatchingEnabled:false` останавливает весь dispatch; серверный toggle Expo запрещает приём. Доказать сетевой проверкой first launch, fatal/restart и retry: Observe-события только на GAFUS. EAS build/update и другие SDK проверять независимо. |

В production включать Observe только после проверки wire schema, приватности, очереди и пользы метрик. Disable global JS handler не отключает native crash reporting. При совместимости можно принять только metrics через шлюз и отбрасывать Observe error logs, сохранив один основной capture. При конфликте fatal handlers, неконтролируемом egress или лишней нагрузке оставить Observe в эксперименте. Архитектура §8 от него не зависит. [Observe sampling](https://docs.expo.dev/eas/observe/configuration/) · [Error handling](https://docs.expo.dev/eas/observe/errors/)

## 8. Архитектура Uptrace Cloud

### 8.1 Потоки и владельцы

~~~text
iOS / Android JS + native adapter ── HTTPS ──> GAFUS ingest ──> durable spool
Web (browser) ── HTTPS ──────────────────────> GAFUS ingest ──> durable spool
Observe SDK 57, только после опыта ── OTLP/JSON ────────────> GAFUS ingest
                                        spool → symbolication/normalization
Web (server) / API / Worker ── private OTLP ───────────────────────────┐
normalized logs/spans/metrics ────────────────────────────────────────┴─> private Collector → Uptrace
~~~

Uptrace Cloud project 9378 «GAFUS Production» — постоянное поисковое хранилище. GAFUS содержит ограниченный TTL-spool и закрытый архив релизных символов/карт. Развернуть эксперимент на отдельном тестовом проекте Uptrace или изолированном Collector с локальным приёмником, затем сделать разрешённый production smoke с синтетикой. Существование OTLP и read-only доступа к проекту 9378 дано в постановке. Проверка project quota/retention, accepted signals и поиск тестовых событий выполняются на этапе приёмки. [Uptrace ingest](https://uptrace.dev/ingest) · [Collector](https://uptrace.dev/opentelemetry/collector)

**Сервисы.** `gafus-mobile-ios`, `gafus-mobile-android`, `gafus-web`, `gafus-api`, `gafus-worker`. Для отдельных Cloud Jobs сохранить принадлежность к worker и фиксированное `gafus.component`, сверив это с именами Agent 2. Сервер задаёт имя и окружение по доверенному ingress/профилю. Ресурсные атрибуты по allowlist: app version, build, platform, OS major/minor, runtime, channel, update UUID/embedded, release artifact ID, app start ID с коротким TTL. В событии `event_id`, тип, время возникновения, severity, bounded operation/error code, normalized stack, symbolication status и допустимый trace context. Использовать OpenTelemetry severity и `exception.type`, `exception.message`, `exception.stacktrace`, `trace_id/span_id` полями OTLP log record. Update UUID и stack hash оставлять в logs/traces, не в metric labels. Архив артефактов привязан к SHA, digest, version/build, runtime, platform, update ID и debug IDs. Не смешивать installed appVersion, AppTracer synthetic version и OTA revision.

**Шлюз.** Новый API контракт для реализации — versioned POST `/api/v1/telemetry/mobile` и узкий путь `/api/v1/telemetry/observe/<project-id>/v1/{metrics,logs}` для опыта. Это проектируемые маршруты. Расположить на отдельном budget/rate-limit от auth/payments/GPS API. Мобильный сборщик использует release/environment allowlist, короткоживущую серверную upload сессию, независимую от refresh пользовательской сессии, и допускает crash до входа и после logout. При первичном получении upload сессии дать анонимный ограниченный бюджет на IP/установку/версию; публичные install headers и project ID не являются удостоверением. Play Integrity/App Attest рассматривать как дополнительный уровень только при доказанной доступности для RuStore и реальных устройств. Для Observe не предполагать header injection: отдельный путь, allowlist project ID и версии, edge rate cap, schema/size cap, общий бюджет и возможность выключения. Этот URL не проксирует произвольные адреса, headers или signals. Шлюз отбрасывает query/header baggage и пользовательские payload fields, проверяет content type, дату, числа, allowlist ключей и compressed/uncompressed limits до JSON decoding.

**Секреты.** Uptrace write DSN и ключи архива только в секретах серверного Collector/Worker, read-only service account только в контролируемой приёмке. При пересылке используется документированный `uptrace-dsn` header на Uptrace OTLP endpoint, который задаётся в серверной конфигурации. Серверные секреты не попадают в mobile JS/Info.plist/Manifest, Expo public config, sourcemaps, лог ответа или workflow artifacts. Проверить экспорт и сетевой трафик также по AppTracer/AppMetrica/Observe. Legacy SDK 55 может продолжать отправку в исторический AppTracer до вывода старых binaries из эксплуатации. Выключение сбора JS для старых клиентов потребует совместимого OTA. Вшитый legacy native SDK управляется только реально доступным vendor switch или новой сборкой. Проверить соответствие этому переходному исключению с владельцем диагностики. [Uptrace authentication](https://uptrace.dev/ingest)

### 8.2 Очередь, повтор и бюджет

| Участок | Контракт |
| --- | --- |
| Устройство | SQLite/атомарные файлы с TTL и ограничениями. Предложенный старт: до 500 записей / 8 MiB, до 50 событий и 256 KiB на запрос, 7 дней для ошибок и 24 ч для обычных событий. Резерв места для fatal, вытеснение низкого приоритета первым. Crash-time запись bounded, без fetch и без ожидания React bridge. На Android использовать OS/Java capture, на iOS MetricKit и при необходимости зрелый crash reporter. Удалять из очереди только по durable ack по event ID. |
| Повторы | Flush после bootstrap, при reconnect, при возвращении в foreground и best-effort background. Exponential backoff с jitter, ограничением до 15 минут и учётом Retry-After; 429/502/503/retryable network — повтор; 400/413/schema error — ограниченная обработка и счётчик, не вечный цикл; 401 — обновить upload сессию один раз. Ошибка диагностики не вызывает повторный `reportClientError`. |
| Серверный spool | Существующий PostgreSQL через отдельный доменный порт с TTL, либо выделенный durable queue при подтверждённом механизме атомарного dedup. Выбор для первого прохода — один PostgreSQL insert/upsert на batch, unique `(environment, service, event_id)`, возврат 202 после commit, аренда consumer, безопасный retry, ограниченная TTL/DLQ, purge по расписанию и размеру. Redis годится для rate limiting; сбой Redis не отключает глобальный ingress cap. Никаких бесконечных очередей или ack до durable commit. |
| Дедупликация | UUID создаётся один раз при первом enqueue; для OS crash использовать стабильный dedup ключ из provider, build, process и времени/диагностического hash. JVM capture и matching OS exit дают одно событие. JS fatal и соответствующий native death связать общим app start ID и окном, сохранив две диагностики только при разном полезном стеке. Uptrace экспорт at-least-once при потере ack, `event_id` остаётся пригоден для группировки. Дедуплицировать перед Collector и учитывать OTLP partial success, чтобы постоянный reject не приводил к повтору целого batch. |
| Privacy | Схема вместо произвольных объекта/metadata: запрет auth/cookies/DSN, signed URL/query, тела/чаты, геокоординаты и маршруты, e-mail/phone, платёжные данные/JWS, стабильный device ID и user ID. Брать matched route template, нормализованный error code и минимальный call stack. Очистить stack text и error message на устройстве и на сервере. Из OS отчётов извлекать только требуемые кадры/IDs, не хранить память, регистры, полные dumps, файлы и payload устройств. Тестировать canary-строки и query/URL после decoding. Сброс session context при logout. Проверить Info.plist privacy manifests, Store disclosures и ротацию short-lived IDs. |
| Бюджет | Публичный ориентир Uptrace — до 50 GB/мес и 5 000 timeseries; проверить реальную квоту проекта, единицы тарификации, billing cap и retention у владельца. За семь дней собрать текущее потребление Web/API/Worker, затем назначить mobile budget: меньше 20% от доступного месячного бюджета после резерва существующих сервисов. Начать с 1% обычных трасс и 100% допустимых crash/error под отдельным лимитом; metrics только агрегаты ограниченной кардинальности. Alerts на 50/75/90% прогноза. На 75% снизить success spans, на 90% отключить обычные client events/Observe, оставить зарезервированную полосу ошибок с агрегированием повторов и явным drop counter. Ошибки не обходят защиту от flood. [Uptrace pricing](https://uptrace.dev/pricing) |

### 8.3 Корреляция Mobile → API → Worker и Web

1. Инструментировать существующие `apiClient` и `apiClientMultipart` из `apps/mobile/src/shared/lib/api/client.ts:391,558`. Для first-party HTTP создавать client span и инжектировать W3C `traceparent`. Записать bounded operation, route template, status, retries. Не ставить заголовки на CDN PUT, OAuth/VK, магазины, оплату и произвольные origin. Для Web применять тот же контракт и CORS allowlist. Сохранить существующие request IDs и semantics retry/abort.
2. API продолжает валидированный W3C parent через `operationMetricsMiddleware`/`serverTelemetry.ts`. `requestId` API генерируется отдельно. Не доверять sampled флагу публичного клиента для forced sampling. `gafus.operation_id` остаётся идентификатором бизнес-операции; trace ID не заменяет его, ID пользователя или idempotency key.
3. Для синтетической и реальной Chat2 операции передать разрешённый trace context через producer/outbox и восстановить на worker. Переходный decoder принимает старый job без traceparent. Для повторов и разнесённых во времени callback использовать span links и тот же operation ID. Для одной проверочной цепочки Mobile → API → Worker показать общий trace ID от producer до consumer, а для callbacks проверить ссылку и operation ID. Собственные worker процессы берут Node-only logger export, browser bundle его не включает.
4. Head sampling оставляет полный стек ошибки в OTLP logs даже при несохранённых spans. Измерить это принудительным sampled-out запросом. Для частых ошибок можно добавить bounded synthetic error span только с достоверным контекстом; исторические spans при head sampling не восстановятся. Если требуется сохранить все failed end-to-end traces, выделить конкретные операции в ограниченный Collector tail-sampling stream с полным доступом к spans одного trace, routing по trace ID, budget и decision window. При первом проходе использовать управляемую sampled-in тестовую сессию и гарантированное хранение error logs. [OpenTelemetry context](https://opentelemetry.io/docs/specs/otel/context/) · [W3C Trace Context](https://www.w3.org/TR/trace-context/)

### 8.4 Capture и символизация

| Платформа | Первичный capture | Что и как символизировать | Границы |
| --- | --- | --- | --- |
| RN JS | Единая реализация за `reportClientError`, текущим ErrorBoundary и одним ErrorUtils handler, плюс проверенный Hermes rejection bridge. Handled → очередь. Fatal → маленький native pending record до делегирования прежнему handler с сохранением fatal behavior. В RN/Hermes release отдельно доказать синхронный bounded commit там, где предыдущий handler немедленно завершает процесс. | Для embedded сохранить composed Hermes map из точной подписанной сборки. Для OTA — map рядом с точным экспортом `--source-maps external`, но в приватном архиве. Ключ platform + release artifact + runtime + update UUID/embedded + debug ID/sha256. Worker применяет Metro/Hermes mapping по тому же engine, без sourceContent в Uptrace. На устройстве хранить update ID при capture, не при upload. | Ошибка до инсталляции JS handler и kill до durable write могут оставить только native диагностику. При отсутствии точной карты сохранить исходные offsets, `symbolication_status=missing_artifact`. |
| iOS | Native subscriber на старте, до RN, на `MXMetricManager`. Извлечь `MXCrashDiagnostic.callStackTree`, crash/hang type, UUID и offsets из JSON, а `MXAppExitMetric` использовать для агрегатов exits. Сохранить sanitized кадры и metadata. Сопоставить поздний payload с build из MetricKit и сохранённым локальным launch ledger. При отсутствии доказуемого OTA у delayed report отмечать unknown. | Архивировать dSYM приложения, extension и доступных framework. Сверять `dwarfdump --uuid` для каждой архитектуры; применять `atos` на изолированном Mac runner с UUID, arch и адресом/offset согласно формату. Только точное совпадение UUID. Verify на заведомо известной функции с release stack. | Задержка и неполное покрытие OS. Jetsam/OOM по агрегатам без стека. Если MetricKit не даёт требуемые кадры/стабильную next-launch доставку, использовать PLCrashReporter как единственного in-process signal owner и читать pending report следующим запуском. MetricKit оставить для hang/exits, dedup crash. Проверить выбранный публичный API, Swift/Obj-C exception, privacy и отсутствие AppTracer handler conflict. Widget process crash имеет свой bundle/UUID. [MetricKit](https://developer.apple.com/documentation/metrickit) · [PLCrashReporter](https://github.com/microsoft/plcrashreporter) · [dSYM](https://developer.apple.com/documentation/xcode/locating-a-missing-debug-symbol-file) |
| Android JVM | Установить один bounded uncaught exception capture до RN. Записать class, цепочку causes, ограниченные frames и release context, делегировать previous default handler. На старте привязать к OS exit record при API ≥30 и дедуплицировать. | Сохранять `mapping.txt` из точной release, если minification включена. Выполнить R8 Retrace, отдельно определить статус unobfuscated для сборки без mapping по дизайну. | При сбое до установки handler или записи может остаться exit reason. Java OOM capture — best effort; отсутствие данных нельзя интерпретировать как отсутствие падения. [Android ApplicationExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo) |
| Android NDK / ANR | API ≥30 читать `getHistoricalProcessExitReasons`. API ≥31 для native crash читать bounded tombstone protobuf из `getTraceInputStream()` и извлекать module/build ID/ABI/relative PC. Для ANR на ≥30 обработать поток только когда он доступен и принадлежит нужному exit. Отдельно учитывать low-memory exit. | Архивировать unstripped ELF и build IDs из точного AAB/Gradle outputs. Сверять ABI и build ID, использовать `llvm-symbolizer` или `ndk-stack`. Для vendor prebuilt libs запросить matching symbols, иначе сохранить module+offset и статус partial. | API 30 обычно даёт native exit reason без tombstone, API 24–29 не даёт этого OS API. Кольцевой буфер может перезаписать tombstone, force-stop и OEM могут ограничить запись, ANR может восстановиться без exit. Для ≥31 обязательный test символизированного NDK кадра. Если полный NDK стек обязателен и на API 24–30, до выпуска квалифицировать поддерживаемый offline native minidump collector с собственным transport (например, Google Breakpad как кандидат) на RN 0.86 и 16 KB. Не считать его совместимым до отдельной сборки и проверки, не писать собственный signal unwinder. [Android API](https://developer.android.com/reference/android/app/ApplicationExitInfo) · [Native debug symbols](https://developer.android.com/build/include-native-symbols) · [ndk-stack](https://developer.android.com/ndk/guides/ndk-stack) |

Symbolication queue ждёт отсутствующий release artifact ограниченное время, затем выдаёт один нормализованный отчёт с raw frames и причиной partial/missing. Для поздних артефактов разрешить отдельную управляемую reprocessing задачу с тем же event ID и явным revision. Держать символы для всех поддерживаемых binaries/OTA, включая rollback и legacy, с дополнительным окном после EOL, достаточным для задержанной доставки. Доступ к картам, dSYM и ELF ограничить CI и symbolication; подписанный manifest не содержит ссылки на них. Архив артефактов и runtime registry должны быть готовы до подписания/promote.

## 9. Пошаговый план реализации

Все действия этого раздела относятся к будущей реализации. Команды проверки обозначены буквами §12, критерии — идентификаторами §13. Каждый этап заканчивается сохранением исходного SHA, versions, результатов и release artifacts. После группы небольших изменений запускать только затронутые tests. Полные контрольные прогоны — baseline, интегрированный SDK 57 candidate и финальный release candidate перед магазинами.

### Этап 0. Согласовать исходное состояние

- **Цель и вход.** Собрать проверяемый SDK 55 baseline из интеграции работ по Apple-only iOS, OTA, observability и текущим Core boundaries. Стартовая точка аудита §2. Владелец релиза выбирает SHA после согласования с владельцами.
- **Файлы и действия.** Сверить `apps/mobile`, `package.json`, `pnpm-lock.yaml`, `patches` и файлы §11. Снять git status/snapshot, перечень реально установленных binaries/OTA, магазинов, EAS project/channel mapping, release symbols и поддерживаемых ОС. Выгрузить только безопасные metadata и сохранить checked lock. В работах пересекаются AppTracer/source-map contract, payment graph и новый native startup.
- **Проверка, риск, переход.** A/B + полный SDK 55 smoke iOS/Android и автоматическая регрессия, отдельно Gate по зафиксированным ранее combined 33+5/18 сценариям, где применимо к общей интеграции. Не засчитывать чужой PASS без идентичного source/artifact. Зафиксировать ошибки baseline как блокеры или уже известные воспроизводимые ограничения.
- **Откат.** Оставить исходный SHA, опубликованные бинарники, предыдущие карты и manifest. Незакоммиченный общий checkout не использовать как место для экспериментов.

### Этап 1. Подготовить выделенные инструменты и staging

- **Цель и вход.** После этапа 0 собрать воспроизводимую временную копию согласованного SHA для будущих проверок, отдельные release signing profiles, staging API/DB/Redis/queues, S3/Beget, Uptrace QA или local OTLP sink.
- **Файлы и действия.** `apps/mobile/eas.json`, `.github/workflows/gafus-self-hosted-ota-preview.yml`, Node/pnpm и локальный release wrapper. Выделить обычную изолированную копию исходников/checkout без создания worktree. Отдельные симуляторы, device identifiers, хранилища и env. Node 22.23.1, кандидат EAS Xcode 26.6 и локальный Xcode 26.x ≥26.4, CocoaPods 1.16.2 и JAVA_HOME JDK17; Android API 36/NDK 27.1. Не переводить legacy SDK 55 workflow на новый toolchain без его собственного теста.
- **Проверка, риск, переход.** A/C. На stage проверить отсутствие production host в preview payload и хранилищах, получение SDK 55 baseline с согласованным профилем и отсутствие пересечений с другими агентами. Устроить профиль с тестовыми credentials и app signing, способный принимать push/Apple sandbox.
- **Откат.** Выключить только выделенные тестовые ресурсы, вернуть прежнюю сборочную линию и сберечь тестовые артефакты.

### Этап 2. Переход на SDK 56

- **Цель и вход.** Локальная checkpoint после A–C. Разделить функциональные breaking changes SDK 56 и ABI изменения 57.
- **Файлы и действия.** `apps/mobile/package.json`, root RN/lock, Metro/Babel/TS, Router imports, FileSystem/fetch call sites, config plugins и патчи. Снять mappings только для обновляемых пакетов в том же dependency change, закрепить версии §5, запустить Expo fix, перенести Router, проверить fetch/file semantics. Сначала отладить чистый generated app, затем по группам Android bridge+startup, iOS Pods+widget, media+payments. Не включать Observe или новые production OTA на SDK 56.
- **Проверка, риск, переход.** D/E. PASS — frozen reinstall, lint/tsc, Metro iOS/Android, чистый native prebuild и по одному локальному release-like запуску на платформу с targeted критическим smoke. Измерить RAM Worklets; известную SDK 56 регрессию записать отдельно, проверить исправление на 57. Отказы покупки/старта/линковки не переносить вперёд без воспроизводимого объяснения.
- **Откат.** Вернуть version pins и config к этапу 0 в выделенной линии. Runtime SDK 56 не активировался.

### Этап 3. Переход на SDK 57 и восстановление native builds

- **Цель и вход.** Пересобрать приложение на `57.0.33/0.86.3/19.2.3` после успешной checkpoint 56.
- **Файлы и действия.** Те же package/lock/patch плюс `app.json`, `app.config.js`, `native-release-contract.mjs` и все hooks §6. Поднять новую native marketing version. Проверить hermesc v1, Kotlin/Swift/Gradle templates, pods, extension embedding, Android AAB 16 KB и App Links. Сформировать отдельные baseline release archives, embedded maps и symbols. Подписать только staging/preview варианты с точными route settings.
- **Проверка, риск, переход.** D/E/F, G01–G12 из §13 и профиль памяти. Допустимы подтверждённые ограничения ОС, описанные в §14. PASS — два нативных артефакта, работа критических функций и стабильный clean regeneration. Native дефект при PASS JS блокирует дальнейшую аттестацию.
- **Откат.** Вернуть checkpoint SDK 56 для диагностики и SDK 55 для пользователей. Не повторять native runtime, выделенный провалившейся сборке, после изменения native graph.

### Этап 4. Доказать signed self-hosted OTA на SDK 57

- **Цель и вход.** Артефакты этапа 3, готовый preview backend и доверенные release descriptors.
- **Файлы и действия.** `self-hosted-native-profile.cjs`, `native-source-fingerprint.mjs`, `export-self-hosted-ota.mjs`, `prepare-self-hosted-ota.mjs`, preview workflow, `apps/api/src/modules/mobile-ota`, `packages/mobile-ota-server`, Prisma additive migrations. Утвердить native descriptor и сертификат, сохранить signed v1 manifest, immutable assets и SHA. Использовать full bundles. Привязать sourcemap архив к signed update UUID до promotion. В workflow preview целевого SDK сменить Node/pnpm/CLI и соответствующие source gates, не запускать из несогласованной ветки.
- **Проверка, риск, переход.** G, O01–O08, D01/D06. Проверить actual baked config, end-to-end на iPhone/Android, несовпадения, офлайн, source recovery, rollback с новой ревизией и матрицу legacy. Доказать partial rollout и наличие `expo-extra-params` на холодной нативной проверке. `src/shared/lib/ota/installationIdentity.ts:22` регистрирует ID через `Updates.setExtraParamAsync`, `useOtaAutoApply.ts:18` ждёт identity в JS. Fresh `ON_LOAD` может произойти до первого JS; серверный `rollout-policy.ts:23–31` исключает отсутствующий ID при частичной выдаче. Проверить также последующие запуски, JS check и отсутствие утечек installation ID. Любой wrong-runtime/cross-platform update — stop.
- **Откат.** PAUSE тестовый deployment, оставить embedded fallback, затем forward recovery update. Legacy URL/channel не переключаются.

### Этап 5. Uptrace, нативный capture и символы

- **Цель и вход.** После подтверждённых нативных сборок, идентификаторов OTA и согласования Node-only bridge. Реализацию gateway/symbol registry можно вести параллельно только на непересекающихся файлах после фиксации контракта.
- **Файлы и действия.** `reportClientError.ts`, `installGlobalJsErrorHandler.ts`, `mobileJsTracer.ts`, `api/client.ts`, bootstrap native module, Hono, logger Node export, Worker и queue types, Web client, новые ingest/spool/symbolication части §11. Реализовать §8 в порядке privacy/schema → queue/dedup → symbols → JS capture → iOS/Android adapters → E2E trace → quotas. После native addition заново зафиксировать fingerprint и, если уже аттестован несовместимый preview binary, выделить другой preview runtime и пересобрать. Удалить AppTracer native/JS transport только для новой линии после измеренного parity; выключение диагностики не должно менять работу продукта.
- **Проверка, риск, переход.** H, D01–D15. Синтетические падения только в закрытых тестовых сборках, нужные stack frames приходят в Uptrace после перезапуска. Проверить no double dispatch, egress, PII, quota, отказ Uptrace, server spans и Worker links.
- **Откат.** Remote stop signal на ingestion и отдельный kill switch на clients для обычных сигналов. При конфликте fatal hooks пересобрать preview с предыдущим рабочим capture, не ломая OTA/оплату. Нативное изменение не откатывается JS update.

### Этап 6. Опыт Expo Observe и решение о включении

- **Цель и вход.** Проверить ценность Observe в SDK 57 после этапа 5. Отдельный тестовый бинарник и свой endpoint.
- **Файлы и действия.** `apps/mobile/package.json`, `app.config.js`, `app/_layout.tsx`, тестовый шлюз. Зафиксировать `57.0.28`, использовать custom endpoint и release-like профиль, измерить TTI в существующем ready state. Проверить §7, сравнить фактический wire format со своим адаптером. Для production по умолчанию оставить собственный capture. Добавлять Observe только после PASS для конкретных метрик и подтверждения совместимости. Его добавление меняет native fingerprint.
- **Проверка, риск, переход.** H, D12/D15. PASS эксперимента — измеренный startup signal и отсутствие unintended cloud dispatch; зафиксировать, какие события при этом намеренно выключены или фильтруются. FAIL допускает выпуск без Observe при PASS §8, если цель централизованной диагностики выполнена.
- **Откат.** Выключить тестовый ingress и убрать эксперимент из кандидата. При изменении production binary пересчитать native runtime.

### Этап 7. Release candidate и регрессия

- **Цель и вход.** Одна интегрированная ревизия этапов 3–6 с новой версией, сборками и совместимым backend. Ветка допускается к TestFlight и закрытым Android трекам.
- **Файлы и действия.** Новые/изменённые профили, release verification и CI §11, manifest source и private symbol registry. Заморозить build graph. Проверить store-signers, политику магазинов, capability/permissions, marketplace payments и store listing privacy. Выполнить полный прогон §13 на подписанных артефактах и повтор на версии, устанавливаемой из TestFlight/закрытого магазина.
- **Проверка, риск, переход.** E/F/G/H, все обязательные case IDs и §17. Для изменений между полными прогонами применять targeted smoke и перечень затронутых контрактов; при смене native fingerprint/signature/release archive повторить проверки итогового candidate.
- **Откат.** Остановить закрытый rollout, вернуться к предыдущему проверенному preview/profile. Для production candidate сохранить предыдущий store релиз доступным.

### Этап 8. Поэтапный выпуск и сопровождение

- **Цель и вход.** PASS этапа 7 и §17, готовые release ownership/on-call и rollback materials.
- **Файлы и действия.** Подготовленные store profiles, production self-hosted attestations, runbook §15/16. Сначала активировать серверный read-only/совместимый контур и пустой paused deployment, затем release с embedded bundle. После healthy baseline выпускать первую signed OTA на небольшой когорте. Никакого forced update до объективной доступности для всех целевых устройств, сохранения SDK 55 и отдельного решения владельца.
- **Проверка, риск, переход.** §15, в Uptrace разрез по platform/build/runtime/channel/update, API/Worker ошибок и квоты. На каждом шаге либо согласованное продвижение, либо остановка. Довести до 100% только после выполнения условий.
- **Откат.** §16. Store halt/pause ограничивает новые установки, уже установленные бинарники получают совместимый fix-forward или новый бинарник.

## 10. OTA и обратная совместимость

### 10.1 Матрица

Условный номер `1.8.0` выбран для инструкции. Зарезервировать его только после проверки store/EAS inventory и иных текущих веток. Для SDK 56 использовать отдельное непубликуемое значение (например, `1.7.5` только при свободном номере) и dedicated QA channel. Если номер занят, выбрать следующий свободный marketing version и заменить его в приложении, дескрипторах, верификаторах и таблице. Существующие binary tuples извлечь из IPA/APK/AAB/EAS metadata и installed clients.

| Версия приложения | Expo SDK | Runtime | Channel / вшитый транспорт | Разрешённые обновления |
| --- | --- | --- | --- | --- |
| Ранее выпущенная сборка со старым SDK policy, если присутствует в inventory | 55 | `exposdk:55.0.0`, историческое свидетельство | Вшитый EAS URL и channel из артефакта | Только JS от совместимого старого native graph и того же runtime. Подтвердить точные versions/builds. |
| 1.7.3 (документированный кандидат SDK 55) | 55 | `1.7.3` appVersion | EAS `production` для production профиля, исторический mapping к `main` от 05.11 | Только OTA SDK 55 для 1.7.3 с прежним native graph. Forced gate использует свою положительную revision. Статус наличия в каждом магазине проверить. |
| 1.7.4 (текущие исходники) | 55 | `1.7.4` appVersion | По умолчанию EAS `preview/production`; self-hosted только при явно испечённом profile | Только совместимые 1.7.4 OTA для своего транспорта, platform, channel и fingerprint. Факт выпуска не следует из app.json. |
| Временная 1.7.5 при свободном номере | 56 | `1.7.5` | Local-only либо dedicated QA channel, никакого store production | Embedded или отдельный QA export для того же runtime. |
| 1.8.0 preview (условно) | 57 | `1.8.0` appVersion | Self-hosted `preview`, отдельный preview host/key/descriptor; workflow сейчас фиксирует preview channel | Только подписанные preview manifests с точным native fingerprint/platform/release. |
| 1.8.0 production (условно) | 57 | `1.8.0` appVersion | Self-hosted выделенный channel `sdk57-production` как проектное имя, если подтвердится контракт profile/registry; при ограничении схемы — отдельный production environment со значением `production` и изоляцией по runtime/fingerprint/key | Только signed production 57 OTA. `otaPolicy.ts:22–25` сейчас принимает только `production` для forced OTA, а EAS `native-release-contract.mjs:44–48,82–92` содержит старые EAS/канальные ограничения. `sdk57-production` использовать с optional OTA; поддержку forced gate добавлять отдельно только при явном решении. Source guard оставить для EAS, добавить отдельный self-hosted validation branch вместо снятия проверок. |
| Следующая сборка с изменившимся native SDK, сертификатом, транспортом или native modules | Тот же или следующий | Новый appVersion runtime | Явно выбранный transport/channel | Свой native graph и signing trust. Старые binaries продолжают получать только прежние совместимые OTA. |

Разделение каналов физически обеспечивает вшитый endpoint и registry scope. Не переназначать существующий EAS `production` на новый SDK. Если для поддержки SDK 55 нужны новые OTA, выпускать их из поддерживаемой линии SDK 55 с прежними пакетами и native ABI. Пользователи iOS 15.1–16.3 получают старый совместимый релиз при его доступности и должны продолжать проходить серверные проверки minVersion без требуемого невозможного обновления. Если историческая конфигурация API позволяет только глобальный минимум по платформе, отложить подъём минимума до явной политики поддерживаемых ОС.

### 10.2 Контракт доставки и восстановления

1. `apps/api/src/app.ts:170` монтирует `/ota`. `manifest-protocol.ts:40–88` проверяет protocol/platform/runtime/channel/signature expectation/fingerprint, возвращает `private, no-store` и правильный Vary. `packages/mobile-ota-server/src/repository.ts:17–56` дополнительно проверяет environment/appId/verified native/deployment state. При несовпадении или pause нет подходящего update. Отдельно испытать 204 negotiation с реальными client headers.
2. Реестр должен хранить version/build, platform, env, channel, runtime, update URL, signer/cert digest, native fingerprint, SHA, embedded update ID и evidence. `native-source-fingerprint.mjs` использует Git tracked files и профиль. При переносе незакоммиченных новых modules/plugins/patches проверить, что файл попал в индекс выбранного SHA и в fingerprint. Проверить fingerprint coverage для нового capture module, lockfile, plugins и native overlays. EAS project ID из app config не является секретом или границей безопасности.
3. Подписанный бинарник проверяется как объект доверия. Для self-hosted Preview/Production использовать собственные сертификаты; private key только в изолированном signer. Перед выдачей manifest проверить asset immutable digest/размер/доступность с реального устройства и cold cache. OTA code signing и App Store/Android binary signing — разные цепочки. По умолчанию использовать полный Hermes bundle, без зависимости от diff.
4. Карту загрузить в приватный артефактный архив перед регистрацией candidate, привязать к точному update UUID, platform и native build. Сохранить журнал promotion и источника. Старому workflow оставить его AppTracer map step для legacy; для новой линии заменить привязку на артефактную attestation. При ошибке карты candidate блокируется до восстановления.
5. Pause прекращает выдачу кандидата, но не удаляет update из кеша уже обновившегося устройства. Проверить recovery до/после первого render. Текущий сервер требует новую запись при rollback: `ROLLBACK_REQUIRES_NEW_UPDATE` в `deployment-commands.ts:164–179`. Основной откат — опубликовать прежний рабочий JS для того же scope как новый подписанный update с новой revision, UUID и более поздним timestamp, сохранив соответствующую карту. На rollback target проверить совместимость локальной SQLite/storage schema и backend. Если предыдущий JS несовместим с локальными данными, подготовить forward fix. `rollbackToEmbedded` — возможное расширение протокола после отдельного implementation/test; текущую manifest route не считать его реализацией. EAS использует собственный rollback/republish для legacy. [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/) · [Recovery](https://docs.expo.dev/eas-update/error-recovery/) · [Rollback EAS](https://docs.expo.dev/eas-update/rollbacks/)

## 11. Необходимые изменения файлов и пересечения

| Существующий участок | Что изменится при реализации | Чья работа пересекается |
| --- | --- | --- |
| `apps/mobile/package.json`, root `package.json`, lockfile, `patches/`, TS/Metro/Babel | Pins, SDK 56/57 graph, peer checks, активные патчи и postinstall. | Core boundary, текущие media patches, React Native root and workspace consumers. Один владелец общей пересборки lockfile. |
| `apps/mobile/app.json`, `app.config.js`, `eas.json` внутри mobile | Версия/runtime, pinned build profiles, target SDK, plugins, telemetry ingress и отдельный OTA profile. | Native startup, Apple-only, self-hosted OTA. |
| `apps/mobile/plugins/`, `native/`, `modules/`, `widget-entry.ts` | Перенос CNG anchors, autolinking и diagnostics bootstrap, сохранение walk/startup/modules. | Widgets/GPS, AppMetrica, Android startup, платежи. |
| `app/_layout.tsx`, `src/shared/components/StartupLoader.tsx`, `src/shared/lib/tracer/`, `src/shared/lib/api/client.ts` | Доставка через GAFUS, очередь, release context, traceparent, capture до RN. | Startup, legacy AppTracer, Agent 2 observability. |
| `features/walk`, `features/chat2`, `features/feed`, `features/gallery`, `features/app-subscription` и `shared/lib/media` внутри mobile src | Адресная адаптация fetch/filesystem, widget/codec contracts, StoreKit и media regression. | Активные правки в read-only snapshot. Приоритет интеграции — базовое Apple-only поведение, затем SDK адаптация. |
| `apps/mobile/scripts/`, `.github/workflows/gafus-self-hosted-ota-preview.yml`, `.github/workflows/ci-cd.yml` | Build/OTA version gates, current profile resolution, 16 KB/ABI, хранение symbols, проверка iOS payment export. | OTA/Apple, общий CI/release. Production signed workflow — новый этап реализации с review, preview workflow уже присутствует. |
| `apps/api/src/app.ts`, `apps/api/src/modules/mobile-ota`, `packages/mobile-ota-server`, `packages/prisma`, admin OTA | Сохранение текущего read path и scope, lifecycle нового release, безопасные additive schemas и server contracts. | OTA агент, Hono/Core/Prisma refactor. |
| `packages/logger/src/serverTelemetry.ts`, `apps/api/src/lib/operation-observability.ts`, `packages/worker/src`, `packages/queues/src`, `apps/web-vite/src` | Повторное использование Node-only bridge, first-party propagation, structured logs и isolated Collector route. | Agent 2, Worker/Cloud callbacks и очереди. |

Новые компоненты, которые требуется создать при реализации: нативный telemetry module GAFUS с iOS/Android collectors, Hono ingest с валидацией и durable storage port, spool/retention schema и worker, private release symbol registry/worker и отдельные тестовые fixtures. Конкретные имена файлов выбрать по границам согласованной ветки и существующему naming. Выше указаны только найденные в аудите существующие пути, а новые URL описаны как проектный контракт.

Порядок интеграции: зафиксировать OTA/Apple-only и Core exports на общем SHA → согласовать Agent 2 API/Worker contracts → заморозить исходные версии/lockfile → применить миграцию SDK в выделенной копии → возвратить атомарные группы изменений с новым lockfile → собрать и проверить merged SHA. До интеграции переаудировать изменившиеся участки. Не выполнять массовый reset/clean, merge/rebase или изменение общих сгенерированных каталогов ради текущего плана.

## 12. Команды и проверки

Команды приведены для выполнения после начала реализации в выделенной копии согласованного SHA. Запуски команд с записью, установкой, сборкой, подписями и публикацией относятся к этому будущему этапу. Ниже `$GAFUS_QA_DIR` — выделенный абсолютный каталог для артефактов QA, `$GAFUS_QA_AAB` — абсолютный путь к конкретному AAB, `$GAFUS_QA_IPA` — к конкретному IPA, `$GAFUS_QA_DESCRIPTOR` — к публичному native descriptor. Задать значения в среде QA, проверить владельца и отсутствие production targets. Никаких dump env и секретных outputs в evidence.

### A. Исходное состояние и инструменты

~~~sh
git rev-parse HEAD
git status --short -- apps/mobile package.json pnpm-lock.yaml patches .github
git ls-files apps/mobile/ios apps/mobile/android
git check-ignore apps/mobile/ios apps/mobile/android
node --version
pnpm --version
xcodebuild -version
pod --version
"$JAVA_HOME/bin/java" -version
pnpm --filter @gafus/mobile why react-native
pnpm --filter @gafus/mobile why react
pnpm --filter @gafus/mobile why expo-modules-core
pnpm --filter @gafus/mobile why hermes-compiler
pnpm --filter @gafus/mobile why react-native-worklets
~~~

PASS — SHA, версии, CNG paths и прямые peers совпадают с выбранной контрольной точкой, runtime/OTA inventory приложен.

### B. Базовая проверка monorepo и Mobile

~~~sh
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@gafus/core-client --filter=@gafus/chat-media-quality --filter=@gafus/analytics --filter=@gafus/consultation-shared
pnpm check:core-boundaries
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile lint
pnpm --filter @gafus/mobile test
node --test apps/mobile/plugins/*.test.cjs
node --test apps/mobile/scripts/*.test.mjs
~~~

Сохранить actual baseline, список воспроизводимых старых проблем и отчёт новой линии. После изменения, например, только video replay запускать соответствующие tests на `src/shared/lib/media` и feed/chat mounted tests, а не всю матрицу.

### C. Профиль и Expo Config

~~~sh
pnpm --dir apps/mobile exec expo config --type public --json > "$GAFUS_QA_DIR/expo-public.json"
pnpm --dir apps/mobile exec expo install --check
node apps/mobile/scripts/verify-native-release.mjs
~~~

Проверить, что export не содержит секретов, и не публиковать конфиг целиком. Для SDK 56 (временная линия) адаптировать release guard только если мешает фиксации отдельного QA runtime. Для SDK 57 production self-hosted профиля дополнить контракт верификации, сохранив legacy EAS ветку. Повторить C для Android/iOS и каждого signing environment. Секреты старого AppTracer подаются защищённо только для необходимой существующей проверки.

### D. Обновление только в выделенной копии

~~~sh
pnpm --dir apps/mobile exec expo install expo@56.0.24 --fix --pnpm
pnpm --dir apps/mobile exec expo install --check
pnpm --dir apps/mobile dlx expo-doctor
~~~

Сначала на SDK 56 согласовать root RN, текущие overrides, активные патчи и TS exclude, иначе pnpm попробует применить старый патч к исчезнувшей версии. Сверить новые версии §5. После PASS этапа 2 повторить с `expo@57.0.33`. Версию doctor, обновлённый lockfile и resolved package versions записать в QA; после получения lockfile повторить frozen install. Проверить прямые импорты и call sites.

~~~sh
git grep -n '@react-navigation/' -- apps/mobile/app apps/mobile/src
git grep -n -E '\.(copy|move)\(' -- apps/mobile/app apps/mobile/src
pnpm --dir apps/mobile exec expo export --platform ios --source-maps external --output-dir "$GAFUS_QA_DIR/export-ios"
pnpm --dir apps/mobile exec expo export --platform android --source-maps external --output-dir "$GAFUS_QA_DIR/export-android"
node apps/mobile/scripts/verify-ios-payment-graph.mjs
node apps/mobile/scripts/verify-ios-payment-export.mjs "$GAFUS_QA_DIR/export-ios"
~~~

PASS — нет несовместимых application imports, выпущены два Hermes exports с картами, исходный и export payment graphs проходят. Отдельно проверить device cold launch и workspace resolution. Для exported OTA использовать штатный wrapper из G.

### E. Чистая нативная генерация и локальный запуск

~~~sh
pnpm --dir apps/mobile exec expo prebuild --clean --no-install
(cd apps/mobile/ios && pod install)
(cd apps/mobile/android && ./gradlew --version && ./gradlew :app:buildEnvironment)
pnpm --filter @gafus/mobile ios:release
pnpm --filter @gafus/mobile android:release
~~~

Выполнять после проверки, что каталоги generated и находятся в выделенной копии. Сравнить outputs двух clean prebuild по нормализованному diff. Записать wrapper, effective AGP/Kotlin/NDK, Pod lock, runtime/updates plist, manifest, native modules, source/prebuilt, entitlement/capabilities и package registration. Релизный прогон требует profile/credentials QA и выбранных устройств. Для simulator/emulator использовать существующие `ios`/`android` scripts с целевым устройством. App launch build из симулятора не заменяет подписанную release.

### F. Проверка бинарников и страниц 16 KB

~~~sh
node apps/mobile/scripts/verify-android-aab-16k.mjs "$GAFUS_QA_AAB"
node apps/mobile/scripts/verify-android-aab-compressor.mjs "$GAFUS_QA_AAB"
node apps/mobile/scripts/verify-android-aab-app-links.mjs "$GAFUS_QA_AAB"
unzip -l "$GAFUS_QA_IPA"
adb shell getconf PAGE_SIZE
~~~

Дополнительно через `bundletool dump config --bundle=…` проверить alignment, ZIP alignment APK/splits через официальный `zipalign`, launch на устройстве/образе с PAGE_SIZE=16384. AAB ELF pass не заменяет эти проверки. Из IPA проверить подписанные app и widget extension через `codesign -d --entitlements :-`, Info.plist, Expo.plist, certificate digest и dSYM UUID; из установленного Android — Manifest/metadata, App Links verification и signer для каждого магазина. Для обычного Android release pipeline есть `pnpm --filter @gafus/mobile build:android:production:local`, который вызывает EAS 27.4.1 и production profile. Запускать его только на этапе авторизованной production сборки с согласованной конфигурацией. Для EAS preview использовать текущий профиль только после передачи ему изолированного self-hosted descriptor/env. В будущей реализации добавить явно названные профили `sdk57-testflight` (store distribution, Apple signing, тестовый OTA environment) и `sdk57-android-internal` (AAB и выбранный signing profile). Они создаются на этапах 1/7, сейчас отсутствуют. Из `apps/mobile` запускать `pnpm dlx eas-cli@27.4.1 build --platform ios --profile sdk57-testflight` и `pnpm dlx eas-cli@27.4.1 build --platform android --profile sdk57-android-internal` после проверки версии CLI и доступа build runner к публичному сертификату/verified descriptor. Descriptor и certificate должны быть доступны по путям внутри runner, а не только на локальном Mac. Не включать auto-submit. Загрузить в TestFlight/Android closed track точные прошедшие IPA/AAB отдельным действием. Приложенные root/submit значения-placeholder заменить управляемыми параметрами выбранного store account до загрузки. [Android 16 KB](https://developer.android.com/guide/practices/page-sizes)

### G. OTA протокол, сборка и регрессия

~~~sh
node --test apps/mobile/scripts/self-hosted-native-profile.test.cjs apps/mobile/scripts/native-source-fingerprint.test.mjs apps/mobile/scripts/self-hosted-ota-artifact.test.mjs apps/mobile/scripts/self-hosted-ota-public-env.test.mjs apps/mobile/scripts/source-recovery-preflight.test.mjs apps/mobile/scripts/ota-target.test.mjs
node apps/mobile/scripts/native-source-fingerprint.mjs "$PWD" "$GAFUS_QA_DESCRIPTOR"
pnpm --filter @gafus/api exec vitest run --config vitest.config.ts src/modules/mobile-ota/manifest-protocol.test.ts src/modules/mobile-ota/ci-registration.test.ts src/routes/v1/admin-mobile-ota.test.ts src/routes/v1/internal-mobile-ota-ci.test.ts
pnpm --filter @gafus/mobile exec vitest run --config vitest.config.ts src/shared/lib/otaPolicy.test.ts src/shared/components/RequiredOtaUpdateGate.layout.test.ts
~~~

Для preview экспорта после загрузки утверждённого descriptor, публичного certificate и public env из штатного workflow использовать существующий wrapper с аргументами `node apps/mobile/scripts/export-self-hosted-ota.mjs ios "$GAFUS_QA_REVISION" "$GAFUS_QA_DIR/ota-ios" "$GAFUS_QA_DIR/ota-config-ios.json"`, затем аналогично Android. `prepare-self-hosted-ota.mjs` работает offline и принимает флаги из preview workflow. Использовать его строго со своим output dir и preview signer. Проверить также live manifests из двух binaries, negative scopes и rollback. Реальные PG тесты запускать по разделу isolated QA [локального отчёта](../implementation/gafus-ios-ota-local-checkpoint-20261112.md#L60), с matching loopback DATABASE_URL и `GAFUS_OTA_TEST_ISOLATED=1`. Исторический EAS publisher — только для его подтверждённого runtime. Его production script при этой работе не запускать.

### H. Диагностика и символизация

~~~sh
pnpm --filter @gafus/logger build
pnpm --filter @gafus/api exec vitest run --config vitest.config.ts src/lib/operation-observability.test.ts
pnpm --filter @gafus/mobile exec vitest run --config vitest.config.ts src/shared/lib/tracer
~~~

При интеграции существующей Agent 2 ветки включить её `node --test scripts/qa/otel-local-collector.test.mjs` после проверки файла в выбранном SHA. Новые gateway/capture tests добавить в соответствующие пакеты. Для symbolication fixtures сохранить release stack, pin CLI tools и реальный bundle/debug ID. Использовать Metro symbolicate для JS, `dwarfdump --uuid`/`atos` для iOS, Retrace и `llvm-symbolizer`/`ndk-stack` для Android. Проверка Uptrace — поиск синтетического `event_id` и trace ID по read-only аккаунту, сверка timestamps, resolved frames, service/env, runtime/update ID, dedup и drop counters. Любая privacy проверка делается на синтетических canaries.

## 13. Тестовая матрица iOS/Android

**Минимум устройств.** iOS simulator на минимальном доступном target и актуальном SDK, физический iPhone на iOS 16.4–16.x и iOS 17+ / актуальной iOS, iPhone на iOS 15.x с установленным SDK 55. Android emulator API 24/30/31/36 и образ arm64 16 KB, физические устройства с GMS и без GMS для RuStore, по возможности физический Android с 16 KB. Если одна из границ недоступна, отметить конкретную дыру и предусмотреть доступный физический/device farm тест до релиза. StoreKit, APNs, AppIntent, background GPS, release crash/symbolication и vendor push имеют обязательные проверки на физическом устройстве.

Для каждого сценария хранить исходный SHA, binary build/manifest/digest, ОС и device family, expected/actual, время, QA account class и (для диагностики) event/trace IDs. Все записи и платёжные сценарии на синтетике и sandbox.

### Автоматические проверки

| ID | Действия | PASS / FAIL |
| --- | --- | --- |
| A01 | B на baseline и release candidate. Проверить TypeScript, lint, все Vitest и Node scripts. | PASS при exit 0 и полном перечислении suite. Различия baseline документированы. FAIL при новом skip или nonzero. |
| A02 | Frozen clean install; повторить Metro exports, inspect dependencies and Expo Doctor. | PASS при одном JS React/RN, двух production exports, отсутствии server-only modules в mobile и соответствующих pins. FAIL при mixed native ABI, unresolved peers и новом обходе doctor без объяснения. |
| A03 | Прогнать plugin fixtures с SDK 55/56/57 source templates, malformed anchor и повтором, затем два чистых prebuild. | PASS при deterministic normalized outputs, одном package registration и правильных extension/manifest/pod targets. FAIL при silent noop, duplicate hook или ручной правке generated dirs. |
| A04 | Проверить API, Core boundaries, workspace exports и существующие integration suites для purchases/media/offline/walk, PG OTA по G. | PASS при отсутствии новых failures, additive DB migrations и прежнем API response shape для SDK 55. FAIL при scope leakage, duplicate writes или нарушении runtime guards. |
| A05 | Две независимые release сборки того же SHA с pinned toolchain; записать normalized graph и release metadata. | PASS при эквивалентном native graph и воспроизводимых бандлах/manifest input; build signing timestamps/UUID описаны. FAIL при неизвестном отличии graph, символов или settings. |
| A06 | Replay identical telemetry batch, malformed payload, 429, partial upstream reject, collector outage; injected sensitive canaries. | PASS при durable ACK/dedup, bounded retry, controlled drops, отсутствии PII, fail-open для продуктового API. FAIL при потере после ack, flood или export canary. |
| A07 | Выдать manifests wrong runtime/platform/channel/key/fingerprint, неверный hash, stale source и SHA. | PASS при отказе выдачи/установки без изменившихся binaries. FAIL при любом cross-scope delivery. |

### Нативная функциональность

| ID | Действия | PASS / FAIL |
| --- | --- | --- |
| G01 | Cold/warm start по 5 раз на physical/sim/emulator, fresh install и in-place upgrade SDK 55→57, offline startup и fault шрифта/инициализации. | PASS — доступный экран, корректный splash/fallback, сохранённая разрешённая сессия, без дублированного startup overlay. FAIL — зависание, native crash, потеря аккаунта/состояния. |
| G02 | Войти через password и VK; refresh при просроченном токене, logout/account switch, protected routes. Открыть link из browser/push cold и warm. | PASS — корректная route/intent/AASA, без обхода ACL, refresh и SecureStore работают. FAIL — неправильный аккаунт, открытие чужих данных, broken callback. |
| G03 | Пройти 15 минут с lock, background/foreground, pause/resume/finish на обеих ОС. Отдельно system kill/relaunch и force stop/manual launch, отказ/отзыв разрешения и повтор sync после offline. | PASS — точки во время поддерживаемого фонового режима, корректные сегменты, нет поздних точек после pause/finish, один route на сервере, завершение без location при отказе согласно UI. FAIL — потеря активной сессии или выдуманная линия через gap. |
| G04 | Установить widgets, start/pause/finish из них в foreground/background, быстрые taps, смена аккаунта, app restart, resize. | PASS — таймер/шаги совпадают в UI/widget, команды выполняются один раз для правильного владельца, extension/receiver доступны. FAIL — дубли или пересечение аккаунтов. |
| G05 | В Моментах, Chat2 и тренировке проиграть MP4/HLS fixtures 720/360, переключить качество на отметке 20 с, досмотреть, replay, открыть второе видео, background/foreground и прерывание звука. | PASS — заявленные варианты доступны, позиция соответствует политике, replay работает, один активный плеер, нет утечки audio session; 360 failure корректно fallback. FAIL — зависание, silent stream, одновременные плееры. |
| G06 | Загрузить VFR/60 FPS, portrait/rotation, маленькое и крупное видео; ffprobe и app probe; проверить WebP фото, EXIF/GPS, 480px постер, boundary sizes, cancel, offline/retry после PUT. | PASS — продуктовый contract, валидные MP4/WebP, без upscale и metadata leak, правильное превышение limits, один attachment на повтор. FAIL — зелёный JS mock при плохом output или скрытая потеря файла. |
| G07 | В TestFlight/sandbox купить и восстановить подписку на чистой установке; cancel, pending, duplicate callback, смена аккаунта. Установить новый iOS OTA и проверить граф/доступность старой отмены. | PASS — один validated entitlement, restore правильному owner и Apple-only checkout. FAIL — external new checkout, повторный entitlement или signed transaction для чужого principal. |
| G08 | В Android тестовой сборке каждого канала проверить YooKassa, возврат, отмену, duplicate callback и refresh. | PASS — правильное состояние и разрешённый для канала checkout. FAIL — false success или неопределённый compliance flow. |
| G09 | Push на iPhone, GMS и RuStore device. Разрешить/запретить, войти/выйти, обновить токен, нажать из background/cold. | PASS — one delivery, верный route/owner, logout unregister, no crash при deny. FAIL — пропуск поддерживаемого transport или уведомление прежнему аккаунту. |
| G10 | Chat2 текст, фото/WebP, видео, attachment limits, soft keyboard, swipe/back, reconnect, повтор send, отказ ACL; Voximplant calls если доступны профилю. | PASS — один message, правильная раскладка, файлы по ACL, mic/audio route корректны. FAIL — дубли, private leak или блокировка ввода. |
| G11 | Открыть свободный/платный/назначенный курс, загрузить, оборвать сеть, возобновить, использовать offline, затем sync, logout. | PASS — читаются совместимые локальные данные, правильные entitlements, completion синхронизируется один раз. FAIL — потеря downloaded data или обход access rules. |
| G12 | Камера, фото, mic, location, activity, push: grant/deny/revoke; ad consent и rewarded показ/отказ. | PASS — recoverable UI, заявленные permissions/usage strings, один reward. FAIL — лишнее разрешение, сломанный startup или неправильный reward. |

### OTA на подписанных устройствах

| ID | Действия | PASS / FAIL |
| --- | --- | --- |
| O01 | SDK 55 с реально историческим runtime и SDK 57 preview одновременно проверяют update. Подать SDK 57 candidate в новый registry scope. | PASS — SDK 57 получает только свой manifest, SDK 55 видит свой EAS path и update. FAIL — любой cross-scope asset или wrong-runtime offer. |
| O02 | Preview iOS/Android: проверить актуальные headers, скачать signed update, reload, проверить update UUID. | PASS — exact platform/runtime/key/fingerprint, manifest/assets digest, правильная revision и UUID в клиенте и логах. FAIL — не тот ID или непроверенная подпись. |
| O03 | Повторить с неправильной подписью, подменённым asset, отключённым CDN и прерыванием download. | PASS — embedded/previous launch, рабочий UI, recoverable retry. FAIL — неверная подпись применяется или пользователь застрял. |
| O04 | Подать пустой/paused deployment, проверить negotiation на клиенте и восстановление после offline. | PASS — прежний cached/embedded launch, no-update согласно протоколу, никаких циклов блокировки. FAIL — bad manifest recovery или бесконечный экран обновления. |
| O05 | Rollout 1/10/50% на тестовых installation IDs, cold start и ручной check, без ID, затем несколько повторов. | PASS — стабильная вложенная когорта, отсутствие ID получает определённый безопасный ответ, header не попадает в Uptrace. FAIL — cohort drift, отсутствие header на ON_LOAD с включённым rollout или завышенный охват. |
| O06 | Сломать тестовый OTA до первого render и отдельно после render, затем PAUSE и forward rollback. | PASS — штатная recovery где применима, явная установка нового signed rollback UUID у уже затронутого клиента, совместимость local schema. FAIL — cached bad update остаётся единственным запускаемым без проверенного пути восстановления. |
| O07 | Изменить native input или сертификат в тестовом источнике, затем попытаться export к прежней attestation. | PASS — fingerprint/cert gate до stage/promotion. FAIL — новый native graph попал в старый runtime. |
| O08 | Проверить required gates с legacy/runtime 57, отсутствующим обновлением, iOS 15.x, offline, phased store release. | PASS — рабочий fallback, доступный для устройства store link, отсутствие принуждения в неподходящей когорте. FAIL — блокировка пользователя, которому релиз недоступен. |

### Диагностика

| ID | Действия | PASS / FAIL |
| --- | --- | --- |
| D01 | Сгенерировать обработанную JS ошибку известной строки и unhandled JS fatal в release-like iOS/Android. | PASS — отдельные expected severities, update/build correct и символизированная строка. Fatal доставляется после повторного запуска без потери стандартного поведения RN. |
| D02 | Бросить ошибку внутри тестового React-компонента, проверить fallback и reset. | PASS — один log с component stack, fallback работает и не создаёт два отчёта. |
| D03 | Unhandled Promise reject и отдельно поздний обработчик. | PASS — настоящий unhandled фиксируется один раз с release/stack; handled классифицируется по выбранной политике и не создаёт ложного fatal. |
| D04 | На физическом iPhone вызвать отдельные QA native crash cases (Mach/signal и uncaught на iOS 17+), включить offline, перезапустить и вернуть сеть. | PASS — один native event на случай, реальный UUID/кадр своей функции в Uptrace и заявленная задержка. Недоступные OS cases явно зафиксированы. FAIL — только факт краша без требуемого кадра. |
| D05 | На Android вызвать Java/Kotlin exception с cause chain и отдельный NDK crash в QA-only build; повторить на API 30/31/36. | PASS — JVM source frame/causes, ≥31 tombstone/ELF matching и расшифрованный кадр, API 30 известная fallback категория. FAIL — только OS reason там, где ожидается доступный stack. |
| D06 | Повторить D01 после signed self-hosted OTA, ещё раз после rollback, проверить ошибку старого update при последующей отправке новым. | PASS — stack и карта соответствуют capture-time UUID каждой версии. FAIL — атрибуция по текущему update или build на момент upload. |
| D07 | В isolated Android вызвать ANR и low-memory test где поддержано, на iOS проверить MetricKit hang/exit aggregation. | PASS — заявленный OS diagnostic/aggregate с quality flag и без ложного crash; факт отсутствия trace при unsupported API записан. FAIL — ложный символизированный stack или неожиданная потеря заявленного события. |
| D08 | Подать нечитаемый video fixture и сбой GPS task/SQLite в QA. | PASS — bounded error код и диагностический стек, без URL, координат или содержимого вложения, пользователь может восстановиться. |
| D09 | Сделать контролируемый 5xx на Hono и fail/retry worker в staging. | PASS — две коррелируемые записи, server-side error context и trace/span links, retry не порождает бесконечный шум. |
| D10 | Из Mobile инициировать Chat2/тестовую операцию с Worker, повторить с Web. | PASS — shared W3C traceId для client/API/producer/consumer, корректные span IDs и operation ID, callback link при новом trace, отсутствие trace headers на сторонних origins. |
| D11 | Отключить сеть, набрать пачку, перезапустить, восстановить сеть; принудить 429/503 и loss of ACK. | PASS — очередь survives, Retry-After/backoff, одна durable запись на event ID, product startup не блокируется. |
| D12 | В отдельном Observe build записать first launch, JS/native capture/restart и offline flush до/после перенастройки endpoint. | PASS — OTLP metrics/logs, полезный ожидаемый набор полей и только разрешённый destination. FAIL — утечка на Expo Cloud, невозможность исключить конфликт hook или PII. |
| D13 | Подать релизную диагностику с отсутствующей картой/несовпадающим dSYM/ELF. | PASS — честный partial/missing с raw offsets и ограниченный retry, никакого чужого файла/строки. |
| D14 | Прогнать запретные синтетические PII, жёсткий budget cap и sampled-out error на обеих платформах. | PASS — canary отсутствует в network/persistent logs, error принят под отдельным cap, dropped counters растут под flood. FAIL — leakage или уничтожение fatal обычным sampling. |
| D15 | Открыть Uptrace read-only поиск по полученным event IDs, build/runtime/channel, JS/native и trace IDs; проверить Web/API/Worker signals, изолированный путь или production smoke по назначению. | PASS — каждое заявленное событие и нужные поля видны в целевом проекте, лимиты и receipt зафиксированы. FAIL — подтверждение есть только в локальных логах или других dashboards. |

## 14. Риски и блокирующие проблемы

| Уровень | Риск | Условие снятия / владелец |
| --- | --- | --- |
| Блокирующий | Mac Xcode 26.3 и текущий Node 20.20.2 не достигают целевого toolchain. | Воспроизводимый iOS/Android release на закреплённых Xcode ≥26.4 и Node 22 ≥22.13. Release/CI owner. |
| Блокирующий | Один marketing version у несовместимых native builds, ошибочный EAS/registry scope, неподтверждённый signed self-hosted release. | Уникальный runtime при изменении native graph, verified native inventory, PASS O01–O08, staging deployment/permissions/CDN. OTA owner. |
| Блокирующий | iOS 15.1–16.3 не может перейти на SDK 57, глобальный minVersion может заблокировать. | Подтверждённая политика legacy, реальный SDK 55 клиент на старой iOS и рабочая backward-compatible API. Product/API owner. |
| Блокирующий | iOS App Store review/payment boundary, StoreKit restore и account binding. | Apple-only source/export/binary graphs, sandbox purchase/restore, review readiness и отсутствие новых внешних оплат в iOS. Payments owner. |
| Блокирующий | Рабочие нативные crash reports с полезным стеком не доказаны в Uptrace. | D04/D05, сохранённые карты и символы с matching IDs, известные ограничения API/OS. Observability owner. |
| Блокирующий | 16 KB, release-only ABI/link или vendor .so не запускается. | AAB ELF, ZIP and runtime 16 KB, store-signed App Links и feature smoke. Android owner. |
| Высокий | Обновление Expo Core/Widgets/Location/Reanimated может обходить patched source или ломать CNG hooks. | A03, physical G03/G04, проверенный native link graph и per-ABI evidence. Native owner. |
| Высокий | Глобальный fetch, async FileSystem и новые Router imports меняют media/auth/offline. | G02/G05/G06/G10/G11 и targeted network tests. Mobile owner. |
| Высокий | Приватность, потеря карты, конфликт native handlers, переполнение free quota и потеря trace correlation. | D06, D10–D15, отдельные лимиты и rollback switch. Observability/Privacy owners. |
| Высокий | Старые Android API и vendor-specific фоновые ограничения. | Device evidence на API 24/30/31/36, принятый fallback NDK, G03/G09 на no-GMS. Mobile QA. |
| Средний | Metro path changes, TS 6, локальные cng fixtures, устаревшие EAS профили. | Targeted JS/TS checks, pin TS 5.9.3, отдельный upgrade TS после основной миграции, reproducible toolchain. CI owner. |
| Низкий | Startup metrics Observe полезны частично, меняются cosmetic defaults Router/Android. | Решение по опциональному Observe с экспериментом, UI smoke и подтверждение minimum Android flows. |

Статус в текущем аудите — исходники прочитаны, release gates требуют испытаний. Широкие peer ranges, опубликованный SDK и существование локального generated project не заменяют эти условия.

## 15. План релиза

1. **Пререлиз.** Подготовить неизменяемые source SHA, lock, два production-candidate binaries, signing attestations, privacy manifests, верификацию платежей и private symbols. SDK 55 binaries, channels, backend routes и maps остаются доступны. Зафиксировать кто управляет магазином, OTA и Uptrace ingress. Поднять совместимый API и новый paused self-hosted deployment до обновления клиентов, без изменения legacy routing.
2. **Закрытые каналы.** TestFlight internal, затем external при необходимости. Android — Play internal, RuStore closed test, подписанная сборка, которую получит устройство. На физическом устройстве сверить старую установку и обновление из магазина, покупки/push/links, первый запуск embedded, получение preview OTA и rollback. Уточнить возможность pre-release проверки production-scope бинарника с пустым manifest и теми же signing/cert settings. [RuStore closed test](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/testing/alpha-testing)
3. **Проверки магазинов.** На дату аудита Apple требует iOS 26 SDK или новее для загрузки, Expo требует Xcode ≥26.4, Google Play для новых обновлений требует target API 36 и применимые проверки 16 KB. Перед отправкой сверить реально действующие требования консолей и существующий bundle/signature для каждого магазина. Подтвердить StoreKit review, 16 KB, privacy labels, App Links/AASA, тестовый аккаунт и capabilities. [Apple](https://developer.apple.com/news/upcoming-requirements/) · [Play target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-mt) · [Android 16 KB](https://developer.android.com/guide/practices/page-sizes)
4. **Store rollout.** В App Store использовать phased release для автоматических обновлений. Apple увеличивает долю 1/2/5/10/20/50/100%, ручная установка может быть доступна сразу. Play staged rollout — начать с 5%, затем 10/25/50/100% при PASS. RuStore — доступные 5/10/25/50/75/100% и stop при сбое. Перед стартом записать точный approved build каждого трека. Не включать обязательный OTA на фазовом выпуске. [Apple phased](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/) · [Play staged](https://support.google.com/googleplay/android-developer/answer/6346149) · [RuStore staged](https://www.rustore.ru/help/en/developers/publishing-and-verifying-apps/app-publication/setting-up-publication/step-by-step-publication)
5. **Собственный OTA.** После устойчивого embedded baseline выпустить первый JS-only signed update в точном production scope. Сначала небольшая доказанно стабильная когорта, затем 10/25/50/100% при receipts. При недоказанном `expo-extra-params` на ON_LOAD использовать только закрытую preview среду и держать production OTA paused до подтверждения механизма. Не заменять предсказуемую cohort selection выбором по IP или user ID.
6. **Порог продвижения.** Начальный критерий для каждого шага: минимум 24 часа и 100 запусков на платформу либо явное решение владельца при низком трафике с фактическими counts. Сравнить с SDK 55 baseline на сопоставимых OS/device cohorts. Любая подтверждённая регрессия payments/ACL/GPS durability, PII, wrong OTA scope или повторяемый startup crash — halt. Для прочих предложенные пороги: падение crash-free sessions ≥0.5 п.п., рост startup p95 ≥20%, новый unhandled JS/native crash group с ≥3 воспроизведениями или устойчивая ошибка 5xx при download — остановка до анализа. Уточнить thresholds после baseline и подтвердить receipt alert в staging.
7. **После выпуска.** Следить за crash-free sessions, startup, IAP restore, GPS sync, push/permissions, media quality и upload, OTA fetch/launch/rollback, rates Uptrace и API/Worker error/latency. Сверить отчёты через 24 часа, 72 часа и 7 дней после завершения rollout. Отдельно наблюдать SDK 55 и старые ОС. Политику повышения minVersion принимать после доступности всех нужных stores/устройств и отдельной приёмки.

## 16. План отката

| Случай | Действия | Подтверждение восстановления |
| --- | --- | --- |
| SDK 57 JS OTA fault | PAUSE целевой deployment с expected rowVersion и reason. При необходимости снять required OTA. Определить, совместим ли прошлый JS с текущим хранилищем и backend. Подписать новый update с known-good JS либо forward fix, новой revision/UUID/timestamp и нужной картой. Проверить на affected devices, затем активировать в том же scope. | Новый rollback UUID запущен, critical flows и symbolication проходят. SDK 55 получает только свой EAS scope. |
| EAS SDK 55 OTA fault | Использовать подтверждённый legacy channel/branch/runtime и историю releases. Откат EAS через republish/embedded механизм после QA и проверки локальной схемы. | Installed SDK 55 получает восстановление, SDK 57 registry не изменён. [EAS rollback](https://docs.expo.dev/eas-update/rollbacks/) |
| Вшитый native crash, entitlement, 16 KB | Поставить App Store phased release на pause, Play — halt, RuStore — stop. Выпустить исправленный binary с новым build number/versionCode, а при несовместимом native графе — новой marketing/runtime версией. Для уже обновившихся предусмотреть временный server-side mitigation, если он безопасен. | Падение уходит на физическом устройстве после установки новой версии. Уже установленные binaries не понижаются автоматически. |
| OTA endpoint/CDN outage | Остановить выдачу проблемного deployment, сохранить ранее опубликованные immutable assets, проверить fallback. Восстановить прежнюю origin конфигурацию и доступность CDN. | Fresh/offline/cached launch проходят, затем signed manifest/assets читаются без 4xx/5xx. |
| Диагностика или приватность | Закрыть проблемный ingress/profile, понизить sampling/квоты, отдельно отключить Observe route. При подтверждённой утечке действовать по incident process, изолировать spool, ротировать затронутые серверные ключи и удалить доступные sensitive records по правилам хранения. | Продуктовые API продолжают работать, утечка остановлена, новый binary или отозванный маршрут проверен. |
| Серверный контракт | Отключить новые write/promote paths и вернуть совместимую версию API/Worker. Сохранить additive DB tables и старые decoder contracts до завершения rollback. | SDK 55 и 57 проходят авторизацию/курсы/оплату, нет потерянных outbox jobs, signed read path контролируем. |

## 17. Критерии приёмки

- Два воспроизводимых release binaries из согласованного SHA. Известны runtime, toolchain, native fingerprint, signing и source-map/dSYM/ELF IDs. Нет новых typecheck/lint/unit/integration failures. Финальный release прогон закрывает A01–A07 и G01–G12.
- Physical iOS и Android подтверждают GPS lock/background/recovery, widgets, видео 360/720 и replay, transcoding/WebP/постер, оплату/restore, push, Chat2, links/auth, courses/offline, splash и permissions.
- Старые SDK 55 binaries реально проверены рядом с SDK 57. Signed self-hosted OTA и rollback проходят O01–O08. Отказ CDN/подписи, no-update и несовместимый scope не приводят к блокировке. SDK 55 на старых iOS обслуживается.
- Uptrace read-only receipt подтверждает JS fatal/handled/React/rejection, iOS native и Android Java/Kotlin/NDK на поддерживаемых API, реальные symbolized frames и capture-time attribution. Ограничения delayed/unsupported OS учтены и приняты. D01–D15 проходят в заявленных профилях.
- Проверена единая корреляция Web/Mobile → API → Worker. Error сохраняется при sampling ordinary spans. PII/секреты отсутствуют в сетевом трафике, публичных bundle/config и хранилище. Лимиты, алерты, dedup и graceful failure доказаны.
- Указаны ответственные за rollout/rollback, TestFlight/Android closed tests, store policy, доступные сертификаты и recovery artifacts. Store submission и production activation выполняются после этого gate.

## 18. Что требует эксперимента или решения владельца

| Неопределённость | Как закрыть | Что блокирует |
| --- | --- | --- |
| Фактические installed версии/каналы и размер iOS 15.1–16.3 | Извлечь signed binaries/EAS metadata, получить распределение supported OS, проверить установленный SDK 55 клиент и minVersion. | Store rollout и подъем minVersion. |
| Effective Android catalog и vendor ABI, prebuilt обход patches | Чистый prebuild, Gradle resolution, AAB symbols/build IDs, physical 16 KB и repeated clean CI. | Android выпуск. |
| Новый iOS minimum/scene lifecycle и StoreKit review | Проверить устройство 16.4, новое iOS, sandbox/TestFlight, archive entitlements/privacy. Xcode 27 сценарии при реальной необходимости. | iOS выпуск. |
| Требуемая полнота NDK на API 24–30 | Проверить минимальные ОС и технический fallback, определить долю пользователей и решение о поддержке полного minidump. Если требуется, квалифицировать collector до release. | Решение о принятии известных platform limitations. |
| MetricKit задержка, сырые UUID/offsets, iOS coverage | Три последовательных crash/restart цикла на устройстве, включая offline и смену OTA. При неполноте — PLCrashReporter gate. | Нативная диагностика iOS. |
| Rejection hook и ранний JS fatal | QA-only known stack, release Hermes, late catch и предыдущий RN handler. | JS diagnostics. |
| Observe endpoint, partial retry, privacy, stack content | Снять трафик и decoded wire fixtures, подтвердить SDK 57 API в конкретном lockfile, сравнить с собственным capture. | Только включение Observe. |
| Self-hosted preview GitHub/Beget, attestation и реальная OTA когорта | Проверить live preview, actual `expo-extra-params` на ON_LOAD, pause/recovery и server logs. | Self-hosted production activation. |
| Uptrace production quota/ретеншн, доступный OTLP logs/metrics и server E2E | Разрешённый синтетический OTLP/read-only smoke, baseline объёмов, test retries/partial success и alerts. | Выпуск новой диагностики. |
| Реальные лимиты медиа и аудио ассеты в release | Сверить fixtures и effective surface contracts, проиграть MP4/Voximplant и любой отдельный audio asset из каталога. | Media acceptance. |

## 19. Официальные источники

- Expo [SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57), [матрица SDK 57](https://docs.expo.dev/versions/v57.0.0/), [порядок обновления](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [образы EAS](https://docs.expo.dev/build-reference/infrastructure/).
- Опубликованные матрицы Expo [55.0.32](https://unpkg.com/expo@55.0.32/bundledNativeModules.json), [56.0.24](https://unpkg.com/expo@56.0.24/bundledNativeModules.json), [57.0.33](https://unpkg.com/expo@57.0.33/bundledNativeModules.json). [Bare template 56.0.38](https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-56.0.38.tgz) и [bare template 57.0.35](https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-57.0.35.tgz).
- Expo [Router 55→56](https://docs.expo.dev/router/migrate/sdk-55-to-56/), [Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Widgets SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/), [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/).
- Expo Observe [настройка](https://docs.expo.dev/eas/observe/get-started/), [ошибки и символизация](https://docs.expo.dev/eas/observe/errors/), [custom endpoint/sampling](https://docs.expo.dev/eas/observe/configuration/), [SDK 57 API](https://docs.expo.dev/versions/v57.0.0/sdk/observe/), [исходники Expo Observe SDK 57](https://github.com/expo/expo/tree/sdk-57/packages/expo-observe).
- Expo Updates [протокол v1](https://docs.expo.dev/technical-specs/expo-updates-1/), [runtime](https://docs.expo.dev/eas-update/runtime-versions/), [подпись](https://docs.expo.dev/eas-update/code-signing/), [recovery](https://docs.expo.dev/eas-update/error-recovery/), [rollback](https://docs.expo.dev/eas-update/rollbacks/).
- React Native [каталог Android](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/gradle/libs.versions.toml), [release JS symbolication](https://reactnative.dev/docs/debugging-release-builds), [Hermes v1](https://reactnative.dev/blog/2026/02/11/react-native-0.84).
- Uptrace [OTLP ingest](https://uptrace.dev/ingest), [Collector](https://uptrace.dev/opentelemetry/collector), [pricing](https://uptrace.dev/pricing). OpenTelemetry [Context](https://opentelemetry.io/docs/specs/otel/context/), [OTLP](https://opentelemetry.io/docs/specs/otlp/), [W3C Trace Context](https://www.w3.org/TR/trace-context/).
- Apple [MetricKit](https://developer.apple.com/documentation/metrickit), [dSYM и UUID](https://developer.apple.com/documentation/xcode/locating-a-missing-debug-symbol-file), [App Review](https://developer.apple.com/app-store/review/guidelines/), [upload requirements](https://developer.apple.com/news/upcoming-requirements/).
- Android [ApplicationExitInfo](https://developer.android.com/reference/android/app/ApplicationExitInfo), [ANR](https://developer.android.com/topic/performance/issues/anr), [native debug symbols](https://developer.android.com/build/include-native-symbols), [16 KB](https://developer.android.com/guide/practices/page-sizes), [Play target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-mt).
