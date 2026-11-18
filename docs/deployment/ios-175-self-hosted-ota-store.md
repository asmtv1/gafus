# GAFUS iOS 1.7.5 — локальная EAS IPA для App Store с собственным OTA

**Задача:** создать Store-IPA `ru.gafus.app` версии `1.7.5` с Expo SDK 57 и нашим подписанным OTA `https://gafus.ru/ota/manifest` (runtime `1.7.5`, channel `production`). **Сборка, загрузка в App Store Connect и публикация OTA — отдельные ручные действия.**

## Чем отличается от старой сборки

Не используйте для нового OTA `eas build --profile production` — он по умолчанию встраивает `u.expo.dev`. Новый профиль `ota-175-ios-store` отличается от внутреннего `ota-175-ios-internal`: `distribution: store`, явное согласование production Store-бинарника, `autoIncrement: false`. EAS по-прежнему хранит iOS buildNumber удалённо, поэтому локальная обвязка требует точного совпадения номера **до** запуска Xcode и проверяет итоговый IPA.

## 1. Завершить исходники

Перед `prepare` необходимо завершить/проверить все изменения и **закоммитить + запушить в `origin/main`**. Проверки специально запрещают подготовку с незакоммиченным деревом, на другой ветке или на SHA, которого нет на `origin/main`: fingerprint нативного релиза привязан к точному состоянию исходников. Не изменяйте исходники после регистрации кандидата; иначе нужен новый кандидат/UUID. Другие незакоммиченные изменения не удалять и не перезаписывать.

Убедитесь, что номер для 1.7.5 ещё не использован в App Store Connect. Неудавшаяся Store-сборка **97** уже имеет отдельную неизменяемую регистрацию в OTA-реестре (SHA `459bce108822`), поэтому после исправления iOS/CocoaPods нужен **новый кандидат 98 на новом SHA**. Не подтверждайте старого кандидата 97. Если номер 98 уже использован в App Store Connect, выберите следующий свободный. Не путайте номер сборки со строкой версии `1.7.5`.

## 2. Создать и зарегистрировать Store-кандидата

Из `apps/mobile`:

```bash
pnpm ota:175:ios:store:prepare 98
```

Команда ничего не собирает и не публикует. Она сохраняет `ios-candidate.json` вне репозитория под `~/.config/gafus/ota/store-ios-175/<SHA>/`. В админке **Мобильные релизы → Нативные сборки → Регистрация нативной поставки** зарегистрируйте JSON из этого файла. Тип дистрибуции в нашем реестре должен быть **app-store** (в EAS-профиле он называется **store**). Запишите **настоящий server-issued `nativeReleaseId`** (UUID), не придумывайте его.

```bash
pnpm ota:175:ios:store:finalize <IOS_SERVER_NATIVE_RELEASE_UUID>
pnpm ota:175:ios:store:check
```

`finalize` создаёт неизменяемый `ios-native.json` и копирует публичный сертификат + публичный дескриптор в `.ota-certs/` (оба файла включены в EAS-архив строго через `.easignore`; остальные секреты остались исключены). `check` проверяет версию, адрес OTA, pinned certificate, channel, source SHA, clean main и UUID **без запуска сборки**.

## 3. Согласовать номер с EAS Remote

В `apps/mobile`:

```bash
npx eas-cli@latest build:version:get --platform ios --profile ota-175-ios-store --json --non-interactive
```

Номер `buildNumber` должен совпадать с зарегистрированным (для нового кандидата **98**). Если другой — **до сборки** выполнить интерактивное:

```bash
npx eas-cli@latest build:version:set --platform ios
```

Выставить ровно зарегистрированный номер. Эта операция меняет номер **в EAS**, не отправляет релиз в App Store. Убедитесь в том, что номер свободен в App Store Connect. Никогда не включайте `autoIncrement` для этого профиля: он разорвет соответствие с нативным реестром.

## 4. Запустить сборку (выполняет пользователь)

```bash
cd /Users/asmtv1/Desktop/gafus-refactor/apps/mobile
set -a
source ../../.env
set +a
# Expo Doctor / новые EAS CLI требуют Node >=22.13, он установлен на Mac.
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm ota:175:ios:store:build
```

Скрипт проверит текущий EAS remote buildNumber, повторно сгенерирует iOS CNG с нужной конфигурацией, проверит native `Expo.plist` и запустит `npx --yes eas-cli@latest build --platform ios --profile ota-175-ios-store --local --clear-cache --output ...`. Затем самостоятельно распакует полученный `.ipa` и **прервётся с ошибкой**, если обнаружит неверную версию, номер, OTA URL, runtime, channel, fingerprint или сертификат OTA. Также проверяет Apple code signing и App Store provisioning profile. При успехе выдаст путь к IPA и SHA-256; не отправляет его никуда.

Для самостоятельной проверки ранее собранного IPA:

```bash
pnpm ota:175:ios:store:verify-ipa /ABSOLUTE/PATH/TO/FILE.ipa
```

Сертификат OTA — **публичный ключ проверки manifest**, это не Apple Distribution credential. EAS local build должен иметь доступ к аккаунту Expo и валидным Apple Distribution certificate/provisioning для `ru.gafus.app` (профиль Store, не ad hoc). Если credentials недоступны, сборку необходимо остановить; не подменять её internal provisioning.

## 5. После сборки

Установите/передайте Store-IPA через TestFlight, проверьте на реальном iPhone вход, StoreKit, холодный старт, переходы, OTA-проверки и подпись полученного обновления. Только затем независимо зарегистрируйте подтверждение реального signed IPA (`prepare-self-hosted-native-verification.mjs`) и проверьте состояние нативного релиза в админке. **Не отмечать** `physicalDeviceVerified` до реальной проверки. После регистрации verified binary можно подготовить подписанное JS-only OTA через защищённый GitHub workflow. Существующий охват OTA (`admin`, `asmtv1`) не расширять без отдельного решения.

## Важные ограничения

- Нельзя запустить `prepare` или `check` на грязном рабочем дереве — это не ошибка скрипта, а инвариант подписи release fingerprint.
- Нельзя обойти обвязку командой старого EAS-профиля: он использует Expo OTA, а remote build number может расходиться с signed descriptor.
- Не менять `app.json`, `eas.json`, нативные плагины, lockfile или сертификат после регистрации кандидата — это новый native fingerprint.
- Команда `check` не утверждает, что IPA создан или подписан; реальную проверку архива даёт только `verify-ipa`/успешный `build`, а установку/StoreKit проверяют отдельно на устройстве.
