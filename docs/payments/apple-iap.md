# Apple In-App Purchase (курсы, iOS)

## Назначение

На **iOS** оплата **платных курсов** идёт через **App Store** (non-consumable IAP). **Android** и **Web** по-прежнему используют **ЮKassa**. Платные **статьи** на iOS остаются на ЮKassa.

Параллельный путь: webhook ЮKassa и модель `Payment` для ЮKassa не меняются; строки с `provider: APPLE` не матчятся по `yookassaPaymentId`. Подробнее: [yookassa.md](./yookassa.md).

## Переменные окружения (без секретов в репозитории)

Секреты Apple (ключи API, `.p8`) в репозиторий **не** кладутся. Для первичной **верификации JWS** на сервере достаточно:

| Переменная | Описание |
| ---------- | -------- |
| `APPLE_BUNDLE_ID` | Bundle ID приложения (как в App Store Connect), напр. `ru.gafus.app` |
| `APPLE_APP_ID` | Числовой идентификатор приложения в App Store (General → App Information). **Обязателен для production** при использовании `SignedDataVerifier` |
| `APPLE_USE_SANDBOX` | `true` / `1` — песочница StoreKit; иначе production |

Корневые сертификаты Apple для проверки цепочки подписи поставляются библиотекой `@apple/app-store-server-library` (отдельные файлы в Docker не требуются).

Для полноценной синхронизации подписок через **App Store Server API** также нужны:

| Переменная | Описание |
| ---------- | -------- |
| `APPLE_ISSUER_ID` | Issuer ID на странице Users and Access → Integration → API App Store Connect |
| `APPLE_KEY_ID` | ID созданного API key |
| `APPLE_PRIVATE_KEY_PATH` | Путь к `.p8` внутри контейнера, например `/run/secrets/apple_app_store_connect_api_key.p8` |
| `APPLE_PRIVATE_KEY_HOST_PATH` | Путь к `.p8` на production-сервере для docker bind mount, например `/opt/gafus/secrets/AuthKey_FZ3FFU78RN.p8` |

На сервере `.p8` кладётся вне репозитория и монтируется read-only в `web`, `api` и `worker`. Альтернатива для локальной разработки — `APPLE_PRIVATE_KEY` с содержимым ключа, где переносы строк можно записать как `\n`.

## Матрица sandbox / production

Сборка с sandbox-покупками и тестовым аккаунтом ASC должна сочетаться с `APPLE_USE_SANDBOX=true` на бэкенде. Production-билд + реальные покупки — `APPLE_USE_SANDBOX=false` (или не задавать).

## Поле курса `appleIapProductId`

В Prisma у `Course` поле `appleIapProductId` (уникальное) должно совпадать с **Product ID** non-consumable в App Store Connect. Без него мобильный клиент показывает, что покупка через App Store временно недоступна.

В **тренер-панели** в форме создания/редактирования платного курса задаётся **Apple IAP Product ID** (сохраняется в `Course.appleIapProductId` через server actions и схему `trainerCourse`). Для разовой правки в БД:

```sql
UPDATE "Course" SET "appleIapProductId" = 'ru.gafus.app.course.example' WHERE "id" = '<courseId>';
```

## Сервер (`@gafus/core` и API)

- Сервис **`appleIapCourseService`** (`packages/core/src/services/payments/appleIapCourseService.ts`): верификация JWS через `SignedDataVerifier`, выдача `CourseAccess`, запись `Payment` с `provider: APPLE` и `appleTransactionId` (идемпотентность и конфликты — см. тесты `appleIapCourseService.test.ts`).
- Эндпоинты **api.gafus.ru** (JWT): `POST /api/v1/payments/apple/verify`, `GET /api/v1/payments/apple/course-metadata` — тело, коды ошибок и query в [v1-routes.md](../api/v1-routes.md).
- **`POST /api/v1/payments/create`** для **курса** с заголовком `X-Client-Platform: ios` возвращает **403** и код `APPLE_IAP_REQUIRED` (статьи по-прежнему через ЮKassa).

## Мобильное приложение

Клиент передаёт **`X-Client-Platform: ios`** или **`android`** на всех запросах к API (guard на create). Для IAP используется **expo-iap**; нужен **development build** (не Expo Go). Сборка: например `eas build --profile development`. После покупки — вызов verify и refetch доступа к курсу.

## Библиотека сервера

- NPM: [`@apple/app-store-server-library`](https://github.com/apple/app-store-server-library-node)
