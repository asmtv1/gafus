# Единый индикатор загрузки Web

В apps/web-vite общий индикатор ожидания данных и ленивых модулей — `Loading` из `src/shared/ui/Loading.tsx`; отдельные измеримые операции/проценты сохраняют собственный прогресс. Он экспортируется через src/shared/ui/index.ts, рядом с Buttons.tsx.

- Визуальный источник один: маскот-собачка из Mobile LoadingMascot. Для Web подготовлены локальные public/images/loading-mascot-router.webp (анимация WebP) и public/images/loading-mascot-router-poster.webp (первый кадр). Нет зависимости от S3/CDN.
- По умолчанию анимация имеет размер 168×168 и текст «Загружаем…». Варианты card (карточка), screen (страница), compact (малые области), icon (внутри кнопки, без сообщения).
- Постер виден до декодирования анимации; при prefers-reduced-motion: reduce остаётся неподвижным.
- Текстовые статусы загрузки с role=status заменены на общий компонент. Кнопки сохраняют текст операций, а измеримые состояния progress — проценты и полосы прогресса.
- Сообщение озвучивается посредством aria-live=polite и role=status. Пустой иконный вариант не озвучивается.

Пример использования: import { Loading } from "../../shared/ui"; затем <Loading message="Загружаем курсы…" />.

Для новых экранов не дублировать изображения маскота и отдельные CSS-спиннеры, а использовать варианты Loading.

## Route-level загрузка и ошибки (проверка 30.10.2026)

- `apps/web-vite/src/App.tsx`: `React.lazy` для маршрутов профиля, питомцев, тренировок, консультаций, статей, вопросов, «Моментов»; гостевые экраны регистрации/входа/восстановления пароля и публичный лендинг тоже отложены. Авторизация и session fence остаются в eager-части маршрутизатора.
- `DeferredReadRoute` показывает `Loading` при получении chunk, а `ReadChunkErrorBoundary` при отказе динамического импорта показывает сообщение и кнопку перезагрузки, без бесконечного индикатора. При изменении route map проверять, что error/loading/fence остаются смонтированы.
- Локальные замеры **собранного** главного JS в Agent 3: 335 753 → 281 931 байт raw, gzip 101 483 → 86 023 байта (после публичного Types-импорта); тяжёлые HLS/Voximplant chunks отдельно и размер/скорость каждой страницы требует отдельного network/LCP/INP измерения. Проверка `scripts/refactor/vite-preview-smoke.test.mjs` охватывает chunk names и отсутствие eager preload; 1280×800 и 390×844 synthetic Chromium подтвердили guest pages и навигацию `/login` → `/register`, но не доказывают авторизацию или Web Vitals на устройстве.
- Подробная сверка и команды: [отчёт Agent 3](../architecture/NIGHT_AGENT_3_2026-10-30.md), [история splitting](../maintenance/WEB_BUNDLE_CODE_SPLITTING_2026-10-29.md). Релизные ограничения: [QA_AND_RELEASE](./QA_AND_RELEASE.md).


## Проверка lazy-route lifecycle после полного Web набора (30.10.2026)

- При тестировании `App` c `React.lazy` одного `act(root.render(...))` недостаточно для гарантии появления route-specific DOM: сначала может появиться `Loading`. Тесты должны ждать конкретный экран/поле/ссылку в bounded `act` polling, а не предполагать синхронное разрешение динамического `import()`.
- `src/features/courses/FavoritesDeepLink.test.tsx`: обнаруженный в полном Web run `NAV-C03` timeout на 5000 мс вызван пятью безусловными паузами по 100 мс **при каждом** действии в длинном тесте; после timeout другие тесты этого файла наблюдали `overlapping act()` и временно пустой route DOM. Исправление ограничено test-helper: короткий React commit tick, ожидание `[data-gafus-loader="screen"]` только при реальном loading и проверка DOM реального целевого маршрута. Не меняет runtime `App`, session ACL, test timeout или assertions. В повторном **полном** Web run `FavoritesDeepLink` 11/11 PASS, весь стандартный набор **3041 passed / 0 failed / 6 skipped** (было 3034/7/6), все 287 файлов учтены. Полные before/after логи и ограничения — [NIGHT_AGENT_3](../architecture/NIGHT_AGENT_3_2026-10-30.md).
- Пять ранее помеченных агентом 1 файлов в независимом **полном** прогоне агента 3 прошли **86/86**. Это не доказывает, что прежний флейк устранён: конкретный trigger тех 10 не воспроизведён.
