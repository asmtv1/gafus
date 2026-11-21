# GAFUS Android 1.7.6 — R8 и DEX

Исходный HEAD на 21 ноября 2026 года — `28e3f9bf7c08cb348baed4aab221e7b5cbd9b5d9`. Изменения оставлены в рабочем дереве. Оптимизированный AAB и замер после изменений остаются задачей агента №2.

## Причина низкой оптимизации

Локальный `apps/mobile/gafus-1.7.6-17601-google-play.aab` (SHA-256 `6ff07632fa4427f50be878016b261da08dc77d11867ece05b63dc887c4dcb031`) содержит **10 DEX общим несжатым размером 84 658 036 байт**. Сжатый размер этих записей внутри AAB — 30 693 728 байт. Несжатый размер округляется до 84,7 МБ, показанных в Play Console. Для подтверждения идентичности загруженного AAB нужен его SHA-256.

В DEX есть маркер D8 с `backend:dex` и маркеры R8 с `backend:cf` от предварительно обработанного байткода. Маркер R8 с `backend:dex` и встроенный `proguard.map` отсутствуют. Вместе с конфигурацией это подтверждает отсутствие R8 на уровне приложения для исследованного AAB. Частично обфусцированный байткод зависимостей согласуется с наблюдением Play Console. Метод расчёта показателя 8% отдельно не проверялся.

Проверены корневой и app-level Android Gradle, Gradle Wrapper и properties, ProGuard, Expo-плагины, releaseRuntimeClasspath, упаковка AAR/JAR и EAS-профили. Expo SDK 57.0.33, React Native 0.86.3, Gradle Wrapper 9.3.1 и AGP 8.12.0 сохранены. Версия AGP совпадает в каталоге React Native Gradle Plugin, файлах AGP по умолчанию и метаданных AAB.

| Настройка | До | После |
| --- | --- | --- |
| Shrinking кода и обфускация | `android.enableMinifyInReleaseBuilds` отсутствовал, fallback шаблона `false` | Expo генерирует `android.enableMinifyInReleaseBuilds=true`. AGP 8.12 использует R8 full mode по умолчанию |
| Оптимизация байткода | `proguard-android.txt` содержал `-dontoptimize` и блокировал оптимизацию даже при ручном включении minify | `proguard-android-optimize.txt` и существующий `proguard-rules.pro` |
| Ресурсы | `android.enableShrinkResourcesInReleaseBuilds` отсутствовал, fallback `false` | `android.enableShrinkResourcesInReleaseBuilds=true` и `android.r8.optimizedResourceShrinking=true` для интегрированного режима AGP 8.12 |
| Mapping | В исследованном AAB отсутствует | AGP формирует `mapping.txt` для release и включает mapping в метаданные AAB |
| Нативный проект | Expo генерирует `apps/mobile/android/`. Каталог исключён из Git и сборочного архива EAS | Настройки применяются при Expo prebuild, включая чистое окружение EAS |

[Android Developers — оптимизация R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization), [Expo BuildProperties](https://docs.expo.dev/versions/latest/sdk/build-properties/).

## Правила ProGuard

| Правило | Изменение и основание |
| --- | --- |
| `-dontoptimize` из `proguard-android.txt` | Уходит при переходе на оптимизированный вариант AGP. Стандартные правила Android, включая JNI, берутся из нового файла |
| `-keep class com.swmansion.reanimated.** { *; }` | Удалено из app-файла. Reanimated 4.5.1 поставляет дубликат через `consumerProguardFiles` |
| `-keep class com.facebook.react.turbomodule.** { *; }` | Удалено из app-файла. Дубликат поставляют Reanimated и Worklets 0.10.1. Правила React Native покрывают bridge, TurboModule core и JNI |
| `-dontwarn`, `-dontshrink`, `-dontobfuscate` | В app-файле таких правил не было. Новых подавлений нет |

Сохранены consumer rules React Android, Expo Modules, Expo Updates, TaskManager, Location, Notifications, Billing, OpenIAP, AppMetrica, Yandex Mobile Ads и Voximplant. Например, Location сохраняет `taskConsumers`, TaskManager — классы задач, OpenIAP — `models` и `listener`. Просмотрено 168 файлов правил из кэшированных AAR/JAR в 360 координатах последнего release lint dependency report. Глобальных `-dontoptimize`, `-dontshrink`, `-dontobfuscate` в них не обнаружено. Итоговый `configuration.txt` появится после сборки.

Удаление дублей упрощает app-конфигурацию. Широкие библиотечные правила, включая правила Reanimated/Worklets, Expo и AppMetrica, остаются в силе. Снижение размера ожидается от включения R8 и оптимизированного профиля Android.

## Зависимости и совместимость

Удалённых или заменённых зависимостей нет.

- `expo-iap` объявляет OpenIAP 1.3.28 в библиотеке и через свой плагин в приложении. Оба пути Gradle разрешает как один `openiap-google:1.3.31` благодаря существующему `withGooglePlayBilling`. Billing 8.3.0 остаётся в релизном графе.
- Удалённый ранее RuStore Push и нативный SDK ЮKassa не обнаружены в стандартном releaseRuntimeClasspath. AAB-проверка отклоняет эти SDK и учитывает их имена в R8 mapping. Стандартный JS-бандл проверяется на Google Play и отсутствие checkout ЮKassa. `expo-web-browser` нужен предусмотренному браузерному checkout через OTA.
- Релизный граф проверен для Expo Updates, Expo Modules, Hermes/New Architecture, GPS и шагомера, push, камеры и медиа, сетевого стека, AppMetrica и Voximplant. Expo Dev Client и launcher входят в граф SDK 57. Подтверждения, что их можно исключить с сохранением preview и Expo Updates, нет.
- Сохранены единый Android-вариант для двух магазинов, версия приложения и runtimeVersion 1.7.6. В проекте iOS правок нет. R8 обрабатывает DEX и Android-ресурсы. Изменение размера Hermes-бандла и нативных `.so` следует оценивать отдельно.

## Изменённые файлы

- `apps/mobile/app.json` включает оптимизацию в Android-секции Expo BuildProperties и регистрирует Android-плагин. Существовавшие изменения versionCode, разрешений медиа и виджета сохранены.
- `apps/mobile/plugins/withAndroidReleaseOptimization.js` переключает стандартный файл ProGuard, включает интегрированный режим обработки ресурсов и убирает дубли шаблона.
- `apps/mobile/scripts/android-aab-r8.mjs` читает встроенный mapping и сопоставляет оригинальное имя класса с дескриптором в DEX.
- `apps/mobile/scripts/verify-android-payment-aab.mjs` учитывает переименования Billing, WebBrowser и запрещённых SDK.
- `apps/mobile/scripts/android-aab-compressor.mjs` проверяет сопоставленный дескриптор компрессора в DEX.
- `apps/mobile/scripts/android-aab-compressor.test.mjs` проверяет отказ при наличии записи в mapping и отсутствии соответствующего дескриптора.
- `docs/audit/android-r8-refactoring-20261121.md` содержит выводы и команды для агента №2.

## Статические проверки

- Чистый Android Expo prebuild из установленного SDK-шаблона и повторный prebuild прошли в изолированной копии. Проверены три Gradle properties, оптимизированный ProGuard, отсутствие дублей шаблона, Hermes, New Architecture и версия 1.7.6.
- Production self-hosted prebuild с локальным Android descriptor подтвердил генерацию URL OTA, ресурса runtime 1.7.6, привязки сертификата и разрешения Billing. Descriptor соответствует старому номеру 17601. Его fingerprint отличается от текущих исходников.
- `./gradlew --offline :app:bundleRelease --dry-run` завершился успешно. В плане присутствует `:app:minifyReleaseWithR8`. Контрольный dry-run с отключёнными флагами использует `:app:mergeDexRelease`. Отдельно получен offline-отчёт `releaseRuntimeClasspath`. Скрипт `verify-native-release.mjs` подтвердил версию 1.7.6 и политику runtime `appVersion`.
- Проверки Billing и компрессора прошли на исходном AAB. Синтетические ZIP-образцы подтвердили поддержку переименований, отказ при отсутствии WebBrowser в DEX и при наличии переименованных RuStore Push и SDK ЮKassa. Два теста компрессора прошли.
- Выполнение R8, итоговый merged config, новый AAB, QA на устройствах и показатели Play Console остаются открытыми.

## Release AAB для агента №2

Для подписанного кандидата используйте чистый снимок с согласованными исходниками, JDK 17, Android SDK, штатным ключом подписи и актуальным OTA descriptor с публичным сертификатом. Сопоставьте `sourceSha`, `nativeFingerprint`, `buildNumber` и `runtimeVersion` с выбранным кандидатом. Для нового descriptor используется штатный `prepare-self-hosted-native-build.mjs`. EAS использует `appVersionSource: remote` и `autoIncrement: false` для этого профиля. Проверьте versionCode по манифесту AAB. Алгоритм native fingerprint учитывает общие входы, в том числе `app.json` и `plugins/`, для обеих платформ. Для OTA поверх ранее выпущенной iOS-сборки используйте её совместимый снимок. [Процесс подготовки OTA-кандидата](../deployment/ota-production-175.md).

Из корня подготовленного снимка:

```sh
pnpm install --frozen-lockfile
umask 077
export R8_OUTPUT="$(mktemp -d /tmp/gafus-android-r8.XXXXXX)"
mkdir "$R8_OUTPUT/eas-work"
(
  cd apps/mobile
  EAS_LOCAL_BUILD_SKIP_CLEANUP=1 EAS_LOCAL_BUILD_WORKINGDIR="$R8_OUTPUT/eas-work" \
    npx --yes eas-cli@27.4.1 build --platform android --profile ota-176-android-store \
      --local --non-interactive --output "$R8_OUTPUT/gafus-1.7.6-r8.aab"
)
```

`ota-176-android-store` наследует production-настройки и включает self-hosted Expo Updates. Для диагностического релиза сгенерируйте Android-проект через `pnpm exec expo prebuild --platform android --no-install` из `apps/mobile` с окружением этого профиля. Из `apps/mobile/android` запустите `./gradlew :app:bundleRelease --no-daemon`. Gradle использует подпись сгенерированного проекта, по умолчанию debug. [Локальный запуск EAS Build](https://docs.expo.dev/build-reference/local-builds/).

Команды проверки и сохранения артефактов после сборки:

```sh
aab="$R8_OUTPUT/gafus-1.7.6-r8.aab"
bundletool validate --bundle="$aab"
bundletool dump manifest --bundle="$aab" --xpath='/manifest/@android:versionCode'
node apps/mobile/scripts/verify-android-payment-aab.mjs "$aab"
node apps/mobile/scripts/verify-android-aab-compressor.mjs "$aab"
node apps/mobile/scripts/verify-android-aab-16k.mjs "$aab"
node apps/mobile/scripts/verify-android-aab-app-links.mjs "$aab"
shasum -a 256 "$aab"

(
  set -e
  map_file="$(find "$R8_OUTPUT/eas-work" -type f \
    -path '*/android/app/build/outputs/mapping/release/mapping.txt' -print -quit)"
  test -s "$map_file"
  mkdir "$R8_OUTPUT/r8"
  unzip -p "$aab" BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map \
    > "$R8_OUTPUT/r8/mapping.txt"
  test -s "$R8_OUTPUT/r8/mapping.txt"
  cmp "$map_file" "$R8_OUTPUT/r8/mapping.txt"
  for file in configuration.txt seeds.txt usage.txt resources.txt; do
    candidate="$(dirname "$map_file")/$file"
    if [ -f "$candidate" ]; then cp "$candidate" "$R8_OUTPUT/r8/"; fi
  done
)
```

При прямой Gradle-сборке mapping расположен в `apps/mobile/android/app/build/outputs/mapping/release/`. Сохраните приватно mapping, доступные отчёты R8, журнал сборки, SHA-256 AAB, versionCode и commit SHA. Каталог EAS после `SKIP_CLEANUP` может содержать материалы подписи. Копируйте из него конкретные файлы диагностики. При ошибке R8 проверьте лог и `missing_rules.txt`, если он сгенерирован. Для разбора удержания конкретного класса используйте `-whyareyoukeeping` в локальной диагностической копии. Для получения Java/Kotlin stack trace с исходными именами используйте:

```sh
"$ANDROID_HOME/cmdline-tools/latest/bin/retrace" "$R8_OUTPUT/r8/mapping.txt" trace.txt
```

[Android Developers — анализ конфигурации и Retrace](https://developer.android.com/topic/performance/app-optimization/troubleshoot-the-optimization).

## Сравнение DEX

Для исторического сравнения возьмите локальный AAB 17601. Для измерения вклада R8 соберите контрольный AAB из того же снимка и окружения. В контрольной Gradle-команде добавьте `-Pandroid.enableMinifyInReleaseBuilds=false -Pandroid.enableShrinkResourcesInReleaseBuilds=false -Pandroid.r8.optimizedResourceShrinking=false`. Сохраните его в отдельный файл до следующей сборки. Размеры считаются по всем `*/dex/classes*.dex` в AAB. ZIP-размер записей AAB отличается от размера доставки для конкретного устройства.

```sh
python3 - apps/mobile/gafus-1.7.6-17601-google-play.aab "$aab" <<'PY'
import re
import sys
from zipfile import ZipFile

sizes = []
for path in sys.argv[1:]:
    with ZipFile(path) as archive:
        dex = [entry for entry in archive.infolist()
               if re.fullmatch(r"[^/]+/dex/classes\d*\.dex", entry.filename)]
        if not dex:
            raise SystemExit(f"No DEX files in {path}")
        raw = sum(entry.file_size for entry in dex)
        packed = sum(entry.compress_size for entry in dex)
        sizes.append(raw)
        print(f"{path}: {len(dex)} DEX, {raw:,} uncompressed bytes, {packed:,} ZIP bytes")

before, after = sizes
print(f"Uncompressed DEX delta: {after - before:+,} bytes ({(after / before - 1):+.2%})")
PY
```

## Проверки агента №2

- Запустить встроенный Hermes-бандл. Проверить холодный старт, обновление с предыдущей Android-сборки, JSI/TurboModules, навигацию и анимации Reanimated/Worklets. Проверить FCM/Expo Push, запуск из уведомления и App Links.
- Проверить GPS в фоне и на экране, шагомер, восстановление прогулки после ухода в фон, Foreground Service, уведомление и виджет. Проверить иконки, splash и макеты на собранном релизе.
- Проверить каталог Google Play, purchase flow, callbacks, pending, отмену и восстановление. В RuStore проверить запуск того же Android-варианта и обработку недоступности Play Billing.
- Проверить self-hosted Expo Updates. Пройти встроенный запуск, подписанный OTA, перезапуск, восстановление профиля `standard` и предусмотренный тестовый браузерный checkout ЮKassa с совпадающим runtime/fingerprint.
- Проверить Chat 2.0 и Moments. Пройти push, WebSocket и reconnect, камеру, медиа, сжатие и загрузку видео, звонки и воспроизведение. Проверить AppMetrica, рекламу и расшифровку нативных Java/Kotlin стеков через Retrace.
- Проверить mapping, manifest, подпись, 16-КиБ alignment и размер DEX. Показатели Play Console сравнить после обработки нового AAB.
