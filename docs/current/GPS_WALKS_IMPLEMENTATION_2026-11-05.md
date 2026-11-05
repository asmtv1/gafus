# GAFUS GPS-прогулки — локальная реализация и проверка 2026-11-05

## Текущий контроль выполнения — 05.11.2026, после 23:53 +04

- **Mobile full regression:** job `a5f9133bd89fb9e8e89bf21102164a00234e459a6d4d6531`, `exited/exit_code=0`, **2667 PASS, 1 SKIP, 0 FAIL**, 354 файла PASS и 1 SKIP. Финальный Mobile `tsc --noEmit` PASS.
- **Android:** job `9e5fd906c4b9e719450432ec97ea9988350209d9a9fa8153`, **`BUILD SUCCESSFUL`, exit 0**; Gradle реально выполнил `:expo-location:compileDebugKotlin` (после `expo.autolinking.android.buildFromSource=["expo-location"]`) и `:app:assembleDebug`. Готов локальный unsigned/debug `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~360 MiB), с патчем `widgetInitiated`. Не готов к Store как release/AAB.
- **iOS:** job `4e96e9e37baa627ec2de2716638b345026290ae87fcec800`, **`BUILD SUCCEEDED`, exit 0**. Внутри `Gafus.app/PlugIns/ExpoWidgetsTarget.appex` лежит настоящее WidgetKit расширение с bundle id `ru.gafus.app.ExpoWidgetsTarget`, point `com.apple.widgetkit-extension` и App Group `group.ru.gafus.app`. Исправляющий Expo config plugin `withDogWalkWidgetEmbed` делает Embed CodeSignOnCopy после Resources (три теста PASS, Xcode dependency cycle устранён). Это повторяемо через Expo config: плагин присутствует после `expo-widgets`.
- **iPhone 17 Simulator iOS 26.2:** `xcrun simctl install` **PASS**, пакет `ru.gafus.app` запущен (PID `97459`, exit 0), встроенный `.appex` обнаружен **в установленной копии**. Это smoke нативной установки, не functional GPS-тест. Simulator штатно остановлен после проверки.
- **Web/API/Prisma:** ранее пройденные Web 3142 PASS/6 SKIP, API 11/11 и PostgreSQL owner/idempotence/tombstone integration PASS **не прогонялись повторно без новых серверных изменений**.
- **Хранение/пространство:** после проверки iOS результат упакован в `/tmp/gafus-gps-ios-simulator-with-widget-20261105.zip` (64 MiB, архив валиден). Удалён **только созданный этой задачей** DerivedData `/tmp/gafus-gps-ios-widget-20261105` (~5.8 GiB), исходный проект и установленное simulator-приложение не тронуты; свободно ~11–12 GiB.
- **Android emulator smoke:** два подтверждённых отказа Android API 36 `PackageManager: Broken pipe (32)` после успешной передачи универсальной 360MiB APK и облегчённой ARM64 129MiB APK; оба `adb install --no-streaming` завершились `exit_code=224`. APK **не установлена и не запущена на Android**, хотя обе нативные Gradle-сборки PASSED. AVD не очищали/не перезаписывали: эмулятор штатно остановлен.
- **Открыто:** ни iOS cold-start/frozen AppIntent с мгновенным GPS, ни Android widget foreground location service при locked screen, ни GPS/шаги на физических телефонах **не подтверждены**. Потребуются две новые нативные подписанные сборки для устройств: OTA не может добавить native modules, а одинаковый `runtimeVersion=appVersion` в старых 1.7.3 потенциально небезопасен. Нового релиза/прод-деплоя не было.

---

## Границы

- Только `/Users/asmtv1/Desktop/gafus-refactor`, никакого production deploy.
- Бесплатные `expo-location` + `expo-task-manager`; MapLibre + OpenFreeMap напрямую.
- Отдельные серверы карт, платные SDK, PMTiles/наш CDN сейчас исключены. К CDN/PMTiles возвращаться не раньше февраля 2027.
- Предыдущая невыпущенная версия прогулок не требует обратной совместимости.

## Внесённые изменения (код, не полевое подтверждение)

1. Подключены зависимости Expo Location, TaskManager, SQLite, MapLibre React Native и MapLibre Web; config plugins и системные permissions.
2. Фоновая задача регистрируется на верхнем уровне и записывает GPS-точки в локальную WAL SQLite даже без React-экрана.
3. SQLite используется для владельчески разделённых журналов, активных GPS-сессий, исходных измерений, статуса фильтра, последовательностей и локальных курсоров синхронизации.
4. Переключение start/pause/resume/finish управляет GPS с физическим выключением на паузе/финише; новые сегменты не соединяются прямой линией.
5. Haversine, базовая проверка точности/скорости/времени, отбрасывание скачков; raw-измерения сохраняются для дальнейшей корректировки фильтра.
6. Статистика использует GPS-расстояние, когда есть достоверные измерения, иначе приблизительный шаговый расчёт.
7. Owner-only Hono API + Prisma PostgreSQL для пачек GPS-точек (до 200), курсорной выдачи, истории и удаления.
8. Идемпотентные GPS-пакеты по `(userId, walkClientId, seq)`; курсор подтверждения локально. Телефон приоритетный источник завершённых прогулок, сервер сохраняет маркеры удалений.
9. MapLibre + OpenFreeMap в мобильном экране и истории; Web `/walks` с owner session fence, картой и удалением маршрута.
10. Android-виджет обрабатывает действия через native click и headless JS. iOS-виджет использует настоящие AppIntent-кнопки с атомарной очередью App Group, однако немедленный GPS-start при выгруженном приложении остаётся без подтверждения.

## Подтверждённые проверки

- Mobile TypeScript: PASS.
- Web TypeScript: PASS; Web production bundle: PASS.
- Выбор URL картографического стиля OpenFreeMap проверен: `https://tiles.openfreemap.org/styles/liberty` HTTP 200 JSON.
- Mobile Expo TaskManager runtime: task imported from **actual `widget-entry.ts` before Expo Router**, guarded by registration unit test PASS (не является тестом ОС в фоне).
- iOS CocoaPods: `pod install` PASS, MapLibreReactNative 11.5.1 присутствует в lock, 189 pods установлены.
- Mounted Web history `/walks`: 2/2 PASS (owner request и GPS-метры без повторного суммирования шагов).
- Core build: PASS, API TypeScript: PASS.
- API прогулок: 11/11 tests PASS.
- Мобильные профильные тесты GPS/маршрутов/синхронизации/виджета: проходят; отдельно photo retry test 4/4 PASS после обновления устаревшего теста на отложенную загрузку.
- Expo iOS JS export: PASS (не является нативной сборкой).
- Prisma schema validate: PASS.
- Локальный PostgreSQL: обе GPS SQL-миграции проверены в отдельной схеме внутри транзакции с ROLLBACK — PASS; к основной локальной БД не применялись.
- **Реальный Core/Prisma E2E на отдельном временном PostgreSQL**: PASS. Выполнены создание `DogWalkRecord`, idempotent двух GPS-точек (дважды записанный пакет → 2 строки), owner/outsider изоляция, DELETE и запрет re-create после отложенной повторной синхронизации. Временная БД удалена; production не затронут.
- **Полная Mobile-регрессия 2026-11-05**: **2644 PASS / 1 SKIP / 0 FAIL** (350 файлов PASS, 1 SKIP). Устаревшая проверка Chat2 photo retry обновлена на текущий процесс подготовки до Send и S3-загрузки только после Send.
- **Полная Web-регрессия 2026-11-05**: **3142 PASS / 6 SKIP / 0 FAIL** (301 файл PASS, 1 SKIP). Тесты фиксированных размеров старого меню/роутера обновлены после добавления `/walks`.
- После полной Mobile-регрессии добавлены отдельные GPS lifecycle unit-тесты `walkGpsTask.test.ts` (**6/6 PASS**) и тест глобального импорта задачи (**1/1 PASS**). Обновлённая нативная конфигурация iOS требует дополнительной сборки.

## Исторический список рисков до завершения нативных сборок (см. актуальную матрицу ниже)

1. iOS **виджет с действиями без открытия приложения**. Текущий SDK `expo-widgets` выполняет AppIntent внутри widget extension; событие от него НЕ является исполнением GPS-команды в React Native-процессе, когда приложение закрыто. Нужен отдельный проверенный нативный обработчик или честный UX fallback, без фиктивных кнопок.
2. Измерить и настроить адаптивную точность и расход батареи при остановках, в движении, после долгого отсутствия сети; сейчас 5 м / Android ~5 с и высокая точность, iOS Core Location automatic pause + deferred updates. Интервалы не гарантированы; автоматическое восстановление после остановки требует реального iPhone-теста.
2а. Отдельное **время фактического движения** по GPS/датчикам ещё не рассчитывается; текущая `durationSeconds` — время активной прогулки **за вычетом ручных пауз**. Лейблы в истории исправлены на «без пауз», чтобы не выдавать время стояния за движение. Отдельную метрику нельзя принимать без полевой настройки движения и ложных остановок.
3. iOS `pod install` выполнен успешно; **Xcode Simulator build выполняется**, Android Gradle build и реальное выполнение фонового TaskManager ещё не подтверждены; одного Expo JS export недостаточно.
4. Проверить работу Android Foreground Service, фактическое поведение iOS Background Location, блокировку экрана, force-quit, переключение пользователей, отказ разрешений, отсутствие сети.
5. Полевой GPS-тест с эталонным маршрутом, измерением ошибки/батареи, фильтрацией ложных километров; на симуляторе это не подтвердить.
6. Полные Web/Mobile регрессии прошли (цифры выше), Core/Prisma owner-scoped E2E на временной локальной PostgreSQL тоже PASS. Для окончательной приёмки остаются E2E через реальный авторизованный мобильный HTTP-транспорт и финальная полная регрессия после нативных испытаний.
7. Воспроизвести реальные сценарии start/pause/resume/finish и проверить отсутствие коллизий JS/виджета при одновременной записи.
8. Перед релизом выполнить отдельно новую нативную сборку, согласовать развертывание миграций через существующий CI/CD, без автоматического деплоя.
9. **Критическая проверка OTA runtimeVersion**: у Mobile `runtimeVersion.policy=appVersion`. MapLibre/Expo Location/SQLite/TaskManager требуют **нового нативного бинарника**. Недопустимо публиковать этот JS как OTA на старую сборку с тем же `runtimeVersion` (например, ранее собранную 1.7.3 без этих модулей) — возможен краш при открытии прогулки. Перед релизом нужно назначить уникальный runtimeVersion/версию или подтвердить отсутствие старых бинарников с совпадающим runtimeVersion; проверить сценарии CI/CD и Store rollout. Сейчас версию самовольно не меняем.

## Ограничения платформ

- iOS/Android могут прекратить GPS после force-quit; гарантировать непрерывное отслеживание при системном завершении нельзя.
- Штатная Android виджетная кнопка работает через headless JS, при наличии разрешений; сценарии после принудительного закрытия требуют нативных испытаний.
- Отдельный картографический сервер и платные GPS SDK не допускаются.

## Дополнительные изменения после полной регрессии

- `widget-entry.ts` регистрирует Expo TaskManager до `expo-router/entry` (тест порядка регистрации PASS).
- `walkGpsMath.normalizeGpsBatch()` изолирует полностью нечисловые измерения (`NaN/Infinity`) перед SQLite-транзакцией, чтобы один повреждённый GPS-фикс не откатывал остальные. Конечные, но географически недопустимые координаты сохраняются в raw и помечаются `invalid`; отдельный тест — **7/7 PASS**.
- На экране прогулки есть повторное включение GPS после отказа в разрешениях, статус слабого сигнала и возможность повторить загрузку истории маршрута.
- iOS Core Location включает `pausesUpdatesAutomatically` и deferred updates для стационарной экономии; это **гипотеза для полевых испытаний**, не измеренный результат. Android уведомление сохраняется при заблокированном экране насколько позволяет Foreground Service.
- Технический URL стиль OpenFreeMap переключается одной конфигурационной переменной, собственные серверы карт/хранилище не реализованы.
- Добавлены mounted тесты Web истории и GPS lifecycle unit. Это НЕ заменяет нативные тесты.

## Дополнительный контроль нативных зависимостей и регрессий

- Повтор полного Web `pnpm --filter @gafus/web-vite test`: **3142 PASS / 6 SKIP / 0 FAIL**. Новый Web-экран истории отдельно 2/2 PASS.
- Android `expo export --platform android`: **PASS**, JS-бандл с MapLibre и Expo GPS создан в локальном `/tmp` (это **не** Gradle/AAB сборка).
- Новые тесты `walkGpsTask.test.ts`: **6/6 PASS**, проверены headless вызов SQLite, запрет старта без разрешений, настройки Android foreground notification, идемпотентный старт, порядок pause/stop и восстановление после ошибки.
- На локальном Mac `pod install --no-repo-update` первоначально упал из-за трёх дублированных `ExpoWidgetsTarget` и групп в **игнорируемом Git** `apps/mobile/ios/Gafus.xcodeproj` (`no parent for object DogWalk.swift`). Сохранён исходный проект `/tmp/gafus-pbxproj-pre-gps-normalization-20261105`; две лишние локальные цели удалены, сохранены одна рабочая цель и группа. `xcodebuild -list` подтвердил одну `ExpoWidgetsTarget`. После этого `pod install` завершился **PASS**, 189 Pods, включая MapLibreReactNative, ExpoLocation, ExpoTaskManager. Локальное исправление `ios/` **не входит в Git** (каталог игнорируется); требуется чистая проверка EAS prebuild перед релизом.
- Первая нативная сборка iOS Simulator `xcodebuild ... CODE_SIGNING_ALLOWED=NO` **прервана лимитом 20 минут (`SIGTERM`, `BUILD INTERRUPTED`)**. Компилировала сотни CocoaPods/две simulator-архитектуры, конкретной ошибки GPS-компонента до прерывания не выявлено; это **не PASS**. Промежуточная попытка с `-arch arm64` закончилась `xcodebuild: destination implies architecture`, ошибка аргумента команды (не код GAFUS). Корректный повтор для конкретного симулятора **iPhone 17** без явного `-arch`, с `ONLY_ACTIVE_ARCH=YES -jobs 4`, сохранённым DerivedData запущен как job `5eba3434a415c0114cc45a3b8dc108b2433a458099937695`; до `exited/exit_code=0` **не считать нативную сборку успешной**.
- Повтор полной Mobile-регрессии завершён: **2644 PASS / 1 SKIP / 0 FAIL**. После него локально 6/6 GPS lifecycle + 1/1 global task registration + 7/7 GPS math, включая защиту от `NaN/Infinity`. Под последующие косметические изменения требуется окончательная общая проверка.

Недоказанные сценарии: настоящий фон после блокировки экрана и force-quit, измерение батареи и GPS-погрешности на улице, Android native Gradle, прямые AppIntent действия iOS-виджета без запуска приложения, живое multi-device E2E.

## Контроль продолжения — подтверждено

- **Полная Mobile-регрессия повторена успешно:** `pnpm --filter @gafus/mobile test` — 351 test files PASS, 1 SKIP; **2650 tests PASS / 1 SKIP / 0 FAIL** (job `618a67def3abdf4b502353853459e9d46ef0628a63b63a3c`, exit 0).
- После этого добавлены 6 unit-тестов headless GPS-таска (`walkGpsTask.test.ts`) и исправлен transient SQLite init — кэш Promise сбрасывается при ошибке открытия БД. **Последние Mobile typecheck PASS и 22 адресных GPS-теста PASS**.
- Web тесты: полный повтор **3142 PASS / 6 SKIP / 0 FAIL**; Web GPS-представление отдельно 2/2 PASS.
- **iOS simulator native build №1: FAIL (exit 65)**. После успешного `pod install` с одной ExpoWidgetsTarget Xcode прошёл этапы многих Pod targets, но `RNScreens` не смог найти `<RCTRequired/RCTRequired.h>` и `<React/RCTComponent.h>`. Заголовки в каталоге Pods физически существуют. Это блокер нативной сборки, **не основание считать GPS нативно принятым**.
- **iOS native build №2:** инкрементальный `xcodebuild` с `-jobs 2` для проверки влияния порядка параллельной компиляции запущен в job `ff8b260aee7ec615220fd70a9a80708e41cf40f33cb3bed4`; результат до terminal job status НЕ объявлять PASS.
- Expo **Android JS export PASS**, но настоящая Android Gradle/AAB сборка отдельно ещё НЕ проверена.
- Действия iOS-виджета напрямую (без открытия приложения) остаются **НЕ РЕАЛИЗОВАНЫ**; сейчас это ссылки `gafus://walk`. Для этого понадобится проверенный Swift AppIntent + общий нативный контроллер/адаптер, и физическая проверка поведения CoreLocation при запуске из WidgetKit.
- Для полной приёмки остаются outdoor/device тесты GPS-точности и расхода батареи; фоновый режим под блокировкой, pause/finish, force-quit, процесс/сеть, user switching и честная обработка недоступного GPS. Идём без платных SDK и отдельного сервера карт.


## Сверка исходных 15 этапов — актуально после нативных сборок

**Правило статусов:** «реализован» — подтверждён кодом и локальными тестами; «нативно собран» — Gradle/Xcode `exit_code=0`; «функционально принят» — подтверждён фактический сценарий в ОС. Сборка и симулятор НЕ доказывают GPS на улице с заблокированным экраном.

| Этап | Состояние на 05.11.2026 | Что проверено и что осталось |
| --- | --- | --- |
| 01. Аудит прогулок | **Реализовано** | Унаследованные ограничения сняты, существующие шагомер/таймер/виджет и API сверены, доступ всем авторизованным (`walkAccess`). |
| 02. Единая модель состояния | **Реализовано, поле не принято** | `walkModel` и `walkStorage`, сценарии старт/пауза/продолжение/конец unit PASS; возможные гонки между экраном и виджетом требуют device-теста. |
| 03. `expo-location` + `expo-task-manager` | **Нативно собрано на обеих ОС** | Headless-регистрация до Expo Router, Android source-Kotlin compile + APK PASS; iOS Xcode PASS и установка/запуск на iPhone 17 Simulator PASS. Реальное получение GPS в фоне не проверено. |
| 04. GPS-фильтрация и расстояние | **Реализовано, поле не принято** | Исходные точки, нормализация `NaN/Infinity`, качество фикса, скачки, Haversine, сегменты и тесты PASS. Нужен эталонный уличный маршрут. |
| 05. Шагомер и время | **Реализовано, поле не принято** | Android нативный шагомер/Chronometer, iOS Pedometer, остановка подсчёта при паузе, unit PASS. Долгое отслеживание с экраном off не проверено. «Время движения» не приравнивать к времени прогулки без ручных пауз. |
| 06. SQLite, офлайн, локальные сегменты | **Реализовано, поле не принято** | WAL, owner-bound журналы, GPS-точки/сессии/курсоры и тесты PASS; офлайн-возобновление после force-quit на устройстве открыто. |
| 07. MapLibre + OpenFreeMap | **Нативно собрано; UI не принято** | Стиль OpenFreeMap/MapLibre (Web/Mobile), API стиля 200, Xcode/Gradle PASS; карта при реальном GPS и без сети не проверена. Отдельного tileserver и CDN/PMTiles нет. |
| 08. Фон, батарея, адаптивный GPS | **Реализовано; нативная приёмка открыта** | 4с/5м ходьба, 8с/10м медленно, 20с/25м стоянка, гистерезис/25с cooldown; Android патч `expo-location` собран из исходников, iOS Core Location background настроен. Измерить расход батареи, долгую паузу и возобновление при заблокированном экране. |
| 09. Управление виджетом | **Частично; ключевой остаток iOS** | Android native Widget + `widgetInitiated` FGS собраны, JS переходы PASS; iOS реальный AppIntent с тремя кнопками, durable App Group queue и native bridge собран, `.appex` включён в установленное приложение. **iOS не доказан немедленный запуск GPS из виджета, если React Native-процесс выгружен; не считать этот сценарий выполненным.** Android background widget FGS тоже проверить физически. |
| 10. PostgreSQL/API | **Локальный integration PASS** | Owner-only API, GPS batch ≤200, idempotent seq, недоступность чужого маршрута, tombstones, тест миграций с rollback PASS. Production миграции не выполнялись. |
| 11. Синхронизация с приоритетом телефона | **Реализовано, live E2E открыт** | Local-first + сервер, retries/cursors/удаления, unit/Prisma integration PASS. Нет проверки через реальную сеть с двумя телефонами и сменой владельца. |
| 12. Мобильный интерфейс | **Реализовано, UX на устройствах открыт** | `walk.tsx`, `walks.tsx`, `walk-route.tsx`, карта, ошибки/разрешения/повторы, история, счётчик; Mobile регрессия PASS. |
| 13. Web | **Автотесты и сборка PASS** | `/walks`, карта/история, owner-bound запросы, delete; Web 3142 PASS / 6 SKIP / 0 FAIL. Авторизованный реальный UX ещё проверить вручную. |
| 14. Разрешения и приватность | **Реализовано, поведение ОС открыто** | Owner fences, App Group owner binding, Android permissions в APK, iOS entitlements в апп/виджете, серверные ACL PASS. На устройствах проверить отказ, отзыв разрешений и logout в середине прогулки. |
| 15. Тесты, приёмка, релиз | **В процессе, публикация запрещена** | Mobile 2667 PASS/1 SKIP/0 FAIL; Web 3142 PASS/6 SKIP; iOS Debug Xcode PASS + установленный `.appex` + simulator launch PASS; Android Debug APK c Kotlin из source PASS; Prisma integration PASS. Остались физические телефоны, реальный GPS/виджет/fallback/батарея/force quit, окончательный авторизованный E2E и решение по OTA runtimeVersion. Без разрешения никаких миграций/деплоя/релиза. |

**Итог:** 12 этапов имеют основную кодовую реализацию и необходимые автоматические проверки; 08 и 09 требуют нативной проверки поведения и доработок по результатам; 15-й (полная приёмка/релиз) не закрыт. Из 15 этапов **ни один нельзя трактовать как согласие на production deploy**.

## Продолжение — адаптивный GPS и iOS AppIntent, 05.11.2026

### GPS адаптация (код)

- Добавлены `walkAdaptiveGps.ts` с тремя профилями: ходьба 4 с / 5 м (High), медленное движение 8 с / 10 м (Balanced), остановка 20 с / 25 м (Low). Это **ориентиры**, ОС не гарантирует частоту.
- GNSS скорость в м/с используется только при точности ≤30 м; переключение после устойчивого состояния: 12/20/45 секунд и 25 секунд cooldown, чтобы избежать постоянных перезапусков на коротких остановках собаки.
- Headless TaskManager сначала коммитит сырые GPS-точки в SQLite, затем **отдельно** меняет LocationTaskOptions; отказ адаптации не откатывает GPS.
- Настройка/кандидат хранятся в SQLite `gps_motion_policy`. На ручной паузе активная запись и профиль выключаются; при возобновлении новый сегмент.
- Патч `expo-location@55.1.15` для Android: разрешить reconfigure **уже запущенной foreground location task** из headless background. Новый foreground service из фона остаётся запрещённым (Android 12+). Патч подготовлен, `patch --dry-run` PASS; до применения и Android Kotlin-сборки **не принят**.
- Политика + Expo lifecycle: **13/13 unit PASS** (4 policy, 9 task). Полевой расход батареи, восстановление iOS после auto-pause — не измерены.

### Интерактивный iOS-виджет (код)

- `DogWalk.ios.tsx`: заменены ссылки на настоящие `<Button target="walk:start|pause|finish">`; UI приложения намеренно не открывается через URL.
- `patches/expo-widgets@55.0.20.patch`: `WidgetUserInteraction` исполняется через `ForegroundContinuableIntent` в процессе host app, пишет отдельные атомарные команды в App Group (`group.ru.gafus.app`). Холодный JS не блокирует сохранение команды.
- Новый native `ExpoWidgets` bridge читает/подтверждает команду; `iosWalkWidgetActions.ts` выполняет action с проверкой авторизации, шагомером, SQLite, GPS и синхронизацией. В случае неудачи SQLite команда не ACK и остаётся для повтора.
- Слушатель `WalkWidgetSessionSync` реагирует на widget events и на возвращение в приложение; JS обработка зависит от запуска/пробуждения основного процесса. Нельзя обещать мгновенный GPS после force-quit, пока сценарий не проверен на iPhone.
- `pnpm` patch и lockfile записаны. `patch --dry-run` и локальное применение Swift файлов PASS. Swift синтаксис и отдельный протокол `ForegroundContinuableIntent` typecheck PASS. Unit тесты JS обработчика 3/3 + native patch contract 2/2 PASS.
- **НЕ принят** без новой iOS native build после патча и реального нажатия в WidgetKit при выгруженном приложении. App Intent и живой Expo TaskManager могут иметь системные ограничения, когда основное приложение принудительно завершено.

### Сборки

- **iOS Simulator Debug до нового патча — успешно**: job `5eba3434a415c0114cc45a3b8dc108b2433a458099937695`, `exited/exit_code=0`, iPhone 17. После патча ExpoWidgets нужна инкрементальная повторная сборка.
- **Android APK Debug**: job `6ac2abcbedab260a89c874ae92389769d219e225f280bf06` компилирует все ABI; никакого подтверждённого APK/AAB до terminal exit 0 нет. После применения патча expo-location Kotlin понадобится повторная проверка.
- Реальные устройства к ADB не подключены; полевые проверки остаются вне возможности автоматической локальной компиляции.

### Подтверждение пакетов и сборки после изменений (22:55 +04)

- `pnpm install --offline --ignore-scripts --frozen-lockfile` **exit 0**: оба патча `expo-location@55.1.15` и `expo-widgets@55.0.20` применены автоматически из `patches/`, подтверждены по исходникам в `node_modules`; после новой установки патчи не теряются.
- **Нативный Android Debug APK до патча адаптации: BUILD SUCCESSFUL**, job `6ac2abcbedab260a89c874ae92389769d219e225f280bf06`, `exit_code=0`, собран `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (353 MiB). Это реальная Gradle/NDK сборка, не просто Expo JS export.
- **После патча** Android `:app:assembleDebug` выполняется в job `70a4e42cba5dfb5f7a14f9056dac0dfd076dadb0301bb716` — не объявлять новым PASS до exit 0.
- **iOS** предыдущая нативная Simulator Debug до интерактивного WidgetKit патча: job `5eba3434a415c0114cc45a3b8dc108b2433a458099937695` **exit 0 / BUILD SUCCEEDED**. Новая инкрементальная/полная сборка с `ForegroundContinuableIntent` обязательна и пока не запускалась.
- 19 профильных тестов адаптации и прямых команд iOS-виджета PASS; Swift синтаксис PASS, SDK iOS `ForegroundContinuableIntent` standalone typecheck PASS. Физические тесты iOS WidgetKit/Expo GPS ещё отсутствуют.
- Из-за нехватки диска освобождены только временные `DerivedData` неудачной и предыдущей успешной iOS-сборки. Логи подтверждения iOS BUILD SUCCEEDED и исходный репозиторий сохранены; под новую iOS-сборку потребуется свежий DerivedData.

### Возобновление 23:06–23:20 (+04), проверка фактической нативной компиляции

- **Обнаружен реальный регресс сборки iOS с новым WidgetKit AppIntent:** `xcodebuild` job `10c400a523b6e21ca928dfe7b23218b19d43956c09166573` завершился `BUILD FAILED`: Swift/Xcode 26 SDK помечает прямое `ForegroundContinuableIntent` как `unavailable`. Простой `swiftc -parse` этого не обнаруживал. Подтверждено Apple: новый API `AppIntent.supportedModes`; он доступен только начиная с iOS 26. Исправлено совместимым сочетанием `@available(iOS 26.0, *) static var supportedModes: IntentModes { .foreground(.dynamic) }` и `@available(*, deprecated) extension WidgetUserInteraction: ForegroundContinuableIntent {}` для систем до 26. Совместимость standalone Swift `-typecheck` с минимальной целью iOS 16 пройдена. Новый patch зафиксирован, установка `pnpm install --frozen-lockfile --offline` PASS. **Повтор полноценного Xcode build после этого исправления ещё нужен.**
- **Обнаружена маскировка Android патча Expo:** SDK 55 по умолчанию использует `expo-location` как prebuilt AAR `host.exp.exponent:expo.modules.location:55.1.15`; поэтому предыдущий Debug APK c `BUILD SUCCESSFUL` НЕ включает изменения Kotlin из `patches/expo-location@55.1.15.patch`! Для фактической сборки патча добавлен `expo.autolinking.android.buildFromSource: ["expo-location"]` в `apps/mobile/package.json`. Команда `./gradlew projects --offline` теперь подтверждает `Project ':expo-location'` с exit 0. Нельзя считать patched APK принятым пока `:expo-location:compileDebugKotlin` и последующий `:app:assembleDebug` не дадут `exit 0`.
- Первый Kotlin compile из source с `--offline` остановился на **отсутствующем в кэше** `androidx.fragment:fragment:1.0.0`; файл существует на Google Maven (`HTTP 200`). Запущена online-компиляция `:expo-location:compileDebugKotlin` job `1b4ec4091eea9537391fd27f5d8cb997d4701e160ff3da8f`. Это локальный build, production не трогает.
- Ограничение iOS/Android: AppIntent может выполняться в процессе хост-приложения без открытия UI (Apple WidgetKit), но cold-start React Native и фоновый вызов Expo Location не гарантируются после force quit. Пока AppIntent сохраняет команды в App Group и отправляет native event; React обработчик извлекает команду при готовом авторизованном приложении. **Не объявлять подтверждённым старт GPS сразу после нажатия виджета на выгруженном iPhone** без реального теста.

### Исправление Expo SDK 55 prebuilt и iOS 26, результат 23:20 (+04)

- Android: команда `./gradlew projects --offline` теперь показывает `Project ':expo-location'` (exit 0). После получения отсутствовавшего бесплатного артефакта Google Maven `androidx.fragment:fragment:1.0.0`, `:expo-location:compileDebugKotlin` **PASS** job `1b4ec4091eea9537391fd27f5d8cb997d4701e160ff3da8f` (exit 0, компилировался реальный `LocationModule.kt` из патченного `node_modules`). Затем `:app:assembleDebug --offline` **PASS** job `145f2ed1152d71a1fa1f1eae04af60665c07dbb8828a442c` (exit 0). Это подтверждает именно конечный Android Debug APK с нашим исходным Kotlin; полевые сценарии ещё не подтверждены.
- iOS: после ошибки компиляции с iOS SDK 26 исправлен App Intent: `AppIntent.supportedModes = .foreground(.dynamic)` с `@available(iOS 26.0, *)`, а `@available(*, deprecated) extension ...: ForegroundContinuableIntent {}` сохраняет совместимость с iOS до 26. `swiftc -typecheck -target arm64-apple-ios16.0-simulator` на минимальном прототипе — PASS. ExpoWidgets patch установлен из `pnpm-lock.yaml`, `pod install --no-repo-update` PASS (189 pods). **Полная повторная iOS Debug simulator сборка после исправления запущена** в job `ae4e2756fdd06d0d4a17de8749a934ec54d6e2958385688b`; не считать PASS до выхода с exit 0.
- Контрактные тесты защищают оба механизма от регрессий: `expo.autolinking.android.buildFromSource` и наличие iOS 26 `supportedModes`; 7/7 PASS. Нативная работа виджета при заблокированном/закрытом iPhone всё ещё нуждается в испытании, потому что Swift-код и JS-очередь могут запускаться в разных процессах/моментах.

### Дополнение: прямой Android-виджет и разрешения ОС (23:23 +04)

- В официальной документации Android `App widget` является исключением для старта foreground-service из фона после **реального действия пользователя**; для `location` при Android 14+ необходимо заранее иметь разрешение `ACCESS_BACKGROUND_LOCATION`, иначе доступ к координатам может быть запрещён. Наша APK-манифестация содержит `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `ACTIVITY_RECOGNITION` (проверено `aapt dump permissions`). Разрешения нельзя получить из фонового виджета, их нужно выдать в приложении.
- Патч `expo-location@55.1.15` дополнен `LocationTaskOptions.widgetInitiated` и проверками в `LocationModule` и `LocationTaskConsumer`. На обычный фоновый запуск запрет сохраняется; пользовательское событие Android Widget вызывает `startWalkGps(ownerId,walkId,true)` и запускает нативный Expo FGS при соблюдении системного исключения, без собственного GPS-движка. Проверка на физическом Android 12/14+/targetSdk36 остаётся обязательной: ОС сама может отказать после истечения окна пользовательского действия или при отозванном разрешении.
- Тесты Expo GPS + Android Widget + native policy contract: **18/18 PASS**. Патч для Kotlin **обновлён после** предыдущей успешной APK-сборки; нужен новый `pnpm install --frozen-lockfile`, `:expo-location:compileDebugKotlin` и APK Debug после обновления, прежде чем называть Android прямой widget GPS Start принятым.
- Swift iOS App Intent: `supportedModes = .foreground(.dynamic)` на iOS26, совместимость с более ранними iOS через аннотированную deprecated conformance. Актуальная проверка `iOS simulator build` ещё выполняется. iOS WidgetKit позволяет интерактивные App Intents без открытия UI, но не гарантирует загрузку React Native в процессе после force quit; нативный fallback сохраняет команды и JS выполняет их при наличии живого/вновь запущенного приложения.

### Xcode 26: отказ от недоступного старого протокола (23:29 +04)

- Попытка `xcodebuild` job `ae4e2756fdd06d0d4a17de8749a934ec54d6e2958385688b` завершилась с **exit_code=65**, причина `ForegroundContinuableIntent explicitly marked unavailable`, несмотря на `@available(*, deprecated)` в extension. Это подтверждение компилятором, а не предположение по документации. Старый протокол полностью исключён из патча, теперь `WidgetUserInteraction: AppIntent` + `@available(iOS 26.0, *) static var supportedModes: IntentModes { .foreground(.dynamic) }`. На iOS 17–25 AppIntent может выполняться в Widget extension, поэтому App Group сохраняет команду и дальнейшая обработка через RN зависит от запуска приложения; **немедленный GPS с полностью выгруженным приложением на этих системах не подтверждён**.
- Актуальная схема патча прошла `pnpm install --frozen-lockfile --offline` и `pod install --no-repo-update` (189 pods). Новая Xcode Debug сборка job `02bf1b86f6df1258e813cbc0d531a8dc3eaad0bab43fcbda` выполняется, статус до конца работы — **UNVERIFIED**. Swift `AppIntent.supportedModes` официально введён в iOS 26; компиляция предшествующего протокола этим Xcode запрещена.
- Проверка полной последовательности iOS команд `Старт→Пауза→Продолжить→Конец` в одном файло-подобном command drain: **PASS**, одна завершённая прогулка, два native start и два stop, 60 шагов (2 сегмента по 30), GPS 125 м. `Mobile typecheck` PASS после исправления типизации нового теста.

### Финальная матрица испытаний на физических телефонах — до публикации

**Подготовка.** Установить новую нативную сборку GAFUS 1.7.3 (не OTA; новые Expo Location, SQLite, MapLibre и WidgetKit AppIntent требуют бинарную сборку). Войти в реальный разрешённый аккаунт, включить GPS телефона, выдать разрешение на геолокацию **всегда** и доступ к физической активности, добавить единственный виджет прогулки на главный экран. Для Android подтвердить постоянное уведомление при активной прогулке. Проверить iOS >=17; отдельно тест iOS 26 для `supportedModes`.

1. Открыть «Прогулки» и нажать «Старт»; пройти известный участок 150–300 м на улице, проверить карту/первые точки, время, шаги и метры.
2. Продолжить движение после блокировки экрана 5–10 мин, затем развернуть приложение; маршрут должен продолжиться без разрыва, время не обнуляется.
3. Проверить короткие остановки собаки, медленный шаг и обычную ходьбу: GPS переключает профили с cooldown, не добавляет фиктивные метры стоя на месте. Сравнить батарею до/после 30-минутного маршрута (не заявлять экономию без фактических измерений).
4. Нажать **Пауза** в приложении, проверить нулевую запись новых GPS-точек и неизменные метры во время паузы; **Продолжить** и проверить новый сегмент без прямой линии через паузу.
5. Нажать **Старт/Пауза/Продолжить/Конец прямо в Android-виджете**, не открывая GAFUS: проверить запуск/остановку Android foreground notification и GPS; отдельно разрешения Android 12/14/16. Если ОС откажет (SecurityException/ForegroundServiceStartNotAllowed), зафиксировать точный Logcat и не объявлять сценарий PASS.
6. Нажать **Старт/Пауза/Продолжить/Конец прямо в iOS-виджете**, когда GAFUS свёрнут, а затем когда процесс выгружен; должны отсутствовать deep link/open app UI, команда не должна теряться. На iOS 17–25 очередь App Group может ждать загрузки основного JS; это явный остаток без подтверждённого нативного мгновенного GPS.
7. Отключить интернет во время прогулки и после финиша: SQLite продолжает писать точки. Вернуть интернет — синхронизировать один маршрут без дублей, открыть его на Web под тем же аккаунтом.
8. Удалить прогулку на Web и выполнить отложенную синхронизацию со старого устройства: удалённый маршрут не должен воскреснуть. Проверить, что второй пользователь не получает чужие точки.
9. Отозвать GPS/движение, выключить системную геолокацию, сменить пользователя и выполнить logout в середине прогулки: показать явную ошибку и прекратить приватный трекинг; виджет не должен запускать прогулку прошлого аккаунта.
10. Принудительно завершить приложение на обоих ОС, восстановить его, проверить корректный флаг неполноты данных и отсутствие ложного обещания непрерывной записи там, где ОС запрещает восстановление фоновой задачи.

**Критерий закрытия:** обе финальные **патченные** нативные сборки успешны, проходят тесты переходов, физические сценарии без критических ошибок, AppIntent и Android widget GPS Start действительно реагируют на нажатие без перехода в приложение. До этого весь план отмечать **IN PROGRESS**, не деплоить production и не выпускать в сторы.

### Критическая проверка встраивания iOS WidgetKit (23:40 +04)

- Хотя `xcodebuild` job `02bf1b86f6df1258e813cbc0d531a8dc3eaad0bab43fcbda` завершился **exit 0**, в `Gafus.app` не было `PlugIns/ExpoWidgetsTarget.appex`. Была только отдельно скомпилированная `Build/Products/.../ExpoWidgetsTarget.appex`. Причина — Expo SDK55 создаёт две пустые PBXCopyFilesBuildPhase `Embed Foundation Extensions` и сам виджет target, но не помещает `ExpoWidgetsTarget.appex` в copy-phase приложения. То есть старый `BUILD SUCCEEDED` не доказывал доставку виджета на устройство.
- Добавлен `apps/mobile/plugins/withDogWalkWidgetEmbed.js` + `withDogWalkWidgetEmbed.test.cjs` (3/3 PASS), зарегистрирован после `expo-widgets` в `apps/mobile/app.json`. Он находит виджет product reference, добавляет `PBXBuildFile` с `RemoveHeadersOnCopy,CodeSignOnCopy`, кладёт в PlugIns `dstSubfolderSpec=13`, защищает от повторного добавления. При ошибке конфигурации бросает исключение, а не создаёт фиктивно «успешную» сборку.
- Первая сборка с встраиванием job `259b58b20383fe1090d36559345b60098f288b6f343d06ee` закончилась **exit 65** (`Cycle inside Gafus`), потому что copy-phase располагалась после `[AppTracer] Upload dSYM`, а dSYM через Info.plist зависела от embed .appex. Исправлен порядок: phase вставлена **после Resources, до Bundle RN/AppTracer/dSYM**, чтобы устранить цикл.
- Повторная сборка job `4e96e9e37baa627ec2de2716638b345026290ae87fcec800` — **exit 0 / BUILD SUCCEEDED**. Проверено физическое наличие `Gafus.app/PlugIns/ExpoWidgetsTarget.appex`; plist расширения: `CFBundleIdentifier=ru.gafus.app.ExpoWidgetsTarget`, `NSExtensionPointIdentifier=com.apple.widgetkit-extension`, App Group `group.ru.gafus.app` указан в обоих entitlements. **Это подтверждённая нативная iOS Simulator сборка с реально встроенным WidgetKit.** Пользовательский сценарий нажатия на виджет и GPS ещё не принят без запуска на устройстве.

### Последний Android-патч (в работе)

- После успешного Android APK с `expo-location` from source добавлен изолированный `widgetInitiated` в `LocationTaskOptions`, `LocationModule`, `LocationTaskConsumer` для законного Android Foreground Service старта по нажатию на виджет из фона. Обычные background launches и запросы системных разрешений из виджета остаются запрещены. Запускающий JavaScript обработчик `androidWalkWidgetActions` передаёт третий параметр `true` только для реального нажатия. Контрактные и unit-тесты PASS.
- Финальная APK-сборка именно **после** этого последнего патча запущена job `9e5fd906c4b9e719450432ec97ea9988350209d9a9fa8153`, пока не подтвердить `exit_code=0` — оставаться `IN PROGRESS`.

### Продолжение после Mobile 2667 PASS — проверка платформ, Android Emulator и реальный предел iOS WidgetKit

- Expo config (`expo config --json`) **exit 0**: версия 1.7.3; индекс плагина `expo-widgets` 22, `./plugins/withDogWalkWidgetEmbed` 28, порядок корректный. Проверена установленная копия GAFUS в `iPhone 17 Simulator`: `xcrun simctl install` exit 0; `simctl get_app_container` выдаёт bundle; в bundle есть `PlugIns/ExpoWidgetsTarget.appex`; `simctl launch ru.gafus.app` exit 0, PID 97459. Симулятор после smoke штатно выключен. **Это не доказывает обработку нажатий WidgetKit в фоне.**
- **Подтверждение ограничения Apple** по официальным WidgetKit/AppIntents/Core Location: обычный `AppIntent` исполняется по умолчанию в widget extension — отдельном недолговечном процессе, который не может поддерживать непрерывную GPS-прогулку. `supportedModes=.foreground(.dynamic)` — только запрос на режим, не гарантия запуска React. `ForegroundContinuableIntent` помечен `unavailable` в SDK26.2 (реальная Xcode ошибка). Новый API `allowedExecutionTargets: IntentExecutionTargets { .main }` описан Apple, но установленный Swift SDK26.2 его **не содержит**: `swiftc -typecheck -target arm64-apple-ios16.0-simulator` → `cannot find type 'IntentExecutionTargets' in scope` (проверено `/tmp/gafus_ios26_intent_execution_target_check.log`). Слепо внедрять недоступный API в зелёную iOS сборку нельзя. Реализованный максимально близкий вариант — настоящие интерактивные кнопки без `Link`, атомарное сохранение команд в App Group и выполнение/ACK из авторизованного main-app RN при его доступности. **Немедленный старт GPS из холодного виджета не принят**, явно возможна задержка до запуска основного приложения.
- **Android Emulator API36/arm64:** `Medium_Phone_API_36.1` успешно прошёл boot (`sys.boot_completed=1`), ABI `arm64-v8a`, `/data` свободно ~3.5 GiB. Установка универсального 360 MiB Debug APK завершилась неуспешно: streaming install превысил 90с; `adb install --no-streaming -r` успешно передал 376,974,892 байта, но Android PackageManager сообщил `cmd: Failure calling service package: Broken pipe (32)`, job `462a4d7334840c69b14877de3e31d2ee92dd207195a46294` `exit_code=224`. Системный `service check package` позже показывает сервис на месте. Это сбой **эмуляторной установки** (в условиях Android 16/2GiB RAM), а не ошибка Kotlin/Gradle — обе native сборки PASS. Нет доказанного Android launch/emulated GPS. Эмулятор штатно закрыт через `adb emu kill` без `-wipe-data`.
- **Оптимизация тестовой APK:** оригинальный Debug содержит четыре ABI (arm64 82.6MiB .so, armeabi-v7a 50.9MiB, x86 84.9MiB, x86_64 87.9MiB). Запущена локальная сборка Debug `-PreactNativeArchitectures=arm64-v8a` (job `9ab86a95e3a735a43dbce7aa32722e33604ab9c674bc34a4`) для уменьшения пакета и проверки установки. До завершения job результат не считать PASS.
- Перед реальными устройствами нужны подписанные **device** сборки iOS/Android: текущий iOS Debug app — `iphonesimulator` с `CODE_SIGNING_ALLOWED=NO` и НЕ устанавливается на физический iPhone; Android Debug APK предназначен для тестов/эмулятора, а не Play/RuStore. OTA не добавляет нативный код. Пользователю предстоит установить device builds, разрешить location Always/Activity, проверить старт/паузу/возобновление/конец, замок экрана, force-quit, offline/синхронизацию и точность/батарею по матрице выше.

### Дополнительная проверка ARM64-only Android Debug (06.11.2026 00:10 +04)

- Gradle `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a --offline` job `9ab86a95e3a735a43dbce7aa32722e33604ab9c674bc34a4` **exited/exit_code=0, BUILD SUCCESSFUL (1m17s)**. `:expo-location:compileDebugKotlin` остаётся включённым из локальных изменённых исходников (`UP-TO-DATE` после предыдущей полной компиляции). Пакет сохранён локально в `/tmp/gafus-gps-android-arm64-debug-20261106.apk` (135,072,139 байт = 128.8 MiB); он содержит native библиотеки **только `arm64-v8a`** (34 .so / 82.6MiB), в отличие от 4-ABI Debug (~360 MiB).
- Проверка `aapt dump badging/permissions` PASS: `ru.gafus.app`, `versionName=1.7.3`, targetSdk=36, ARM64, `ACCESS_FINE/COARSE/BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `ACTIVITY_RECOGNITION`. Локальный **Debug** имеет `versionCode=1`, потому что `apps/mobile/app.json` не задаёт локальный Android versionCode, а `eas.json` использует **remote appVersionSource** и production `autoIncrement`; это не утверждение о будущем EAS store versionCode. Перед release проверять remote версии отдельно.
- Эмулятор API36 arm64 был вновь загружен **с 2 GiB RAM**, без snapshot, boot job `d613f2cc5215c8e303ee89535d3b772fa0d79d801d3f1dd5`, `exit_code=0`; `sys.boot_completed=1`. Установка меньшей APK `adb install --no-streaming -r` запущена job `804e1763155eaefce7138b32169b657d11f5f40f891f4f33`, push **135,072,139 bytes / 9.983 s PASS**, итог установки и Android launch до окончательного результата job **не заявлять**.

### Итоговая приёмка текущей сессии — 06.11.2026 00:17 +04

- **Android:** универсальный Debug APK `:app:assembleDebug` job `9e5fd906c4b9e719450432ec97ea9988350209d9a9fa8153` PASS, а ARM64-only Debug APK job `9ab86a95e3a735a43dbce7aa32722e33604ab9c674bc34a4` PASS. ARM64 файл `/tmp/gafus-gps-android-arm64-debug-20261106.apk` (128.8 MiB) проверен `aapt` и SHA-256 `f81142465a3201667a0c0dc9594c3b2511aaed0622c64aa68d83e6deee6c2a87`.
- **Android emulator:** два запуска AVD API36/arm64 с 1.5 и 2GiB RAM успешно загрузились (`sys.boot_completed=1`), однако оба `adb install` после успешного push упали с `cmd: Failure calling service package: Broken pipe (32)`: job `462a4d7334840c69b14877de3e31d2ee92dd207195a46294` exit 224 и job `804e1763155eaefce7138b32169b657d11f5f40f891f4f33` exit 224. `pm path ru.gafus.app` пуст; приложение в эмуляторе **не запущено**. Проблема воспроизводится независимо от размера/ABI APK; исходная Gradle/Kotlin компиляция успешна. AVD остановлен `adb emu kill`, без удаления пользовательских данных. Нельзя утверждать, что в нём проверено выполнение фонового GPS/виджета.
- **iOS:** Xcode native Debug iPhone17 Simulator **PASS**, расширение WidgetKit находится и в собранном, и в установленном `.app`; `simctl launch ru.gafus.app` exit 0. Проверенная iOS Simulator app сохранена в `/tmp/gafus-gps-ios-simulator-with-widget-20261105.zip` (64MiB); физический device `.ipa` **не собирался**.
- **Полный Mobile:** 2667 PASS / 1 SKIP / 0 FAIL, 354 test files PASS / 1 SKIP; Web 3142 PASS / 6 SKIP / 0 FAIL, PostgreSQL owner/idempotence/deletion integration PASS. Последние правки после этих тестов — комментарий в iOS виджете и этот документ, исполняемый TS/нативный код не менялся.
- **Аппаратное окружение:** `adb devices` не показывает физический Android; `xcrun devicectl list devices` видит iPhone 12 только как `unavailable`. Для следующей приёмки требуются подключённые физические телефоны или выданные signed device builds, а также запуск проверок из матрицы выше, включая iOS cold WidgetKit/GPS, Android background FGS, ходьбу на улице, блокировку, восстановление, разрешения, точность/батарею и многодевайсную синхронизацию.
- **Релиз:** ни production API, ни Cloud.ru Jobs, ни Store/EAS production, ни миграции production не изменялись. Итоговый статус исходного плана 15 этапов — **IN PROGRESS**, не «всё завершено».
