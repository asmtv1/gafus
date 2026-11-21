> **Финальный статус проверки 21.11.2026: NOT READY для Google Play/production.** R8 Release **PASS**, AAB+APK **PASS**, DEX уменьшен на **70,45%** локально, AAB/ APK имеют идентичные три DEX. **Samsung functional QA BLOCKED**: установленный `versionCode=17602`, EAS выдал `17601`; не выполнялись downgrade, uninstall и потеря данных. Официальные показатели Play Console и реальный OTA/Billing на новом APK отсутствуют. Исторические BLOCKED в нижних разделах описывают предыдущие этапы, актуальные результаты — в дополнениях ниже.

# GAFUS Android 1.7.6 — независимый QA-аудит R8 / DEX

Дата: 2026-11-21. Проверенный HEAD: `28e3f9bf7c08cb348baed4aab221e7b5cbd9b5d9`.

## Вердикт

**NOT READY / BLOCKED** — публикация не подтверждена. Новый AAB с выполненным R8 не собран, Samsung не виден в ADB, Play Console не проверена. Показатели оптимизации, обфускации и сокращения не измерены. Нельзя переносить подтверждения первого агента на этот аудит. Рабочая копия содержит многочисленные незакоммиченные изменения, и SHA HEAD не является SHA однозначного состояния кандидата.

## Среда и ограничения

- `git status --short`: много modified/untracked файлов, включая `app.json`, новый Expo-плагин R8, скрипты R8, изменения GPS/Chat 2.0/виджета. Точное изменение первого агента нельзя отделить от параллельных правок только по HEAD.
- ADB `adb devices -l`: пустой список устройств (**BLOCKED** для Samsung Galaxy A53).
- Диск Mac: на начале около 3 GiB, после проверок около 2 GiB свободно (99% занято). Полную EAS/Gradle Release-сборку запускать небезопасно: высок риск ENOSPC и повреждения промежуточных артефактов (**BLOCKED**). Файлы чужих сборок/кэши не удалялись.
- Найден `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (293 MiB, создан ранее). Его происхождение, подпись и R8-оптимизация не подтверждены. Новый AAB отсутствует в проверенном `apps/mobile/android/app/build/outputs`. Найден исторический `apps/mobile/gafus-1.7.6-17601-google-play.aab` (202 701 471 байт); его DEX измерен отдельно, но соответствие именно опубликованному Play Console AAB без SHA-256 из Console не подтверждено.
- Chrome Playwright: запрос списка вкладок завершился внутренней ошибкой инструмента (**BLOCKED** для проверки Play Console). Загрузка не выполнялась.

## Исходники и конфигурация

| Проверка | Статус | Результат |
|---|---|---|
| Отчёт агента №1 | PASS | `docs/audit/android-r8-refactoring-20261121.md` прочитан, его выводы не приняты за доказательство сборки |
| Diff / рабочее дерево | PASS | Изменения перечислены; дерево не чистое, нет изолированного SHA кандидата |
| Expo Android release flags | PASS | В `app.json`: `enableMinifyInReleaseBuilds=true`, `enableShrinkResourcesInReleaseBuilds=true`; зарегистрирован `withAndroidReleaseOptimization` |
| Android R8 Expo-плагин | PASS | Прочитан: заменяет `proguard-android.txt` на `proguard-android-optimize.txt`, включает `android.r8.optimizedResourceShrinking`, удаляет три дублирующие строки правила |
| Сгенерированный нативный Gradle соответствует новому Expo-плагину | BLOCKED | Текущий `apps/mobile/android/app/build.gradle` всё ещё содержит `proguard-android.txt` и по умолчанию minify=false; нужен чистый prebuild без изменения живой копии |
| Нет глобального `-dontoptimize`/`-dontshrink`/`-dontobfuscate` в итоговых merged rules | BLOCKED | Итоговый `configuration.txt` не получен; статический код плагина не равен фактически применённой сборке |
| Обоснованность всех consumer `-keep`/`-dontwarn` | BLOCKED | Нужна проверка фактически слитых правил R8 после сборки |
| Сохранность модулей, зависимости Android, изменения iOS и оплаты | BLOCKED | По одному diff + отчёту нельзя подтвердить функциональную сохранность; заявленные первым агентом выводы остаются гипотезами |
| OTA runtime | PASS (конфигурация) | `app.json` содержит `runtimeVersion` с политикой `appVersion`, версия приложения `1.7.6`; совместимость конкретного билда не проверена |
| VersionCode | PASS (конфигурация) | `app.json`: `17602`; значение в AAB и конфликт Play Console не проверены |

## Запущенные проверки

Логи: `/tmp/gafus-r8-qa-20261121/*.log`. Все команды исполнялись на Mac через McpGo-Terminal1.

| Проверка | Статус | Наблюдение |
|---|---|---|
| `pnpm --filter @gafus/mobile typecheck` | **FAIL** | exit 2; TS2352, `apps/mobile/src/features/chat2/Chat2ListScreen.swipes.mounted.test.tsx:171`, ошибочный каст частичного объекта в `Conversation` |
| `pnpm --filter @gafus/mobile lint` | **PASS** | exit 0, 0 ошибок, **942 предупреждения** |
| `pnpm check:core-boundaries` | **PASS** | exit 0, 33 теста прошли |
| `pnpm install --lockfile-only --offline --frozen-lockfile` | **PASS** | exit 0, 68 workspace проектов; проверка lockfile, без полной переустановки |
| `node --test apps/mobile/scripts/android-aab-compressor.test.mjs apps/mobile/scripts/verify-android-media-permissions.test.mjs` | **PASS** | exit 0, 5 тестов прошли |
| Остальные mobile unit/integration tests | NOT RUN | Не запускались |
| Expo clean prebuild / Gradle configuration check на кандидате | BLOCKED | Недостаточно свободного места, существующий native-проект не соответствует новому плагину |
| Release R8 / AAB / mapping.txt | BLOCKED | Реальная сборка не запускалась из-за места |
| Проверка подписи, manifest, package name, versionCode в AAB | BLOCKED | Новый AAB отсутствует |
| Billing / ЮKassa проверки на AAB | BLOCKED | Новый AAB отсутствует |

## DEX / AAB

| Метрика | До | После |
|---|---|---|
| Несжатый DEX | **84 658 036 байт**, локально измерено из AAB `17601` | **BLOCKED** |
| Обфускация Play Console | 8% (дано в задании, не перепроверено) | **BLOCKED** |
| Оптимизация Play Console | неизвестно | **BLOCKED** |
| Сокращение Play Console | неизвестно | **BLOCKED** |
| AAB размер | **202 701 471 байт** (`17601`) | **BLOCKED** |
| Количество DEX-классов | **76 128 class_defs** (сумма по 10 DEX) | **BLOCKED** |
| Количество DEX-методов | **527 345 method_ids** (сумма по 10 DEX; не число уникальных реализаций методов) | **BLOCKED** |

В исходном AAB `17601` 10 DEX-файлов, ZIP-сжатый DEX — 30 693 728 байт, встроенный `proguard.map` отсутствует. Измерения выполнены из ZIP и заголовков DEX, без исполнения кода. Никакие локальные оценки не выданы за официальные проценты Google Play. Пороговые 25%/25%/25% **не подтверждены**.

## Samsung — функциональная матрица

Все перечисленные ниже сценарии **BLOCKED: Samsung отсутствует в выводе ADB, проверенный релиз не собран**.

- Холодный/повторный запуск, авторизация, восстановление сессии, навигация, профиль, курсы, дни, шаги, мини-гайды.
- Chat 2.0: сообщения, изображения и видео; Moments: публикации, реакции, видео.
- GPS: прогулка, маршрут, шагомер, Foreground Service, уведомление, уход в фон, блокировка/разблокировка экрана, возобновление приложения.
- Google Play Billing: каталог, статус подписки, безопасное восстановление покупок; отсутствие checkout ЮKassa, управление существующей подпиской.
- Logcat: Java/Kotlin, RN, Hermes, JSI/JNI, missing class/method, serialization, ANR, crash. Логи устройства не собирались.

## OTA

**BLOCKED:** получение манифеста, скачивание, применение, рестарт, отсутствие обновления, ошибки загрузки, совместимость реального fingerprint и ограничение получателей `admin`/`asmtv1`. Массовая публикация OTA не производилась; возврат ЮKassa не включался.

## Google Play Console

**BLOCKED:** Chrome Playwright не вернул список вкладок; подписанный оптимизированный AAB не готов. Во внутренний тестовый трек не загружали; production не затрагивали. VersionCode `17602` не проверен на конфликт. Официальных показателей R8/DEX нет.

## Дефекты и задания агенту №1

1. **P1 — TypeScript, воспроизводимо.** `Chat2ListScreen.swipes.mounted.test.tsx:171`: неполный mock объекта `Conversation` приводит к TS2352. Исправить корректным полным тестовым fixture (не подавлять TS и не менять производственный код без необходимости); повторить typecheck.
2. **P1 — сборочная воспроизводимость.** Новый оптимизационный Expo-плагин не отражён в существующем нативном `android/app/build.gradle`; подготовить отдельный чистый snapshot/prebuild, сохранить merged R8 config и signing checks. Это не доказанный дефект плагина; пока диагностический блокер.
3. **P1 — атрибуция кандидата.** Зафиксировать чистый commit/snapshot и SHA-256 артефакта, поскольку одновременно присутствуют незакоммиченные изменения нескольких функциональных подсистем. Не подменять HEAD идентичностью незафиксированного AAB.

## Условия снятия блокировки публикации

Освободить место безопасно и без удаления чужих артефактов; подключить Samsung и подтвердить `adb devices`; зафиксировать исходники кандидата; выполнить чистый EAS production-equivalent Release с R8 и правильной подписью; сохранить AAB, mapping, отчёты, размер DEX и контрольный APK; выполнить реальные device/OTA/Billing тесты и Logcat; затем только internal Google Play, получить официальные проценты. До этого **не выпускать в production**.


## Дополнение: повторная проверка после исправления TypeScript (21.11.2026)

Пользователь освободил место и подключил Samsung. Проверено повторно через McpGo-Terminal1:

- **PASS** — `adb devices -l`: `RZCT80F6J8P device`, Samsung `SM_A536E`.
- **PASS** — `df -h`: после восстановления зависимостей свободно около **48 GiB**. Прежние блокировки по ADB и диску сняты; это само по себе не подтверждает готовность Release.
- **PASS** — исправлен только тестовый fixture в `apps/mobile/src/features/chat2/Chat2ListScreen.swipes.mounted.test.tsx`: полный типизированный `Conversation` вместо небезопасного `as Conversation`.
- **PASS** — восстановлены зависимости `pnpm install --frozen-lockfile --offline --ignore-scripts` (exit 0).
- **PASS** — `pnpm --filter @gafus/mobile typecheck` (exit 0).
- **PASS** — `pnpm --filter @gafus/mobile exec vitest run --config vitest.config.ts src/features/chat2/Chat2ListScreen.swipes.mounted.test.tsx` (exit 0; 6 из 6 тестов).

Логи: `/tmp/gafus-r8-ts-fixed.log`, `/tmp/gafus-r8-chat2-test-fixed.log`.

Эти результаты заменяют прежний FAIL TypeScript и BLOCKED по ADB/диску в историческом разделе отчёта. Release AAB/R8 и функциональный QA Samsung остаются **NOT RUN** после снятия этих блокировок до их реального выполнения; статус готовности к production по-прежнему **NOT READY**.


## Дополнение 21.11.2026 — фактическая Release-сборка R8

**PASS (Gradle R8/AAB):** изолированный EAS prebuild, затем `:app:bundleRelease` c Kotlin `in-process` и системным AAPT2; `BUILD SUCCESSFUL in 41m 34s`, 1450 Gradle tasks; `:app:minifyReleaseWithR8`, `:app:signReleaseBundle`, `:app:bundleRelease` успешно. Рабочий кандидат собран из **dirty workspace**, HEAD `28e3f9bf7c08cb348baed4aab221e7b5cbd9b5d9`, поэтому HEAD не идентифицирует набор всех входов сборки. Вспомогательные файлы, логи и QA-AAB — `/tmp/gafus-r8-qa-release-20261121/` (отдельно от исходников). Отключения R8 не было. Фактический EAS injected versionCode **17601**, несмотря на `app.json` versionCode **17602** (удалённый source version), поэтому AAB **нельзя загружать в Play Console** без разрешения конфликта; изменять версию без разрешения нельзя.

Исторический AAB: `apps/mobile/gafus-1.7.6-17601-google-play.aab`, SHA256 `6ff07632fa4427f50be878016b261da08dc77d11867ece05b63dc887c4dcb031`.

Новый AAB: `/tmp/gafus-r8-qa-release-20261121/gafus-1.7.6-r8-qa.aab`, SHA256 `3aface93846a61e67fc7501e5842860e583bba2d95cffeae33547ca95a45b9a2`.

| Метрика | Исторический AAB | Новый QA-AAB | Разница |
|---|---:|---:|---:|
| AAB bytes | 202 701 471 | 196 699 019 | -2,96% |
| Несжатый DEX bytes | 84 658 036 | 25 017 808 | **-70,45%** |
| DEX files | 10 | 3 | -7 |
| class_defs (сумма) | 76 128 | 27 918 | -48 210 |
| method_ids (сумма) | 527 345 | 161 025 | -366 320 |
| R8 mapping | нет | **да, ~186 MiB** | PASS |

Число method_ids — сумма ID по DEX, не число уникальных методов. Не переносить **локальные -70,45%** в официальные метрики Google Play (оптимизация/обфускация/сокращение 25%).

**PASS:** проверка `verify-android-aab-16k.mjs` — 67 ELF библиотек; `verify-android-aab-app-links.mjs` — оба домена; `verify-android-payment-aab.mjs` — стандартный JS содержит Google Play Billing, Expo WebBrowser, нет запрещённого checkout ЮKassa и RuStore Push; `verify-android-aab-compressor.mjs` — Compressor связан с DEX.

**Проблема QA-инструментов (P1):** стандартные `verify-android-payment-aab.mjs` и `android-aab-compressor.mjs` падают с `spawnSync unzip ENOBUFS`, поскольку `proguard.map` после R8 ~186 MiB, а `maxBuffer` установлен 128 MiB. Выполнен **диагностический PASS** на копиях четырёх скриптов в `/tmp/gafus-r8-qa-release-20261121/qa-scripts/`, где повышен только `maxBuffer` до 256 MiB. Исходные скрипты не изменены. Агенту №1: устранить ограничение (лучше потоковое чтение mapping) с тестом на mapping >128 MiB.

В ходе сборки устранены только проблемы диагностического окружения: Kotlin daemon `UtilKt` обходом `in-process`, Gradle ручной запуск с `EAS_BUILD_WORKINGDIR`, HTTPS `Tag mismatch` при загрузке AAPT2 обходом `-Pandroid.aapt2FromMavenOverride` к установленному Android SDK Build Tools 36.0.0. Производственный код/Gradle/ProGuard не редактировались.

**Остаётся:** APK и device QA, actual Billing, OTA, Google Play Console; отсутствие доказательств — не PASS. Verdict для публикации: NOT READY.


## Финальная приёмка Release APK и оставшиеся критерии

| Проверка | Статус | Фактический результат |
|---|---|---|
| R8 `:app:minifyReleaseWithR8` | **PASS** | Gradle Release AAB успешно собран, `mapping.txt` 186 MiB, `usage.txt`, `seeds.txt`, `configuration.txt` присутствуют |
| AAB | **PASS** | `196 699 019` байт, SHA256 `3aface93846a61e67fc7501e5842860e583bba2d95cffeae33547ca95a45b9a2` |
| APK Release | **PASS** | `:app:assembleRelease BUILD SUCCESSFUL`, `/tmp/gafus-r8-qa-release-20261121/gafus-1.7.6-r8-qa.apk`, SHA256 `5029e12386f7eb3359f176a0c37a1572b1558a392225a22683fd022404ab557b` |
| APK package/version | **PASS (измерение)** | `ru.gafus.app`, `1.7.6`, **versionCode 17601**, minSdk 24, targetSdk 36; **не тот номер**, что в app.json и на Samsung |
| Подпись APK | **PASS** | `apksigner verify`: v2 signature true, cert SHA256 `4ab516cf4fe26131a714d08486aa6c2b10701e8d4bbd20b3043d6499c040d8f9` |
| APK — соответствие коду AAB | **PASS** | SHA256 побайтово идентичен для всех трёх DEX-файлов AAB и APK |
| Android R8 build properties | **PASS** | `android.enableMinifyInReleaseBuilds=true`, `android.enableShrinkResourcesInReleaseBuilds=true`, `android.r8.optimizedResourceShrinking=true`, `proguard-android-optimize.txt` в изолированной Gradle-сборке |
| Проверки стандартных функций по AAB | **PASS (статический)** | Billing, браузерный модуль, отсутствие checkout ЮKassa и RuStore Push, compressor; исполняемые сценарии не проверены |
| GPS/Chat 2.0 unit | **PASS** | 30/30 тестов в 6 файлах: GPS task/registration, Chat2 фото/видео, медиа, свайпы; лог `/tmp/gafus-r8-qa-release-20261121/mobile-regression-tests.log` |
| OTA/платёжные контракты unit | **PASS** | 20/20 тестов: OTA profile, target, production trust/workflow, AAB compressor и 16K; `/tmp/gafus-r8-qa-release-20261121/ota-static-tests.log` |
| Samsung install + functional | **BLOCKED** | Samsung `SM_A536E` виден в ADB, но уже установлен `versionCode 17602` против APK `17601`. Нельзя безопасно установить поверх; не удаляли данные и не пытались понизить версию |
| Chat/Moments/GPS/шагомер/Foreground Service на **новом** APK | **BLOCKED** | Оптимизированный APK не установлен. Ни один сценарий на этом APK фактически не выполнялся |
| Реальный Google Play Billing / restore | **BLOCKED** | Не установлен новый APK; реальные покупки не совершались |
| Реальный self-hosted OTA / фильтр получателей | **BLOCKED** | Новый APK не установлен, production OTA не выпускалось; только статические контракты |
| Google Play Console analysis (25/25/25) | **BLOCKED** | AAB не загружали из-за versionCode и неполной device QA; Chrome Playwright `browser_tabs list` возвращал внутреннюю ошибку |

**Задания агенту №1/релизному инженеру:**

1. **P0 RELEASE:** привести EAS remote `android.versionCode` и OTA native descriptor к утверждённому номеру кандидата **без самовольного увеличения**; существующий `app.json` и Samsung используют `17602`, а EAS подставляет `17601`. Согласовать один clean commit, `sourceSha` и native fingerprint, проверить отсутствие конфликта в Play Console. Затем повторить подписанный AAB+APK и проверить SHA/манифест.
2. **P1 QA-script:** убрать `spawnSync unzip ENOBUFS` при R8 mapping >128 MiB в скриптах `verify-android-payment-aab.mjs` и `android-aab-compressor.mjs`; приложить регрессионный тест на крупный mapping. Временные копии вне repo дали PASS при `maxBuffer=256 MiB`.
3. **P1 RELEASE QA:** после версии/подписи установить соответствующий новый APK без потери данных; выполнить Samsung smoke, Logcat, GPS/шагомер/Foreground Service, Chat2, Moments, Billing, OTA; только затем — внутренний тест Google Play и официальные проценты DEX.

**Не делалось:** production push/deploy, публикация массового OTA, загрузка в Google Play, отключение оптимизаций, реальная покупка или удаление данных Samsung. Производственный код / Gradle / ProGuard в основном репозитории не менялся в ходе этого этапа.


## Device QA: Samsung Galaxy A53, optimized R8 release 17602 — выполнено 21.11.2026

Обновление исторических статусных таблиц: **блокер установки устранён** для диагностического APK. EAS store AAB по-прежнему имеет `versionCode=17601`, и эта сборка **не одобрена** для Play Console. Device QA выполнено с **отдельным** APK, подписанным debug-ключом и имеющим номер 17602 (только временные Gradle-файлы; никаких правок `app.json`, production Gradle и store signing).

- Оригинальный установленный APK `ru.gafus.app` версии `1.7.6 (17602)` извлечён из Samsung для **проверки подписи**, SHA256 сертификата `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (debug keystore проекта).
- Временный Gradle prebuild в `/tmp/gafus-r8-qa-release-20261121/eas-work/build/apps/mobile/android` настроен на `17602` и debug signing. Выполнены `:app:minifyReleaseWithR8` и `:app:assembleRelease`, **BUILD SUCCESSFUL in 17m 26s**.
- Итоговый device APK `/tmp/gafus-r8-qa-release-20261121/gafus-1.7.6-17602-samsung-r8.apk`, SHA256 `994c827c7c31397da9f0bc6cdee9e768c403e2336eddd267931c86cc28e3cd21`. `aapt`: `ru.gafus.app`, `versionCode 17602`, `versionName 1.7.6`. `apksigner`: SHA256 сертификата **точно совпал** с установленным.
- **PASS INSTALL:** `adb -s RZCT80F6J8P install -r <APK>` → `Success`. Без uninstall/downgrade, пользовательские данные не сбрасывались. Повторно `dumpsys package`: `versionCode=17602`, `versionName=1.7.6`.
- **PASS LAUNCH:** `adb shell monkey -p ru.gafus.app -c android.intent.category.LAUNCHER 1` успешно. `pidof ru.gafus.app` = `5537`, `dumpsys activity` показывает `ru.gafus.app/.MainActivity` как resumed. Нет `FATAL EXCEPTION` / `ReactNativeJS` errors в проверенном фрагменте Logcat (это только ограниченная smoke-проверка, не гарантия отсутствия ошибок).
- **PASS installed permissions:** `ACCESS_BACKGROUND_LOCATION` и `ACTIVITY_RECOGNITION` `granted=true`; `FOREGROUND_SERVICE_LOCATION`, `FOREGROUND_SERVICE_HEALTH`, `com.android.vending.BILLING` присутствуют и granted.
- **BLOCKED полноценные UI-сценарии:** Samsung сейчас заблокирован экраном ввода **PIN** (uiautomator dump), а ADB не может обходить PIN. Не предпринимались попытки подобрать или ввести PIN. Поэтому навигация, GPS, шагомер, foreground notification, Moments, чат, реальные покупки и OTA **не проверены на экране**. Требуется разблокировать телефон владельцем, затем повторить device functional QA.
- Google Play внутренний релиз **не делали**. Тестовый APK с debug-подписью нельзя использовать для публикации в магазин. Настоящий store AAB требует согласования remote `versionCode`/native descriptor, clean source и дополнительной приёмки.

**Текущий итог:** R8 optimization, release artifact static checks, install and smoke startup — PASS; end-to-end device QA — BLOCKED by PIN lock; Google Play publish — NOT READY.


## Device QA после разблокировки Samsung — 22.11.2026

**Устройство:** Samsung Galaxy A53 (SM-A536E), serial `RZCT80F6J8P`, Android `ru.gafus.app` 1.7.6 (`versionCode=17602`), тестовая Release-сборка R8 с debug-подписью. Проверки проведены через **реальный ADB/UIAutomator на устройстве**, не симулятор. Все изменения релизного native Gradle и окружения — только во временной копии в `/tmp/gafus-r8-qa-release-20261121`.

| Сценарий | Итог | Доказательство / ограничения |
|---|---|---|
| Авторизованная сессия | **PASS** | Приложение открыло список курсов и профиль авторизованного admin, повторный вход не потребовался |
| Курсы | **PASS smoke** | Список → «Факультет спокойствия (демо)» → «Теоретический блок / Инструкции», видны шаги, прогресс 80%, завершённые уроки |
| «Моменты» | **PASS feed** | Лента загружается, показаны карточка, видео, реакция и комментарии; **само воспроизведение видео не подтверждено** (открывалось внешнее YouTube приложение, UIAutomator не получил idle) |
| Профиль | **PASS smoke** | Экран профиля и данные учетной записи отображаются |
| Питомцы | **PASS smoke** | Карточки двух питомцев, метаданные, документы, переключатели и действия доступны; записи не редактировались |
| Вопросы | **PASS smoke** | Список вопросов и подробная карточка вопроса, поле ответа и прикрепления отображаются; ответ не публиковался |
| Прогулки | **PASS UI flow** | Главный экран со статистикой, вход в таймер, старт, пауза (индикатор «ПРОГУЛКА НА ПАУЗЕ»), завершение (00:00, кнопка «Начать») |
| Фоновая служба | **PASS Android FGS** | После `KEYCODE_HOME` и 12 сек вне приложения процесс жив, `DogWalkStepService` `isForeground=true` и активное уведомление `gafus-dog-walk-running`, «Прогулка с собакой», foreground flag установлен |
| Окончание FGS | **PASS** | После окончания прогулки `DogWalkStepService` отсутствует в активных сервисах, уведомление отсутствует в `Notification List` и осталось только в системном `mArchive` |
| Фактические шаги/GPS-трек | **NOT TESTED** | Телефон лежал на месте, было `0 шагов`, `≈ 0 м`; физическое движение и точность маршрута не подтверждены |
| Чат 2.0 — первый диагностический APK | **FAIL** | Экран показывал `Chat 2.0: настройте адрес API чата`, пустой список; причина: ручной Gradle пересобирал Metro без `EXPO_PUBLIC_CHAT2_API_ORIGIN` после EAS-подготовки, это дефект QA-процесса/сборочного окружения, не доказанный дефект исходного EAS профиля или R8 |
| Чат 2.0 — исправленный диагностический APK | **PASS** | Запущен Metro `:app:createBundleReleaseJsAndAssets` с production `EXPO_PUBLIC_CHAT2_API_ORIGIN=https://api.gafus.ru`, `EXPO_PUBLIC_API_BASE_URL=https://api.gafus.ru` и native self-hosted descriptor/cert env; `BUILD SUCCESSFUL`. Перепаковка `:app:assembleRelease` PASS, `:app:minifyReleaseWithR8 UP-TO-DATE`, новый JS отличается от прежнего. `adb install -r` → `Success` без сброса данных. Чаты «Общий чат GAFUS», `asmtv1`, «пёсильный чат» загружены; открыта переписка «Общий чат GAFUS», `3 участников · подключено`, история сообщений видна |
| Chat attachments | **PASS open-only** | Меню «ФОТО», «ВИДЕО MP4», «PDF» открыто; пункт «ФОТО» запустил `com.google.android.photopicker`, фото не выбирались и не отправлялись |
| Android widget registration | **PASS registered** | `dumpsys appwidget` показывает провайдер `ru.gafus.app.widget.DogWalk`; реальное размещение, размеры и кнопки виджета не проверяли |
| Android errors | **PASS smoke** | `pidof ru.gafus.app` жив; в проверенном окне Logcat (`-t 7000`) нет `FATAL EXCEPTION`, `Process: ru.gafus.app` либо `ReactNativeJS` error/exception; это не полный краш-фри аудит |
| Google Play Billing | **NOT TESTED end-to-end** | В AAB есть Billing, но реальная транзакция / restore не выполнялись |
| OTA | **NOT TESTED end-to-end** | Native OTA готовность и контракт проверены статически; обновление по воздуху не выпускалось |

**Тестовые данные:** короткая тестовая прогулка (~1 мин 49 сек без пауз, 0 шагов) была завершена штатно и попала в историю; недельный счётчик прогулок увеличился с 4 до 5. Данные не удалялись, реальных сообщений и платежей не создавали.

**Финальный тестовый APK:** `/tmp/gafus-r8-qa-release-20261121/gafus-1.7.6-17602-samsung-r8-chat2env.apk`, SHA256 `f37e503bd02ae146bdcb9ea84d4083f85e6c0359e73e643380bac501b649b08e`, debug certificate SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Перед `install -r` проверено совпадение подписи и versionCode. Store AAB **не пересобран** после этого изменения QA JS-бандла, его нельзя считать проверенным тем же Chat 2.0 сценарием.

**Релизный вердикт остаётся NOT READY**: store AAB должен иметь согласованный `versionCode` (EAS remote выдал 17601 при app.json 17602), production native descriptor и воспроизводимый публичный JS env; отдельно нужны проверка реальных GPS/шагов в движении, Billing/OTA и официальные метрики Play Console. Текущий **device smoke для диагностической R8 сборки — PASS с перечисленными ограничениями**. В `main` не пушили, production не деплоили, OTA не публиковали.
