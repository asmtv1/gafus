# Умная лента GAFUS: интеграционная и браузерная проверка

Локальная проверка 11.10.2026 через Desktop Commander, **без Codex и доступа к продакшен-данным**.

## Сборка и типы

- `pnpm --filter @gafus/core build` — PASS (tsc и расширение JS импортов).
- После исправления транспорта повторно успешно выполнены `@gafus/types build`, `@gafus/feed-server typecheck`, `@gafus/web typecheck`, `@gafus/mobile typecheck` (`ALL_POST_FIX_TYPECHECKS_OK`). Новый HTTP dispatcher test файл добавлен позже, отдельно запущен и пройден.

- `pnpm --filter @gafus/feed-server typecheck`, `@gafus/web typecheck`, `@gafus/worker typecheck`, `@gafus/mobile typecheck` — PASS после сборки Core перед дополнительными исправлениями транспорта.
- После добавления общей durable queue TypeScript Mobile — PASS. После финальных изменений в retryable-протоколе требуется повторный прогон зависимых пакетов.
- `pnpm exec vitest run packages/feed-server/src/index.test.ts` — 10/10 PASS.
- `pnpm exec vitest run packages/feed-server/src/smart-events.e2e.test.ts packages/feed-server/src/index.test.ts` — 14/14 PASS: настоящий HTTP dispatcher с fake Prisma/Redis, проверка валидного server-issued token, user/rank binding, отказа Redis с `retryable=true`, обязательного зарегистрированного впечатления перед dwell, запрет чужого actorId и сохранение идемпотентности. Без настоящей базы/продакшена.
- `pnpm exec vitest run packages/types/src/feed-telemetry-queue.test.ts` — 4/4 PASS.

## Web: реальный браузер

`pnpm --filter @gafus/web test:feed:telemetry-e2e`

Chrome headless (настоящий браузер) с **изолированным HTTP fixture-сервером**. Через esbuild загружаются **производственные** `observeFeedVisibility` и `FeedTelemetryQueue`, то есть браузер исполняет именно их, а не скопированные алгоритмы:

1. Выданная карточка становится видимой, сеть отключается, карточка уходит ниже viewport, накопленные impression+dwell остаются в очереди; после восстановления — по одному событию без дубликатов: **PASS**.
2. Отключённая сеть → отправка не завершилась → новая загрузка страницы с тем же browser storage → UUID сохранён и событие доставлено: **PASS**.
3. Реальная вкладка скрыта → нет qualified impression; возврат на вкладку возобновляет таймер и регистрирует событие: **PASS**.

Скрипт выводит `CHROME_FEED_E2E_PASSED`, создаёт HTTP-сервер на случайном loopback-порту и удаляет временную browser profile при выходе.

**Ограничение:** это E2E production visibility/queue в Chrome, но **не** авторизованный Next.js UI. Для полного UI E2E с лентой нужен тестовый пользователь и изолированный staging API.

## Mobile: общая JS-логика Android и iOS

`pnpm --filter @gafus/mobile exec vitest run src/features/feed/telemetry.test.ts`

Реальный модуль `mobileFeedTelemetry`, mock AsyncStorage и mock feedApi:

1. Потеря сети при flush из фонового состояния → UUID сохраняется → после подключения событие отправляется: **PASS**.
2. Dwell ждёт подтверждения impression и не отправляется, пока сеть отключена: **PASS**.
3. Холодный перезапуск JS runtime → AsyncStorage restore → повтор события с прежним UUID: **PASS**.

Отдельно протестирована платформенно-нейтральная очередь на два одновременных flush, Redis `retryable: true`, offline/online, TTL.

## Эмуляторы / ограничения

- Android AVD `Medium_Phone_API_36.1` загрузился через adb. Локальная `:app:assembleDebug` сначала обнаружила необходимость JDK 17 и `ANDROID_HOME`, затем в offline-режиме недостающие артефакты Maven. После настройки JDK 17, SDK и online-зависимостей задача прошла конфигурацию и начала сборку нативных CMake библиотек. Повтор с `-PreactNativeArchitectures=arm64-v8a` уменьшил объём сборки, но остановлен мною при снижении свободного дискового места до ~4 ГБ. APK не был сформирован, Android-эмулятор выключен. **Нативный UI E2E Android не завершён.**
- iOS: запущен симулятор iPhone 17 (iOS 26.2), установлен GAFUS `ru.gafus.app` 1.7.0(15). Приложение запускается. Управление Simulator через macOS `osascript` блокируется системным разрешением Accessibility (`-1728`), штатных XCUITest UI targets в текущем проекте нет. Установленный бинарник также не доказывает, что он содержит последние JS-изменения.
- Тестировать поток *внутри подписанной пользовательской ленты* в нативных приложениях без staging-пользователя, свежих installable builds и управления UI нельзя. Это остаётся отдельным acceptance gate, а не маскируется под PASS.

## Безопасность и чистота окружения

Тестовые события используют фиктивные postId/token/UUID, loopback HTTP, mock API; production DB, Redis и настоящие пользовательские события не изменяются. Новые флаги умной ленты остаются выключенными по умолчанию. Коммита и push в main не выполнялось.

## Дополнительный прогон через Desktop Commander (11.10.2026)

- Повторно выполнена полноценная сборка `@gafus/core`: **PASS**, TypeScript зависимых Feed Server / Web / Worker / Mobile: **PASS** до и после внедрения durable queue.
- HTTP dispatcher с проверкой реальной экспозиции покрыт новым `packages/feed-server/src/smart-events.e2e.test.ts`: **4/4 PASS**, вместе с 10 существующими HTTP-тестами **14/14 PASS**. Prisma и Redis изолированы моками.
- Приложен общий механизм очереди `packages/types/src/feed-telemetry-queue.ts`: offline/reconnect/restart/concurrent flush, в том числе `retryable:true` от сервера; unit **4/4 PASS**.
- Мобильный адаптер `apps/mobile/src/features/feed/telemetry.ts` и `telemetry.test.ts`: **3/3 PASS** с AsyncStorage, последовательностью impression→outcome и повтором UUID.
- Настоящий Chrome E2E из `apps/web/scripts/smart-feed-telemetry-e2e.mjs`: **3 сценария PASS** (offline, restore page, background tab), без настоящего авторизованного UI/API.
- Android AVD запустился, Android Gradle прошёл SDK/JDK17 и сборку Expo; новая попытка сборки только `arm64-v8a` остановлена из-за падения свободного дискового места приблизительно до 4 ГБ. Установки APK и native UI E2E не было; AVD остановлен.
- Дополнительный `expo export --platform ios/android` стартовал Metro и длительное сканирование файлов monorepo. Чтобы не перегружать Mac, процесс и его дочерние процессы остановлены; **bundle export не подтверждён**, временные export-папки удалены.
- iOS Simulator запускал уже установленный `ru.gafus.app` (старую debug-сборку), но автоматическое управление UI в macOS требует Accessibility. По нему нельзя подтвердить текущие JS-изменения.

**Итог:** интеграция TypeScript + сервер + Chrome + общая JS-логика мобильных приложений проверены; полноценные end-to-end UI-сценарии в новых Android/iOS сборках по-прежнему требуют ресурсов для нативной сборки, изолированного staging API и тестового пользователя. Продакшен и `main` не затрагивались.
