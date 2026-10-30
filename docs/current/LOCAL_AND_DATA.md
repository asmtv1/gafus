# Локальная разработка, БД, безопасность и доступы

Сверка на 29.10.2026. Основной репозиторий для работы: `/Users/asmtv1/Desktop/gafus-refactor`. Каталог GAFUS Main `/Users/asmtv1/Desktop/gafus1` запрещён для любых операций.

## Окружение

- Node.js 20+, pnpm 10.12.4; PostgreSQL, Redis/BullMQ; для native — Expo/React Native, Android/iOS build tools.
- `node_modules`, `apps/mobile/ios/Pods` и Gradle-сборки большие и воспроизводимые, но их удаление во время работы QA нарушает возможность немедленного повторного теста.
- Локальные конфигурации `.env*`, credentials, дампы, media сохранять; значения не копировать в документацию/Git.
- Текущий локальный PostgreSQL snapshot по наблюдению 29.10: `.local-pg-scratch/production_snapshot_20261024/data`, локальный порт `55921`. Это не production-сервер, но это активная локальная база; не чистить.
- `packages/prisma/schema.prisma` — реальный источник модели данных. [254 блока schema: модели и enum](../reference/PRISMA_MODELS.md).

## Нативный iOS-проект

- **Единственное актуальное расположение iOS:** `apps/mobile/ios/Gafus.xcodeproj` и `apps/mobile/ios/Gafus.xcworkspace`; здесь же лежит `Podfile`. Запускать native CLI следует из `apps/mobile` (`pnpm --filter @gafus/mobile ios`).
- Прежняя корневая `ios/gafusru.xcodeproj` относилась к старой конфигурации (`com.asmtv1.gafus.ru`), не совпадающей с актуальным идентификатором `ru.gafus.app` из `apps/mobile/app.json`; корневую `ios/` не восстанавливать.
- `apps/mobile/ios` **преднамеренно исключена из Git**: это Expo prebuild/CNG-каталог. Источниками конфигурации для чистой сборки остаются `apps/mobile/app.json`, плагины `apps/mobile/plugins`, `apps/mobile/eas.json` и JavaScript/TypeScript-код. Возможные ручные нативные правки без config plugin не переносятся в чистый checkout автоматически — проверять воспроизводимость iOS-сборки перед релизом.
- Удаление старой корневой `ios/` должно попасть в Git как удаление 19 ранее отслеживаемых файлов, после проверки staged diff; наличие локального `apps/mobile/ios` не означает, что она автоматически включится в commit.

## Команды

Из `package.json`:

~~~sh
pnpm install --frozen-lockfile
pnpm --filter @gafus/prisma db:generate
pnpm --filter @gafus/api dev
pnpm --filter @gafus/web-vite dev
pnpm --filter @gafus/admin-panel dev
pnpm --filter @gafus/trainer-panel dev
~~~

Каждый dev-процесс — отдельно, порты и режимы сверять с конфигурациями. Часто API использует 3001 и Vite 5173, но текущие запущенные процессы могут переопределять порты. Перед QA убедиться, что `DATABASE_URL` указывает на разрешённую локальную БД, а не production.

## Тестирование

~~~sh
pnpm --filter @gafus/prisma db:generate
pnpm --filter @gafus/api test
pnpm --filter @gafus/web-vite test
pnpm --filter @gafus/mobile test
pnpm --filter @gafus/web-vite build
pnpm --filter @gafus/admin-panel build
pnpm --filter @gafus/trainer-panel build
pnpm --filter @gafus/api build
~~~

Полные package scripts — [справочник](../reference/WORKSPACES_AND_COMMANDS.md). Наличие команды не означает, что она сейчас проходит. Не запускать migration deploy на production и destructive database reset.

## Безопасность

Server-side ACL: `apps/api/src/app.ts`, `apps/api/src/middleware`, `packages/auth`. Доступ к `/api/v1/chats`, `/api/v1/user`, `/api/v1/pets`, `/api/v1/admin/*` и `/api/v1/trainer/*` не должен опираться только на UI. Internal callbacks `/internal/*` — привилегированная зона. Данные Chat 2.0 и тексты личных сообщений должны сохранять текущие права доступа.

[Auth security](../contracts/AUTH_SESSION_SECURITY_20261025.md), [password/email hardening](../contracts/auth-email-password-hardening-2026-10-29.md), [все ENV-имена без значений](../reference/ENV_NAMES.md), [отзыв сессий и account deletion](../features/account-deletion.md).

## Рамки работ

Без отдельного разрешения: никаких изменений production БД, миграций, S3/CDN, DNS, Backend API, frontend/backend deployment; не использовать Main. Исключение касается только четырёх согласованных Feed Cloud.ru Jobs, описанных в [MEDIA](./MEDIA.md).
