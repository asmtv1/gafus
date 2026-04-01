# Версии юридических документов и архив

## Где что лежит

| Назначение | Путь |
|------------|------|
| Тексты, которые видят пользователи сейчас | `apps/web/public/*.html` (корень сайта: `/policy.html`, `/oferta.html` и т.д.) |
| Снимки прошлых редакций | `apps/web/public/legal/archive/` — файлы `*-YYYY-MM-DD.html` |
| Оглавление актуальных + ссылок на архив | `apps/web/public/legal/index.html` → URL `/legal/index.html` |

## Процедура при смене текста

1. По **дате редакции в старом** документе (или по согласованной дате снимка) скопировать текущие файлы в архив **до правок**:
   - из корня `public/` в `public/legal/archive/` с именами вида `policy-2026-02-20.html`.
2. Внести правки в файлы в корне `public/`.
3. Обновить `packages/core/src/config/documentVersions.ts` (для `OfertaAcceptance` и учёта версий).
4. При изменении смысла согласий — поднять `CONSENT_VERSION` в `apps/web/src/shared/constants/consent.ts` и дефолт в `apps/api/src/routes/v1/auth.ts` (и при необходимости env в проде).
5. Добавить блок со ссылками на новый снимок в `legal/index.html`.

## Продакшен

Снимок с сервера (если нужно сверить байты с репозиторием): каталог на хосте `~/gafus-legal-archive/snapshot-2026-02-20/` (не подставляет публичные URL; источник правды для публикации — репозиторий).

## См. также

- [Соответствие оферте при оплате](../payments/oferta-compliance.md)
- [Согласия при регистрации](../features/consent-registration.md)
