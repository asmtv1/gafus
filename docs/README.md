# Техническая документация GAFUS Refactor

**Единая точка входа для инженера/QA-агента.** Дата последней структурной сверки: **29 октября 2026**.

Документация хранится **в корне репозитория, в папке `docs/`**: легко найти из любого приложения/пакета, путь стабильный, доступен поиск по Git, относительные ссылки открываются локально. Для свежих решений приоритет такой: **код → актуальный доменный контракт → `docs/current` → реальные QA evidence → более ранние документы**. Исторические материалы могут содержать устаревшие Next.js/HLS/старые infra-описания и не должны применяться без сверки.

> **Release readiness = NO.** Технические документы не означают, что все функции проверены. Источник фактических QA-статусов: [CURRENT_RELEASE_STATUS](./qa/CURRENT_RELEASE_STATUS.md).

## Начать отсюда — текущая техническая схема

1. [Архитектура системы, сервисы и границы ответственности](./current/ARCHITECTURE.md).
2. [Локальная разработка, рабочие БД, конфигурация, безопасность](./current/LOCAL_AND_DATA.md).
3. [Медиа: Cloud.ru Jobs, S3, CDN, Feed/Gallery/Questions/Chat 2.0](./current/MEDIA.md).
4. [Все функциональные домены и места реализации](./current/FUNCTIONAL_DOMAINS.md).
5. [QA-стратегия, приёмка и выпуск](./current/QA_AND_RELEASE.md).
6. [Журнал уборки и правила сохранения данных](./maintenance/CLEANUP_2026-10-29.md).
7. [Аудит готовности Git к merge/push](./maintenance/PREMERGE_AUDIT_2026-10-29.md).
8. [Адресная очистка каталога API и сохранённые QA-фикстуры](./maintenance/API_ARTIFACT_CLEANUP_2026-10-29.md).
9. [Стабилизация архитектуры и release blockers](./maintenance/ARCHITECTURE_HARDENING_2026-10-29.md).
10. [Mobile docs consolidation, October 30](./maintenance/MOBILE_DOCS_CONSOLIDATION_2026-10-30.md).
- [Полный аудит мусора и адресная очистка всех каталогов](./maintenance/REPOSITORY_DEEP_CLEANUP_2026-10-29.md).

## Автоматически воспроизводимые справочники по исходникам

| Справочник | Содержание |
|---|---|
| [API_ROUTERS](./reference/API_ROUTERS.md) | Монтирование Hono-роутеров и распознанные HTTP-методы, ссылки в код |
| [PRISMA_MODELS](./reference/PRISMA_MODELS.md) | Все модели/enum и поля из реальной схемы |
| [WORKSPACES_AND_COMMANDS](./reference/WORKSPACES_AND_COMMANDS.md) | Все apps/packages и скрипты `package.json` |
| [UI_ROUTES](./reference/UI_ROUTES.md) | Web/Admin/Trainer URLs и файловые маршруты Expo Mobile |
| [FRONTEND_SOURCE_MAP](./reference/FRONTEND_SOURCE_MAP.md) | Исходники Web, Mobile, Trainer, Admin |
| [ENV_NAMES](./reference/ENV_NAMES.md) | Имена переменных окружения, без значений и секретов |
| [CI_SCRIPTS](./reference/CI_SCRIPTS.md) | GitHub Actions, CI, инфраструктура и scripts |

Регенерация после изменений кода:

~~~sh
python3 scripts/docs/generate_reference.py
~~~

**Важно:** анализ статический: не подменяет runtime tests и не делает утверждений об активных облачных ресурсах. Во время генерации ни один `.env` не читается.

## Контракты, которые нужно читать при изменениях

- [Feed Media V2](./contracts/FEED_MEDIA_V2.md), [Gallery Media V2](./contracts/GALLERY_MEDIA_V2.md), [Questions Media V2](./contracts/QUESTIONS_MEDIA_V2.md), [Chat 2.0 Media V2](./contracts/CHAT2_MEDIA_V2.md).
- [Схема Media без VM](./contracts/MEDIA_PIPELINE_NO_VM.md), [Feed local acceptance](./contracts/FEED_MEDIA_LOCAL_ACCEPTANCE.md), [Live CDN read-only](./contracts/LIVE_MEDIA_CDN_READONLY.md).
- [Auth Session Security](./contracts/AUTH_SESSION_SECURITY_20261025.md), [Password & email hardening](./contracts/auth-email-password-hardening-2026-10-29.md).
- [Release workflow Vite](./contracts/RELEASE_WORKFLOW_VITE.md), [Identifiers](./contracts/identifiers.md).

## QA — не стирать актуальные evidence

- [Полная матрица функционала](./qa/FUNCTIONAL_MATRIX.md) и [текущее прохождение](./qa/CURRENT_FUNCTIONAL_MATRIX.md).
- [Статус выпуска](./qa/CURRENT_RELEASE_STATUS.md), [release readiness](./qa/RELEASE_READINESS.md), [дефекты](./qa/BUG_REPORT.md).
- [Что проверять дальше](./qa/NEXT_ACTIONS.md), [результаты тестов](./qa/TEST_RESULTS.md), [Chromium evidence](./qa/AUTHENTICATED_CHROMIUM_EVIDENCE.md).
- [Тестовое покрытие](./testing/TEST_COVERAGE_POLICY.md), [testing guide](./testing/TESTING.md).

## Предметные области

- [Моменты](./features/feed-runtime.md), [опросы](./features/feed-polls-release.md), [модерация](./features/feed-moderation.md).
- [Гафусы и экономика](./features/gafus-economy.md), [подписки/монетизация](./monetization-refactor-audit.md).
- [Фотоальбомы](./features/gallery-contracts.md), [вопросы](./features/questions.md), [удаление аккаунта и файлов](./features/account-storage-cleanup.md).
- [Курсы и кэш](./features/course-server-cache.md), [мини-гайды](./features/guide-course-type.md), [офлайн/мобильное приложение](./apps/mobile-rn.md).
- [VK ID](./features/vk-auth.md), [Apple IAP](./payments/apple-iap.md), [ЮKassa](./payments/yookassa.md).
- [Consultation/chat planning history](./archive/legacy-stream-chat/cynologist-chat-release.md) — считать **архивом** без сверки с Chat 2.0.

## Инженерная справка

- [API](./apps/api.md), [Prisma](./packages/prisma.md), [Core](./packages/core.md), [Workers](./packages/worker.md), [Queues](./packages/queues.md).
- [Deployment configuration](./deployment/configuration.md), [Docker](./deployment/docker.md), [Monitoring](./monitoring/PROMETHEUS_QUERIES.md).
- [Полный индекс всех сохранившихся Markdown документов](./INDEX_ALL.md) — включает старые описания, QA и юридические тексты для последующего аудита.

## Архив исторических материалов AG1–AG4

- [Индекс архива, соответствие прежних путей и контрольные суммы](./archive/agents/README.md).
- 40 historical files are archived without changing their bytes; of 10 pinned QA JSON fixtures, 8 stay at original paths and 2 G05 receipts moved to `docs/archive/agents/receipts/mobile-g05/` with unchanged SHA-256.
- Сами исторические контракты и хэши не переписывались. [manifest.json](./archive/agents/manifest.json) сопоставляет старые и новые пути.
- Содержимое архива исключено из Git как потенциально содержащее внутреннюю тестовую информацию. Более ранние 312 отчётов хранятся отдельно в приватном локальном tar.gz.

## Изоляция и запреты

Работать только в `/Users/asmtv1/Desktop/gafus-refactor`. Не обращаться к GAFUS Main, не писать в production PG/S3/CDN, не мигрировать production DB и не деплоить backend/frontend без отдельного разрешения. Исключение Cloud.ru Feed относится только к четырём явно согласованным Container Jobs и требует сохранённого rollback.
