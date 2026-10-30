# Проверка реализации чата

Дата: 2026-10-01. Изменения находятся в рабочем дереве. Production-флаг не включён.

## Пройдено

- Prisma validate/generate. Миграция применена в отдельной локальной БД `gafus_cynologist_chat_test_20261001`; schema diff пуст. SQL проверяет уникальность диалога клиента и ключа отправки. Production БД не использовалась.
- 174 теста core: тарифы, платежи, консультации, права чата, idempotency, вложения, webhook signature/deduplication, отсутствие приватного текста в inbox, сохранение серии напоминаний и её закрытие по read state.
- 14 исходных тестов consultation-shared: телефон, анкета, представление консультаций. Повторные тесты из dist не считаются отдельным покрытием.
- TypeScript core, API, worker, web, mobile; сборки consultation-shared/core/API/worker.
- Metro/Hermes export iOS и Android с установленными Stream SDK и native peers. Это проверка JS bundle, не native binary и не устройство.
- Expo web export (client + static renderer) после исправления platform resolution прошёл. В Expo web используется `ChatScreen.web.tsx` с переходом в существующий чат сайта; native `stream-chat-expo` не включается в web. Runtime-импорты Prisma в общих схемах регистрации/питомца заменены типами и клиентскими enum-значениями; предупреждение Prisma в этом export не воспроизводится.
- Регрессионный тест `ChatScreen.test.tsx`: без `StreamVideoThumbnail` клиентский и тренерский экраны рендерят fallback, не загружая нативный SDK. Это устраняет падение при регистрации маршрутов в Expo Go/старой binary; не заменяет проверку полноценного чата в новой binary.
- Вкладка mobile: явный href убран для видимого пункта, чтобы Expo Router не заменял общий tabBarButton. Подложка и активное состояние «Чат» визуально подтверждены в запущенном iOS симуляторе. Suspense и начальная загрузка используют общий `Loading fullScreen`, подключение внутри экрана — `fullScreen embedded`. В этом запуске API отвечает «Endpoint не найден»; чат на текущем backend не принят как работающий.
- 20 сценариев `scripts/check-cynologist-chat-live.mjs` с реальным development Stream: конкурентный старт одного диалога, единственная анкета, MONTHLY без консультаций, запрет прямых SDK send/upload и чтения чужого канала, повтор отправки с тем же ID, signed webhook + один notification record при replay, начало серии непрочитанных и её остановка настоящим Stream markRead, серверная загрузка фото/H.264-видео и сообщение с вложениями, чужие вложения, истечение/чтение/ответ кинолога/продление в том же канале.
- Авторизованный Playwright на отдельном порту 3018 и синтетическом аккаунте локальной БД: заполнение восьми полей, создание канала, показ первого сообщения, отправка через GAFUS, отображение на desktop и ширине 390 px. На 390 px document.scrollWidth = viewport width, горизонтального переполнения нет.
- Истечение тестовой подписки в браузере: история видна, composer отсутствует. ESLint новых web/mobile модулей: ошибок нет, остались предупреждения о клиентском Tracer catch и отдельные style/type warnings.
- Авторизованный браузер кинолога: список показывает владельца/питомца и два непрочитанных; открытие конкретного диалога и отправка ответа клиенту с истёкшей подпиской прошли. Снимки `output/playwright/cynologist-chat-trainer-dialogs.png` и `output/playwright/cynologist-chat-trainer-dialog.png`.

Снимки: `output/playwright/cynologist-chat-dialog-desktop.png`, `output/playwright/cynologist-chat-dialog-390.png`. Тестовые номера и имена синтетические.

## Границы приёмки

- Новые iOS/Android native binaries, клавиатура/плеер/восстановление сети на устройствах не проверены.
- WebPush, Expo и RuStore подключены к существующей очереди, но доставка и переход foreground/background/killed на реальных устройствах не подтверждены. Особенно проверить RuStore deep link на установленном SDK.
- Production webhook, миграция и deployment не выполнялись. Единственным кинологом выбран `@lana`; его ID и роль TRAINER проверены в production БД, ID добавлен в настройки выпуска. Применение этих настроек на production ещё не выполнено.
- Авторизованные WebSocket/CDN без VPN из российских мобильных сетей и production-квоты/оплата Stream требуют отдельной проверки.
- Exactly-once доставки push на устройство существующая инфраструктура не гарантирует; outbox и queue IDs защищают от повторного создания уведомления при обычном replay события.

Порядок выпуска и отключения: `docs/cynologist-chat-release.md`.
