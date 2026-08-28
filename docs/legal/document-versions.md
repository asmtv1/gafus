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

## Актуальные версии в репозитории

| Документ | Текущая редакция |
|----------|------------------|
| `apps/web/public/oferta.html` | 2026-08-13 |
| `apps/web/public/policy.html` | 2026-08-13 |
| `apps/web/public/personal.html` | 2026-08-13 |
| `apps/web/public/personal-distribution.html` | 2026-05-13 |

### Proposed NPD wording — 2026-08-28 (LEGAL REVIEW REQUIRED)

The current public HTML files contain proposed NPD receipt wording. The previous published
files are preserved as `apps/web/public/legal/archive/{oferta,policy,personal}-2026-08-13.html`.
Do not publish this revision until the owner/legal reviewer approves the wording and confirms
the actual FNS/«Мой налог» provider and data-transfer basis.

Перед правками от 13.08.2026 текущие версии сохранены в `apps/web/public/legal/archive/` как `oferta-2026-07-16.html`, `policy-2026-05-13.html` и `personal-2026-05-13.html`.

Перед правками от 16.07.2026 текущая версия оферты сохранена в `apps/web/public/legal/archive/oferta-2026-05-13.html`.

Перед правками от 13.05.2026 текущие версии сохранены в `apps/web/public/legal/archive/` как `oferta-2026-03-27.html`, `policy-2026-04-23.html`, `personal-2026-04-23.html`, `personal-distribution-2026-04-23.html`.

## См. также

- [Соответствие оферте при оплате](../payments/oferta-compliance.md)
- [Согласия при регистрации](../features/consent-registration.md)
