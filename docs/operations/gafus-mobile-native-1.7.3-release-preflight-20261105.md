# GAFUS Mobile — нативный магазинный релиз **1.7.3** (кандидат)

**Владелец:** 05.11.2026 решил собрать в один релиз важные изменения, требующие повторной публикации iOS/Android. **Работа только в локальном** `/Users/asmtv1/Desktop/gafus-refactor`. Ни production, ни Cloud.ru, ни App Store/Android-магазины, ни GitHub secrets/vars, ни push/deploy при подготовке не менялись.

## Почему нужен новый бинарник

| Изменение | Нужен новый магазинный бинарник? | Что сделано |
|---|---|---|
| Нативное сжатие видео/медиа `react-native-compressor` | **Да**, новый нативный модуль нельзя добавить OTA | Зависимость уже добавлена параллельной задачей, источник `apps/mobile/src/shared/lib/media/prepareUploadVideo720.ts`. Сборочный preflight требует модуль; новый Android AAB дополнительно должен содержать native `CompressorModule` / `CompressorPackage` в DEX (либо явную R8 mapping). Старый локальный AAB от 04.11.2026 его **не содержит**, негативный тест подтверждён |
| Смена совместимости EAS Update | **Да**: смена `sdkVersion` на `appVersion` должна совпадать с новой сборкой | `apps/mobile/app.json`: `runtimeVersion.policy=appVersion`. При версии **1.7.3** старые сборки с `exposdk:55.0.0` больше не должны получать несовместимые с ними OTA от новой линии |
| Версия Android/iOS и аналитика AppTracer | **Да**, изменение native marketing version | `apps/mobile/app.json` и `package.json` = **1.7.3**; `apps/mobile/app.config.js` берёт `extra.appVersion` **только** из реальной версии приложения, не из устаревшей `EXPO_PUBLIC_APP_VERSION` (наблюдалось расхождение 1.7.1 vs 1.7.3) |
| Android системный predictive Back | **Да**, изменение `android:enableOnBackInvokedCallback` | `android.predictiveBackGestureEnabled=true`; QA на Android 13+ с вложенными экранами, модальными окнами и медиапросмотром обязателен |
| Android keyboard native configuration | **Да** для гарантированной настройки новых сборок | `android.softwareKeyboardLayoutMode=resize`; старый AndroidManifest уже содержит `adjustResize`. При этом клавиатуру внутри конкретного чата/моментов/вопросов дополнительно исправляет **React Native layout**, нативный флаг сам по себе не гарантирует отсутствие перекрытия |
| Splash: собака должна помещаться целиком | **Да** | Соседняя задача уже заменила `cover` на `contain` во всех Expo splash-настройках; наша проверка не допускает возврата `cover` |
| Новые свайпы, экраны, настройки качества и логика Chat2 proxy-only | **Обычно нет**, если все необходимые нативные библиотеки уже установлены; **но входит в 1.7.3** | Новые экраны/JS-код от параллельных задач сохраняются; *старый Chat2 room JWT не поддерживается*, старые сборки должны быть принудительно обновлены |

## Автоматические проверки, реализованные сейчас

- `node apps/mobile/scripts/verify-native-release.mjs` — только чтение исходников, проверка номера 1.7.3+ (старый 1.7.2 запрещён), пакета, `appVersion` вместо `sdkVersion`, нативных компонентов compressor/gesture, splash, Android back/keyboard, production EAS profile и проекта Updates. Также включён в `.github/workflows/ci-cd.yml` как блокирующий source-only gate со своими Node-тестами.
- `apps/mobile/app.config.js` дополнительно не позволит **любому** production `eas build`/`expo export` обойти `appVersion`/нужные настройки при оценке реального Expo config (даже если вызывается не через наш wrapper).
- `apps/mobile/scripts/build-android-production-local.mjs` запускает native preflight **перед** EAS, а после успешной новой локальной AAB сборки проверяет: (1) 16-KiB ELF PT_LOAD alignment каждого arm64/x86_64 `.so`; (2) наличие нативного react-native-compressor класса в DEX / R8 mapping. Если новый артефакт не найден или невалиден — возвращает ошибку, даже если EAS построил AAB. При отдельной команде EAS оператор обязан запустить обе проверки сам.
- Для оператора после получения нового AAB: `node apps/mobile/scripts/verify-android-aab-16k.mjs /absolute/path/new.aab` и `node apps/mobile/scripts/verify-android-aab-compressor.mjs /absolute/path/new.aab`. **ELF-only PASS не доказывает** совместимость с Google Play: отдельно проверить ZIP alignment через `bundletool dump config` / Play Console AAB explorer и поведение на Android 16-КиБ устройстве.
- `apps/mobile/scripts/publish-update-with-apptracer.mjs`: production OTA блокируется до фактической публикации **обеих** нативных сборок. Только после подтверждения публикации разрешено передавать `GAFUS_MOBILE_NATIVE_STORES_PUBLISHED=true` и `GAFUS_MOBILE_NATIVE_PUBLISHED_VERSION=1.7.3`. Версия должна совпадать с `appVersion` релиза. Preview OTA не требует production-store attestation, но **требует preview binary с совместимым runtime**.

## Порядок выпуска в магазины

1. Согласовать финальный набор параллельных изменений, закончить **E2E устройства**, особенно клиентскую перекодировку фото/видео, отмену загрузки, восстановление авторизации после обновления без переустановки, клавиатуру чатов/моментов/вопросов, открытие видео и свайпы на iPhone/Android. Не публиковать собранные ранее 1.7.2 AAB/IPA.
2. Собрать свежие **1.7.3** iOS/Android нативные бинарники. Проверить `react-native-compressor` именно на обоих устройствах: в текущем старом `ios/Podfile.lock` нет компрессора, и старый AAB его не содержит. Для iOS дополнительно `pod install`, проверка `OKTracer 1.5.2` и отсутствие старого 404; ни iOS build, ни новая Android AAB **в рамках этой подготовки не запускались**.
3. Подтвердить native bundle id/подписи, новую version code/build number, публикацию в обоих магазинах. `appVersion=1.7.3` нельзя считать опубликованной только потому, что его записали в исходники.
4. После публикации обеих платформ обновить server public `minimumSupportedVersion.ios` и `.android` **до реально опубликованных 1.7.3 (либо более новых)** и URL магазинов. Только после этого устанавливать Chat2 release vars `CHAT2_MOBILE_STORES_VERIFIED=true`, `CHAT2_MOBILE_IOS_MIN_VERSION`, `CHAT2_MOBILE_ANDROID_MIN_VERSION` на реальные значения и включать прокси при отдельном production cutover. Старые 1.7.2 приложения должны получить экран «Обновить приложение»; сервер Chat2 дополнительно возвращает 426 устаревшим версиям.
5. После явного подтверждения успешного релиза разрешать новые production OTA на runtime `1.7.3` и продолжать выпускать JS-only исправления без очередной магазинной версии. **При следующем добавлении/обновлении нативного модуля снова повышать версию магазина** и пересобирать бинарники.

## Локальные доказательства и ограничения

- `node --test apps/mobile/scripts/native-release-contract.test.mjs apps/mobile/scripts/android-aab-16k.test.mjs apps/mobile/scripts/android-aab-compressor.test.mjs`: **14/14 PASS** (8+4+2).
- Проверка реального Expo production config на синтетических (не production) AppTracer токенах: `version=1.7.3`, `extra.appVersion=1.7.3`, `runtimeVersion=appVersion`, Android `resize` + predictive Back — **PASS**.
- Native config plugins `withAppTracerNative`, `withExpo55ReactHost`, `withExpo55IosAppDelegate`: **18/18 PASS**; `pnpm --filter @gafus/mobile typecheck` — **PASS**.
- Старый локальный AAB 04.11: **60/60** 64-битных `.so` ELF PT_LOAD 16-КиБ выравнивание PASS; **отсутствие CompressorPackage** ожидаемо и доказано (checker exit 1). Этот AAB **не подходит** под новый pipeline.
- iOS 1.7.3 IPA, Android 1.7.3 AAB, проверка на настоящих телефонах и Play Console ZIP alignment **пока не выполнялись**. Результат **source review ready**, но **не Store Release Ready**.

Никаких пользовательских/production секретов, старых временных AAB/IPA, Docker-ресурсов и параллельных чужих изменений не удаляли.

## 05.11 — Дополнение: App Links / Universal Links в 1.7.3

Добавлены проверенные ссылки на публикации, вопросы, приватные чаты (только с API readGate), тренировки, `/moments` и `/reset-password`. Версия 1.7.3 должна получить новые Android intent filters и iOS Associated Domains **в бинарнике**, не через OTA. Подготовлены статические `/.well-known/apple-app-site-association` и `/.well-known/assetlinks.json` и exact no-SPA Nginx routes. **Порядок:** опубликовать эти JSON в веб-контейнер и проверить 4 production URL → после этого выпускать iOS IPA / Android AAB; для Google Play отдельно сверить App Signing SHA256. Добавлены source-only и post-build App Links release gates. Полное описание и доказательства: `docs/operations/gafus-app-links-universal-links-20261105.md`. Production-выкладка не производилась.
