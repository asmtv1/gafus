# GAFUS mobile E2E

Актуальный запуск описан в разделе [Нативный маршрут в общем плане](#нативный-маршрут-в-общем-плане). Ниже сохранён контекст предыдущего пилота.

`flows/common/login.yaml`, `flows/android/mandatory-ota.yaml`, `flows/ios/mandatory-ota.yaml` — заготовки реальных действий Maestro для Android/iOS с `appId: ru.gafus.app`. Они проверены синтаксически, **но не запускались на установленных QA-сборках**, поэтому `mobile.ota.android` и `mobile.ota.ios` остаются `blocked` в каталоге и не дают разрешения на релиз.

Прежде чем выполнять, необходимы изолированный QA API и БД, синтетический пользователь, нативная сборка с адресом тестового API и подписью, номер native build и exact runtime. Нельзя запускать на пользовательском аккаунте или против production API. Для входа передать переменные `QA_USERNAME` / `QA_PASSWORD` только тестового аккаунта в окружение Maestro. Первым выполнить логин без обязательного OTA; отдельным тестом назначить подписанный **тестовый** обязательный OTA именно этой платформе и версии, затем выполнить gate-flow. Для Android кнопка системного «назад» не должна обходить экран; для обеих платформ экран должен оставаться после остановки приложения и повторного запуска.

Проверка полного OTA **не завершается** этими flow: нужно дождаться применения обновления и прочитать запущенную ревизию после рестарта (а не только серверную ревизию или ответ об успешном скачивании). В отдельной release-квитанции сохранить SHA серверного коммита, sha256 QA-бинарника, platform, version/build, native runtime, OTA manifest revision, фактическую runtime revision и JUnit с тестом. Сценарий офлайн-завершения тренировок и восстановления синхронизации требует собственного flow на каждой платформе. Важные платежи Apple/ЮKassa тестировать в sandbox, не в production.

Пример запуска **только когда QA-подготовка завершена**, без записывания секретов в репозиторий:

```bash
maestro test --format junit --output .qa/testing/android-login.xml tests/e2e/mobile/flows/common/login.yaml
maestro test --format junit --output .qa/testing/android-ota-gate.xml tests/e2e/mobile/flows/android/mandatory-ota.yaml
maestro test --format junit --output .qa/testing/ios-ota-gate.xml tests/e2e/mobile/flows/ios/mandatory-ota.yaml
```

Один exit=0 без проверки содержимого JUnit и ревизии не является выпускной приёмкой.

## Проверка доступных предпосылок без устройств (19.11.2026)

Команда **только для диагностики** (не запускает Maestro, не создаёт эмулятор, не ставит APK/IPA):

```bash
pnpm test:e2e:mobile:preflight
cat .qa/testing/mobile-e2e/preflight.json
```

`mobile-e2e-preflight.mjs` разбирает оба YAML-документа каждого flow, проверяет `appId`, схему действий и конкретные селекторы в RN-исходниках. Это **статическая проверка YAML, не проверка Maestro-CLI или работающего приложения**. Контракт: `node --test tests/support/mobile-maestro-flow.test.mjs`. Диагностическая команда может завершиться `0` со статусом `incomplete`: это не PASS нативного E2E.

Фактически проверено: оба app ID `ru.gafus.app`, `expo.version=1.7.5`, `runtimeVersion.policy=appVersion`, `expo-updates ~57.0.28`. `username-input`, `password-input`, `login-button` есть в `app/(auth)/login.tsx`, а `required-ota-screen` — в `RequiredOtaUpdateGate.tsx`. Все три YAML-описания валидны. Есть `adb`, Android SDK/platform-tools, Gradle wrapper, Xcode 27.2, `xcrun`, проект `Gafus.xcodeproj`, `pod`. **Обновление на 19.11.2026:** Maestro CLI 2.12.1 установлен в `~/.maestro/bin`; Java 17.0.18 закреплена через `JAVA_HOME` и `PATH` в пользовательских `.zprofile`/`.zshrc`. `zsh -lc` и `zsh -ic` проверены, команда `maestro test --help` прошла. В non-login вызовах preflight самостоятельно выбирает существующий JDK 17 и каталог Maestro, не требуя изменения системной Java. Состояние до установки сохранено в резервных копиях в `~/Library/Application Support/GafusQA/ToolchainBackups/`. `adb devices -l` вернул пустой список, iOS-симуляторы не запущены. Подписанная *изолированная QA-сборка* с тестовым API не подтверждена. Store IPA в дереве проекта нельзя автоматически считать QA-сборкой. Поэтому обе нативные проверки остаются `blocked`.

### Чек-лист реальной проверки на Android и iPhone (пока не выполнялся)

- [ ] Подготовить **изолированный QA API/PostgreSQL/Redis**, отдельный канал/политику тестового OTA и синтетические аккаунты. Запретить продакшен-URL, реальные платёжные и пользовательские учётные данные. Снять SHA API и идентификаторы одноразовых ресурсов.
- [ ] Установить и проверить `maestro --version`, `java -version`, `adb version`, `xcodebuild -version`. Если `java` по PATH недоступен, выбрать заранее проверенный JDK, например `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` и `export PATH="$JAVA_HOME/bin:$PATH"`. Повторить `pnpm test:e2e:mobile:preflight`.
- [ ] Собрать **настоящие нативные тестовые** APK и iOS `.app`/IPA с адресом изолированного QA API, OTA-подписью, точной платформой, версией, `runtimeVersion`, build number и native fingerprint. Подтвердить подпись, SHA-256 и совместимость. Сборку из production/store нельзя подменять неподтверждённой QA-конфигурацией.
- [ ] Подключить реальный Android (`adb devices -l`) и реальный iPhone через Xcode/Devices; проверить доверие устройства, доступность приложения и нужный канал обновлений. Не считать существование iOS Simulator доказательством проверки на физическом iPhone.
- [ ] Установить QA-бинарник. Android: `adb -s "$ANDROID_SERIAL" install -r /path/to/gafus-qa.apk`; iOS: установить подписанную QA-сборку через Xcode Devices. Зафиксировать серийный ID устройства приватно в протоколе, не в Git.
- [ ] Выполнить `flows/common/login.yaml` с **тестовыми** `QA_USERNAME`/`QA_PASSWORD` через `maestro test --format junit --output ...`; проверить вход в «Курсы» и сохранение сессии после перезапуска.
- [ ] Для конкретной платформы, установки и native runtime опубликовать **только в QA** совместимый подписанный обязательный OTA-релиз, включить только для синтетического аккаунта. До этого ни один mandatory-flow не считается подготовленным.
- [ ] Запустить `flows/android/mandatory-ota.yaml`: gate `required-ota-screen` виден, системная кнопка Back его не обходит, после остановки и нового запуска gate остаётся. На iPhone — `flows/ios/mandatory-ota.yaml`, gate сохраняется после stop/launch (проверки Android Back на iOS нет).
- [ ] Проверить **не только блокировку**, но и скачивание, установку, обязательный рестарт, фактически запущенную `activeOtaRevision()` (из `otaRevision.generated`), `Updates.updateId`, channel и runtimeVersion **после** рестарта. Записать ожидаемую ревизию из подписанного QA-манифеста и фактическую ревизию независимо, проверить их совпадение. Отдельно проверить, что офлайн/неудачная загрузка не позволяет обойти обязательный gate.
- [ ] Собрать JUnit, логи, SHA-256 бинарника, platform/version/build/native runtime, fingerprint, manifest ID, ревизию приложения после OTA, скриншоты gate/после установки и политику тестового охвата. Проверить JUnit на реальные assertions, failures и skips, а не только exit code. Удалить изолированную политику и данные после теста.

Пример вызова **после выполнения предпосылок**, выполняется отдельно для каждой платформы, не на текущем окружении:

```bash
export QA_USERNAME='<синтетический пользователь>'
export QA_PASSWORD='<секрет только временного QA-аккаунта>'
maestro --version
maestro test --format junit --output .qa/testing/android-login.xml tests/e2e/mobile/flows/common/login.yaml
maestro test --format junit --output .qa/testing/android-required-ota.xml tests/e2e/mobile/flows/android/mandatory-ota.yaml
maestro test --format junit --output .qa/testing/ios-required-ota.xml tests/e2e/mobile/flows/ios/mandatory-ota.yaml
```

Эти команды **не запускались** на устройствах в данном этапе. `mobile.ota.android`/`mobile.ota.ios` в `tests/catalog/suites.json` должны оставаться `blocked` до появления всех нативных квитанций и проверки запущенной ревизии.


## Результат установки Maestro и встроенный план/запуск/отчёт (19.11.2026)

Установлено локально **официальным пользовательским установщиком** (Maestro 2.12.1) в `~/.maestro/bin`. Он не затронул прод и не запустил эмуляторы. Java 17.0.18 выбрана из установленного Homebrew JDK; `~/.zprofile` и существующий блок Java в `~/.zshrc` скорректированы точечно с сохранением копий файлов. Отменённый Homebrew-вариант потребовал бы обновления многочисленных библиотек; поэтому использован отдельный CLI, а не замена системного JDK.

**Важное ограничение:** на установленном CLI `maestro test --help` есть `--format`, `--output`, `--env`, но **нет** команды `--dry-run` или `validate` для локального flow без устройства. Поэтому этап без устройства делает **статическую** проверку всех трёх реальных YAML (две YAML-секции, команда, required selector, SHA-256) вместе с read-only `maestro --version` и `maestro test --help`. Он **не вызывает** `maestro test <flow.yaml>`: этот вызов требует реального приложения и не является device-free dry-run.

```bash
# Инструментальная проверка: пишет .qa/testing/mobile-e2e/preflight.json.
# Код 0 здесь означает лишь успешную диагностику, внутри status=incomplete.
pnpm test:e2e:mobile:preflight

# Полноправный информационный профиль системы тестирования:
node scripts/qa/test-system.mjs plan --profile native-preflight --plan-only
pnpm test:mobile:preflight
# Ожидаемый код 2 при отсутствующих устройствах/подписанных QA-сборках.
# В summary.json: nativePreflight.status=incomplete; nativeAcceptance=false.

# Прочитать отчёт созданного запуска по ID из вывода:
node scripts/qa/test-system.mjs report --run-id <qa-run-id>
```

Проверенный результат `plan/run/report`: `.qa/testing/qa-0ab652c6-515e-4ea8-b4f9-cd4db9960eb5/summary.md` — **INCOMPLETE / REPORT 2**, Java и Maestro готовы, **3/3 flow валидны**, Android-устройства нет; `xcrun devicectl` видит iPhone в состоянии `unavailable`, а не подключённое физическое устройство. Изолированные подписанные APK/IPA, политика QA OTA и реальные JUnit/`Updates.updateId` после установки не подтверждены. Отчёт записывает именно причины отсутствия, а не фальшивые проверки Android/iOS.

Статус `incomplete` **намеренно не становится `passed`** от успешной статической валидации. Любая попытка представить статический preflight как выполненный device E2E отклоняется контрактом `tests/support/mobile-preflight-report.mjs`. Профиль также доступен в ручном информационном GitHub workflow `testing-native-preflight-advisory` (не был запущен и не влияет на release gates).

Официальные справочники: https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli и https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.

## Нативный маршрут в общем плане

Разделы выше фиксируют состояние пилота. Текущий каталог направляет Android и
iOS в `scripts/qa/mobile-maestro-run.mjs`, с отдельными результатами для
`mobile.training` и `mobile.ota`. Отсутствующий входной манифест, бинарник,
устройство или JUnit приводят к коду `2`. Preflight остаётся отдельной диагностикой.

Используйте отдельное устройство с предустановленной подписанной QA-сборкой и
синтетического ученика. В QA-бандле передайте `EXPO_PUBLIC_GAFUS_QA_SERVER_SHA`
со значением точного SHA кандидата и адрес изолированного API через
`EXPO_PUBLIC_API_BASE_URL`. Метка runtime включается только для настроенного QA
сборочного профиля с локальным, частным или тестовым адресом. QA OTA-бандлы
должны содержать ту же метку. Метка сообщает версию и номер установленной нативной
сборки, фактический Expo runtime, ревизию запущенного JS и Expo update ID.

Передайте путь к защищённому локальному JSON через
`GAFUS_MAESTRO_ANDROID_INPUT` либо `GAFUS_MAESTRO_IOS_INPUT`. Поля JSON:

| Поля | Значение |
| --- | --- |
| `platform`, `device` | `android` или `ios` и ID выбранного устройства Maestro |
| `artifact`, `binarySha256` | Путь к установленному QA APK либо архиву QA iOS и его SHA-256 |
| `serverCommit`, `version`, `build`, `runtime` | SHA изолированного сервера и ожидаемая нативная конфигурация, строки |
| `initial` | Пара `revision` (число) и `updateId` (UUID или `embedded`) |
| `install`, `recovery` | Для OTA — две пары с UUID из подписанных QA-манифестов и строго возрастающими номерами ревизий |
| `databaseUrl`, `userId`, `dayOnCourseId`, `stepOnDayId` | Для тренировки — выделенная loopback Compose PostgreSQL и ID синтетических записей |
| `courseType`, `trainingLink`, `stepTitle` | Синтетические `qa-training-…`, `gafus:///trainings/<courseType>/<dayOnCourseId>` и заголовок шага `QA: …` |

Для логина передайте `QA_USERNAME` вида `qa_learner_…` и `QA_PASSWORD` через
локальное окружение. Используйте отдельные фикстуры для каждой платформы и
прогона. При запуске следите за `output.log` в текущей попытке. Для тренировки
оператор выключает сеть на выбранном устройстве на этапе `offline`, затем
возвращает на этапе `readback`. Шаг проверяется в UI, после перезапуска и по
единственной записи PostgreSQL. На iOS переключением управляет оператор или
внешний QA-стенд, поскольку команда Maestro для авиарежима доступна на Android.
Для OTA оператор включает обязательную подписанную QA-политику, оставляет gate
доступным для проверки перезапуска и Android Back, затем разрешает загрузку.
После проверки установленной ревизии оператор включает подписанное
восстановительное обновление. Приложение проверяет подпись штатным механизмом.
Сохраняйте манифесты и журнал подготовки устройства рядом с приватными артефактами.

```bash
pnpm test:e2e:mobile --scenario mobile.training --platform android
pnpm test:e2e:mobile --scenario mobile.ota --platform ios
```

Ссылки на команды [выбора устройства](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/specify-and-start-devices) и [авиарежима](https://docs.maestro.dev/reference/commands-available/setairplanemode).

На уже работающем одноразовом Compose-стенде процесс с окружением
`tests/support/test-env.mjs` может вызвать `node scripts/qa/seed-mobile-training.mjs .qa/testing/<run>/mobile-fixture.json`.
Команда создаёт ученика, тренера, открытый курс и один практический шаг.
Перенесите поля фикстуры в локальный входной манифест и передайте логин и пароль
через окружение. Стенд должен оставаться запущенным до завершения Maestro и проверки PostgreSQL.
