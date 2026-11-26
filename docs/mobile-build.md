# GAFUS Mobile Builder

Из корня проекта: `pnpm mobile:build`. Обычный Terminal, меню с номерами.

- Google Play: подписанный AAB, только Google Play Billing.
- RuStore: подписанный APK, стандартный платёжный профиль (без ЮKassa/промокодов; отдельное OTA после QA).
- App Store/TestFlight: подписанный IPA через локальный EAS; проверка номера и App Store provisioning.
- Android/iOS Debug: Expo Run с выбором подключённого устройства или эмулятора/симулятора; production API, тестовая реклама, без production OTA.

Релизы: выбирайте чистый Git worktree. Меню предлагает подготовить новый native-кандидат, затем в админке зарегистрировать без активации и вернуть UUID в действие «Завершить регистрацию кандидата». Android versionCode берётся из app.json; iOS build number вводится после проверки App Store Connect. Сверяйте свободный номер в магазине. Для iOS при remote version source EAS номер должен совпадать; скрипт сам его не меняет.

Публичные переменные читаются из корневого .env через Expo, секреты из .env не копируются. Версия, адрес API, debug/test-mode и стандартный платёжный профиль переопределяются явным образом. Android credentials читаются из существующего apps/mobile/credentials.json; ключи не копируются. iOS использует существующие Apple/EAS credentials. Выход: ~/Desktop/GAFUS-builds. Не пушит, не загружает в магазины, не активирует OTA.

`pnpm mobile:build --list` — список дескрипторов.
`pnpm mobile:build --check play /path/to/worktree /path/to/native.json` — без сборки; проверяет source SHA, fingerprint, ENV, OTA и Android key.
`node --test scripts/mobile-build.test.mjs` — контрактные тесты.

Старые сборочные скрипты пока сохранены: они нужны отдельным CI и историческим release worktree. Не запускайте параллельно несколько сборок. Перед первым выпуском каждого нового маршрута требуется проверка итогового артефакта и QA на устройстве.
