# Web frontend P2 — реальный route JS/CSS payload без пересборки

**30.10.2026 · статус: measured (локальный synthetic preview), NOT real-device / production.** Измерения сняты на **уже существующем неизменённом** `apps/web-vite/dist/index.html` (mtime `2026-10-29T21:34:18.236Z`, Mac local 30.10 01:34); исходники, assets, manifests, build и общий `Vite:5173` / `API:3001` не изменялись. **Полные Web/Mobile тесты не повторялись**.

## Метод и границы измерения

Отдельный Node HTTP loopback-сервер с **ephemeral OS-selected port**, отдельные профили **Chrome 156 headless** и CDP `Network.*` / `Page.*` / `Runtime.*`; ни один общий browser context/port не затронут. Сервер отдавал **точные байты файлов существующего Web dist**, `gzip` (zlib level 6) для JS/CSS/HTML. На `/api/v1/**` сервер возвращал **явно SYNTHETIC READ-ONLY** user `PERF_USER_1`, feed status/page и один готовый видеопост; это НЕ реальная авторизация/production API. Все внешние URL заблокированы на уровне CDP Fetch до отправки; зафиксировано **0** внешних запросов. Изображение-постер и короткий MP4 созданы только во временном scratch для браузерного измерения момента загрузки, существующие проектные assets не изменены. Напрямую внешние медиа, Cloud/S3/CDN/production не запрашивались.

Таблица фиксирует **фактически запрошенные** `.js`/`.css` в Chrome (не результат сложения всех файлов dist). Формат колонок: **число requests / encoded gzip body / decoded original file bytes** в KiB (1 KiB=1024 байта); `CDP wire` — `Network.loadingFinished.encodedDataLength`, включая HTTP/transport overhead, а не только body. Холодные сценарии использовали отдельные пустые Chrome профили. `SPA` — переход без перезагрузки страницы, `warm reload` — полная навигация при уже заполненном браузерном кеше. Наиболее медленные сервисные/сетевые параметры не эмулировались: `localhost` и тестовый ответ не позволяют оценить real-device **LCP/INP**, CDN RTT или конечную полосу пропускания. Реальная production gzip/brotli-настройка не измерялась.

## Фактические сетевые результаты

| Этап | JS: req / gzip / raw (KiB) | CSS: req / gzip / raw (KiB) | CDP wire JS+CSS (KiB) | Из кеша | HLS req |
| --- | ---: | ---: | ---: | ---: | ---: |
| `guest-cold-entry` | 13 / 109.3 / 346.3 | 5 / 27.5 / 144.3 | 142.3 | 0 JS, 0 CSS | 0 |
| `guest-spa-to-login` | 2 / 6.4 / 18.6 | 1 / 2.1 / 10.0 | 9.4 | 0 JS, 0 CSS | 0 |
| `guest-cold-login` | 13 / 109.2 / 344.1 | 4 / 21.4 / 116.0 | 135.8 | 0 JS, 0 CSS | 0 |
| `auth-cold-courses` | 20 / 194.9 / 633.6 | 8 / 34.8 / 182.4 | 238.2 | 0 JS, 0 CSS | 0 |
| `auth-spa-to-moments` | 15 / 40.9 / 124.0 | 5 / 20.5 / 104.8 | 67.5 | 0 JS, 0 CSS | 0 |
| `moment-video-after-trusted-mouse-click` | 0 / 0.0 / 0.0 | 0 / 0.0 / 0.0 | 0.0 | 0 JS, 0 CSS | 0 |
| `auth-spa-back-courses` | 0 / 0.0 / 0.0 | 0 / 0.0 / 0.0 | 0.0 | 0 JS, 0 CSS | 0 |
| `auth-spa-return-moments` | 0 / 0.0 / 0.0 | 0 / 0.0 / 0.0 | 0.0 | 0 JS, 0 CSS | 0 |
| `auth-cold-moments` | 28 / 150.1 / 468.1 | 9 / 41.9 / 220.8 | 203.3 | 0 JS, 0 CSS | 0 |
| `auth-warm-full-reload-moments` | 28 / 150.1 / 468.1 | 9 / 41.9 / 220.8 | 0.8 | 28 JS, 8 CSS | 0 |

**Читать по фазам, не складывать cold и SPA без контекста.** Холодные `/` и `/login` проходили **в разных новых browser профилях**; тяжёлый `auth-cold-moments` тоже в новом профиле. `auth-spa-to-moments` измеряет только **дополнительные** chunks при `/courses` → `/moments`, потому что app shell и зависимости уже были загружены. После `/moments` → `/courses` → `/moments` новые JS/CSS отсутствовали (реиспользование модулей). При `warm reload /moments` 28 JS получены из кеша с **0 CDP wire bytes**, 8/9 CSS из кеша, оставшийся не-хешированный `/styles/site-background.css` перезапрошен: ~0.8 KiB с overhead. В warm rows поля gzip/raw остаются размерами **ресурса по ответу**, их нельзя трактовать как повторно переданные байты; смотреть CDP wire/cache.

### Самые дорогие файлы при холодных `/moments`

| Запрошенный файл | gzip body (KiB) | raw (KiB) |
| --- | ---: | ---: |
| `index-3DCltMfn.js` | 84.0 | 275.3 |
| `index-DKAQFoiw.css` | 18.2 | 103.4 |
| `MomentPoll-BNnsVqGH.js` | 10.9 | 34.9 |
| `MomentsCatalog-BPx_sdrK.js` | 7.8 | 26.4 |
| `web4-social-visual-parity-BiLfJkzJ.css` | 7.4 | 46.7 |
| `AuthPanel-Ci9G5_BD.js` | 6.1 | 18.2 |
| `MomentsCatalog-D0A8tj6K.css` | 5.6 | 24.6 |
| `useBaseQuery-DLPCnhAk.js` | 4.8 | 14.5 |
| `MomentsNotificationsOptIn-DWeQ4_BW.js` | 4.4 | 13.6 |

**Почему одного entry `281931 raw / 86023 gzip` недостаточно:** его gzip составляет ~84.0 KiB, но холодный `/moments` фактически тянет **28 JS**, а не один; суммарно JS **~150.1 KiB gzip / 468.1 KiB raw**, CSS **~41.9 KiB gzip / 220.8 KiB raw**. Всего **~192.0 KiB gzip body / 688.9 KiB decoded JS+CSS**, не считая HTML, fonts, API, poster/MP4 и протокольные overhead.

## Открытие видео и HLS

- На `/moments` синтетический пост реально отобразился; до пользовательского действия `<video preload="none">`, атрибут `src` отсутствует, запрошен только маленький постер (read-only fixture). **0 MP4/HLS до Play**.
- Пользовательское действие воспроизведено **настоящим CDP `Input.dispatchMouseEvent` pressed/released**, а не JS `element.click()` (первый диагностический прогон с нетрастовым click не запускал видео и не считается playback proof). Только **после Play** Chrome сделал запрос к локальному synthetic `clip.mp4`: **HTTP200, файл 1932 bytes, ~2138 CDP wire bytes**. **0 дополнительных JS/CSS chunks** на Play; HLS `.js`, `.m3u8`, segments **0 запросов** до и после.
- Отдельный `hls-BIrUvssq.js` **507732 raw bytes** существует в готовом `dist`, **ни разу не запрашивался** в сценариях guest, `/courses`, `/moments` и MP4-play. Текущий `FeedV2Video` использует progressive MP4; код `TrainingStepVideo` содержит `await import("hls.js")` при появлении авторизованного HLS `.m3u8` ticket. **Непосредственное открытие training HLS на данном синтетическом маршруте НЕ выполнялось**. Поэтому доказано отсутствие преждевременного HLS для **измеренных маршрутов**, а не для всех training сценариев.

## Cache policy: наблюдение vs производственная конфигурация

- Изолированный preview действительно вернул для hashed `/assets/*` `Cache-Control: public, max-age=31536000, immutable`, `Content-Encoding: gzip`; HTML `/` и непроштампованный `/styles/site-background.css` — `no-cache`, синтетические API — `no-store`. Chrome warm reload показывает кеширование 28/28 JS и 8/9 CSS. Эти заголовки относятся к **нашему измерительному серверу**, не к live production.
- **Source-only** `ci-cd/docker/nginx-vite-refactor.conf` также содержит для `/assets/` `public, max-age=31536000, immutable`, для `/index.html` и SPA fallback — `no-cache, must-revalidate`. Конечный `edge`/provider response в этом пакете **не проверялся**. Сравнение позволяет проверить, что synthetic preview воспроизводит основную asset policy, но **не подтверждает** фактическое production caching, HTTP/2, gzip или brotli.

## Candidate improvements — без изменений текущего source snapshot

1. **P2 candidate, Moments:** `MomentPoll-BNnsVqGH.js` добавляет **~10.9 KiB gzip / ~34.9 KiB raw** даже к странице с **одним видеопостом без опроса**. Source audit: `MomentSummary.tsx` статически импортирует `MomentPoll`. Рассмотреть динамическую загрузку только при `post.hasPoll`, с обязательной проверкой skeleton/опросных таймеров и смены owner; это candidate, а не готовый patch.
2. **P2 candidate, Moments secondary features:** базовый `/moments` загружает `MomentsNotificationsOptIn-DWeQ4_BW.js` (**~4.4 KiB gzip**) и `HiddenAuthorsOptIn-DDLOrJvj.js` (**~3.2 KiB gzip**) без посещения соответствующих разделов. Source `MomentsCatalog.tsx` статически импортирует оба. Рассмотреть условные lazy imports с route-matching и no eager media fetch; после изменения нужна отдельная измерительная регрессия.
3. **P2 candidate, auth shell:** в холодном авторизованном `/moments` загружен `AuthPanel-Ci9G5_BD.js` (**~6.1 KiB gzip**) вместе с регистрационными модулями, хотя экран входа не открыт. Проверить граф импорта и guest/auth split; не удалять auth guard и не делать speculative optimization без bundle-analyzer.
4. **P3 candidate, un-hashed CSS:** warm reload повторно тянет `/styles/site-background.css` (~0.8 KiB wire). В будущем рассмотреть fingerprint/hashed delivery этого CSS **только** после проверки визуальной идентичности и существующей cache policy; экономия невелика.

**Recommendation/gate:** главный найденный потенциал — условные imports MomentPoll и вторичных модулей. HLS на `Моментах` не представляет текущий P2 regression: файл не запрашивается, а видео использует MP4 по нажатию. Для дальнейших решения нужны explicit source-owner review, новый сборочный snapshot и повторные route metrics; пока Agent 2 выполняет image acceptance **никакие source/assets/config не менялись**.

## Evidence, commands, cleanup boundary

- Authoritative second run: `node .local-pg-scratch/agent3-perf-20261030/probe2.cjs` через ChatTerminalHub durable job `3fd7a368304e815ebde3dd16abcde99166dec35ad67aeef2`, **`exited`, `exit_code=0`, `timed_out=false`**; log `.local-pg-scratch/agent3-perf-20261030/probe2.log`, complete CDP network capture: [`FRONTEND_ROUTE_PAYLOAD_2026-10-30-v2.json`](./FRONTEND_ROUTE_PAYLOAD_2026-10-30-v2.json). First diagnostic `probe.cjs` job `f795d10f5b2383d00beb5c595da1bac654b028112cb206a3` exit 0, **JS `.click()` video part not accepted**; v2 is authoritative.
- All four own temporary Chrome profiles and ephemeral servers stopped after their scenario; no common Playwright/browser port or Vite/API process affected. Private scratch fixture persists only under Agent 3 scratch for reproducibility; not part of dist/source/assets or Git release. No production/provider requests, no real credentials. Full Web/Mobile unchanged and **not rerun**.
- **Release READY=NO**: these are measured local route payloads on synthetic read-only data, *not* complete authenticated QA, device performance, production caching or image runtime acceptance.
