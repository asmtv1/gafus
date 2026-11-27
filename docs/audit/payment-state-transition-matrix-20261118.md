# GAFUS: сохранение прав и финансовых результатов при событиях оплаты

Аудит 18.11.2026. Это **карта проверяемых переходов**, не разрешение на запуск платёжных провайдеров или миграций на проде. Базовые точки: `packages/subscription-payment-server/src/paymentService.ts`, `packages/subscription-finance-server/src/paymentFinance.ts`, `packages/subscription-finance-server/src/npdReceipts.ts`, `packages/worker/src/composition/app-subscription-payment.ts`, `apps/api/src/modules/app-subscription/composition/payment-transitions.ts`.

| Источник и действие | Запись платежа / события | Подписка и право доступа | Финансовые последствия | Повтор и позднее событие |
|---|---|---|---|---|
| ЮKassa: создание платежа | `PENDING`, уникальный `idempotenceKey`; сетевой сбой должен оставаться видимым для сверки | До подтверждения покупка **не должна** открывать Premium | Чек и комиссия не должны появляться до подтверждения | Сверка проверяет статус платежа на стороне провайдера; не начинать новый платёж для того же логического запроса |
| ЮKassa: подтверждение первичной покупки | Проверенный у провайдера `SUCCEEDED`; `AppSubscriptionEvent` с `providerEventKey` | `ACTIVE`, ровно один оплаченный период | Финансовые поля, комиссия, чек через существующие сервисы | Один provider event повторно не открывает период доступа и не удваивает суммы |
| ЮKassa: пробный период и привязка карты | Проверенный метод оплаты, уникальный отпечаток карточного метода | Пробный период создаётся только после проверки права на trial | Нет повторного trial при повторной карточке или попытке | Идентификатор метода и период trial нельзя задвоить при конкурентной привязке |
| ЮKassa: продление | Отдельный уникальный платёж и проверенная дата периода | Новая граница периода только от подтверждённой оплаты | Один набор финансовых записей и комиссия на оплату | Повтор webhook и Worker reconciliation не создаёт второй период |
| ЮKassa: отмена / неуспех | Запись `CANCELED` / `FAILED` | Не выдавать новых прав; уже оплаченный период не сокращать без отдельного основания | Нет успешного дохода по отменённому платежу | Позднее неуспешное событие не отменяет более новую оплаченную покупку |
| ЮKassa: полный возврат | `REFUNDED`, подтверждённый объект возврата и связь с исходной оплатой | Отозвать только покрываемый период, если нет более новой подтверждённой оплаты | Один обратный платёж/финансовый возврат, отмена чека, сторно комиссии | Повтор refund не создаёт второй возврат и не отнимает более поздние права |
| ЮKassa: частичный возврат | Отдельно отмечается неполное фискальное состояние | Нельзя считать полным отзывом доступа без явной политики | Учитывать фактическую сумму и требование дальнейшей фискализации | Статус `PARTIAL_REFUND_NOT_FISCALIZED` виден в журнале |
| Apple: проверенная первичная покупка | Проверенный JWS, уникальные `appleTransactionId` и `idempotenceKey` | Привязка `originalTransactionId` к пользователю, `ACTIVE` по сроку/отзыву | StoreKit платеж не должен создавать чек ЮKassa | Повтор JWS не создаёт вторую покупку, проверяется `appAccountToken` |
| Apple: восстановление и серверная сверка | Apple Server API + verified signed transaction + `apple-sync:<transactionId>` | Обновить срок и `ACTIVE` / `PAST_DUE` / `EXPIRED` / `REVOKED` | Новая строка платежа только для нового `transactionId` | Повтор Server Sync не удваивает платеж/событие; источник актуальности — сервер Apple |
| Apple: серверное уведомление и отзыв | Проверить подписанное уведомление и получить серверный статус | Отзыв и окончание подписки должны быть отражены в доступе | Не проводить новую прибыль по отзыву | События, пришедшие позже, повторно запрашивают актуальное состояние; нельзя затереть свежий отзыв старыми данными |

## Дополнение 26.11.2026: Google Play и транзакционные переходы ЮKassa

Google Play: владелец классификации — `apps/api/src/modules/app-subscription/google-play-service.ts`, записи — `packages/subscription-payment-server/src/googlePlayRows.ts`. RTDN, ручная сверка и клиентская проверка вызывают `syncGooglePlayPurchase`; сам payload RTDN не выдаёт доступ.

| Событие / подтверждённый статус | Запись и период | Финансы и повтор |
|---|---|---|
| Pending | PENDING, доступа нет, ACK не отправляется | Повтор проверяет актуальный snapshot; одна строка на purchase token |
| Active / grace period | ACTIVE только при будущем expiryTime; даты из Publisher API | ACK после commit, повтор сверяет фактический acknowledgementState |
| Canceled с остатком периода | ACTIVE до expiryTime; признак автопродления из snapshot | Не сокращать период из-за одной доставки RTDN |
| Hold / paused | PAST_DUE, без доступа | Не создаёт новой покупки; повтор считывает актуальный статус |
| Expired / pending purchase canceled | EXPIRED / CANCELED, доступа нет | Не ACK; повтор не создаёт финансовую запись ЮKassa |
| Refund/revoke / voided notification | Повторное чтение Publisher API; отсутствующий ранее привязанный token переводится в EXPIRED; заменённая покупка REVOKED | Не начислять комиссию и НПД-чек ЮKassa; фактический отзыв проверить в тестовом магазине |
| Restore / повтор RTDN / reconciliation | Upsert по googlePlayPurchaseToken с проверкой владельца; заменённый token блокируется по цепочке linkedPurchaseToken | Не использовать message ID как идентификатор оплаченного периода; ошибка ACK допускает повтор |

Ключи идемпотентности различны: ЮKassa — уникальный идентификатор платежа/события провайдера и отдельный ключ запроса; Apple — идентификатор транзакции плюс привязка originalTransactionId; Google Play — уникальный purchase token для записи подписки, а не для каждого продления. Для Google Play финансовая модель по заказам отдельно от entitlement snapshot пока не реализована в этом адаптере.

ЮKassa: `applyVerifiedYookassaPayment`, `applyVerifiedYookassaCancellation`, `applyVerifiedYookassaFullRefund` в `subscriptionTransitions.ts` владеют изменениями подтверждённой оплаты, отказа и полного возврата. Условный update платежа не позволяет позднему отказу переписать SUCCEEDED/REFUNDED, а более старому успеху — укоротить новый оплаченный период. Полный возврат читает актуальную связь платежа с подпиской после захвата строки. Успех, изменение доступа, комиссия и durable intent чека находятся в одной транзакции: падение до commit откатывает их, после commit повтор не выполняет эффекты заново. Сетевое обогащение финансов и фактическая отправка чека остаются отдельно. В Google Play сетевое чтение snapshot вынесено перед транзакцией; равенство версии строки xmin повторно проверяется под token/owner lock. При конкурирующей записи snapshot отбрасывается, повторное сетевое чтение ограничено тремя попытками. Сверка на реальном PG и в sandbox остаётся обязательной.

Три новых unit-теста на переходы ЮKassa прошли локально. Это не доказательство корректности конкурентных транзакций PostgreSQL или работы провайдеров.

## Проверки и ограничения

- Основное API и Worker используют **один** `createPaymentService` из `@gafus/subscription-payment-server/service`, но собирают его отдельно в своих composition root. Общая логика подтверждения должна оставаться в этом пакете.
- ЮKassa provider транспорт и проверки принадлежности вынесены в `yookassaProvider.ts`, Apple verifier/API — в `appleProvider.ts`. Это пока **не полный** перенос всех SQL-транзакций в единый state owner.
- Отдельный disposable PostgreSQL launcher `scripts/qa/payment-archqa-isolated-pg.sh` проверил 6 сценариев: последовательный/параллельный повтор webhook, неопределённый ACK, подтверждение `PENDING`, конкуренцию подтверждений и повтор полного refund; лог вывел `6 passed`.
- Не считать проверенными без отдельного теста: одновременное серверное уведомление Apple и Worker reconciliation, отзыв с более новым оплачиваемым периодом, полная проверка фискализации в тестовой интеграции, рестарт Worker между ответом провайдера и commit, старый IPA на новой миграции.


### Apple: прямой verify и server reconciliation (27.11)
- Общий owner записи: `appleSubscriptionState.ts`. Оба пути получают одинаковый transaction-level advisory lock по originalTransactionId, затем lock конкретной подписки.
- Новый transactionId фиксируется один раз. Уже существующий receipt принадлежит исходному аккаунту; нулевой trial не переносится на другой аккаунт. Платная новая транзакция с подтверждённым appAccountToken сохраняет существующую продуктовую политику отдельного аккаунта.
- Более старый оплаченный период не переписывает новый. Подтверждённый revoke текущего периода не допускает regrant тем же периодом; receipt SUCCEEDED → REFUNDED. Отзыв старого периода не отменяет более новый.
- Пустой/mismatched ответ Server API и отсутствующие/некорректные даты JWS не синтезируют срок и не изменяют подписку. Ошибка остаётся доступной для повторной сверки.
- Unit-проверки с имитацией DB проходят; настоящие PostgreSQL lock, provider sandbox, восстановление и mixed-version deployment требуют отдельной приёмки. Не считать условные тесты доказательством успешного релиза.


### Google Play: конкурентные snapshot (27.11)
- readPurchase выполняется без SQL-lock; существующий токен сначала проверяется на владельца и superseded, затем в транзакции под token/owner lock сравнивается версия строки с наблюдавшейся перед сетевым запросом. При расхождении транзакция не изменяет состояние, цикл повторяет readPurchase; после трёх попыток возвращается UNAVAILABLE.
- Поздний ответ по superseded token не восстанавливает доступ. Неуспешная сверка не меняет checkedAt, если более новая запись уже обновила его. ACK выполняется после успешного commit.
- 6 unit-сценариев прошли. Реальные блокировки, конкурентный mixed-version rollout и магазин не проверялись в этом срезе.

## Уточнение 27.11.2026 — восстановление и финансовый возврат

| Переход | Подтверждение и владелец | Атомарность и повтор |
|---|---|---|
| Apple: server sync / restore по originalTransactionId | Подписанный transaction JWS, точный original chain, неизменяемый payment receipt и/или подписанный appAccountToken; параметр userId лишь ограничивает выбор. Для старой цепочки без receipt/token допустим ровно один кандидат. | Выбор проверяется повторно под advisory lock цепочки; ранее REFUNDED receipt не активируется. Restore больше не меняет status только по локальной дате. Требуется доступный Apple Server API. |
| ЮKassa: verified full refund | Provider refund ID, status, payment ID, точная сумма в копейках и валюта, заново сверенные с локальной строкой под FOR UPDATE. | Refund finance receipt, REFUNDED, комиссия, NPD intent и отзыв покрываемого периода в одной транзакции. Повтор восстанавливает только finance receipt. Если timestamp финансового события отсутствует/некорректен, durable financeRefundsIncomplete и отзыв прав коммитятся вместе; SQL-сбой приводит к rollback/retry. |
| ЮKassa: partial refund | Те же проверки идентичности и суммы; неизменённая политика ручной сверки НПД. | Финансовый receipt и отметка RECONCILIATION_REQUIRED в одной транзакции; поздний partial не отменяет уже выполненную полную отмену. Не вводится новая политика суммирования нескольких частичных возвратов в автоматический отзыв. |

Повтор providerRefundId сверяет исходный paymentId, сумму и время; конфликт не принимается как успешный replay. Исторические planCode, оплаченные сроки и миграции не изменены. Изолированные PG/provider тесты остаются обязательной приёмкой; unit tests этого изменения не доказывают реальный commit/retry на PostgreSQL.

## 2026-11-27 — checkout replay and shared renewal transition (roadmap)

- Verified YooKassa success from API and Worker now shares `subscriptionTransitions.applyVerifiedYookassaPayment`; Worker validates frozen payment owner, provider, amount, currency and period before delegating. Removed the duplicate renewal finalization adapter; cancellation also delegates to the common owner. Failure/provider-id/retry transitions are compare-and-set guarded and must not replace a terminal result or a newer subscription period.
- Trial activation re-reads current subscription under owner and row locks, checks the owner's existing trial before fingerprint claim, and refuses stale or canceled payment methods. A repeated callback cannot re-enable canceled auto-renewal.
- Initial checkout persists its immutable return URL alongside the existing purchase snapshot and idempotence key. Uncertain network/provider responses remain pending. Replay is bounded to the same frozen request, at most 3 attempts within 10 minutes and at least 30 seconds apart. Historical rows without a frozen URL and exhausted windows require reconciliation; no fresh key is generated for an ambiguous charge. Migration `20261127150000_yookassa_frozen_checkout_return_url` is additive and has not been deployed.
- Focused tests: 16 verified transitions, 3 checkout replay, 4 renewal provider result tests passed. Cache regressions: 4 favorites and 8 media cache tests passed. 15 architecture guards passed before the final cancellation delegation change; diff whitespace check passed. Worker legacy suite could not collect because local `pino` is unresolved; fixture updated for compare-and-set and common ownership, not counted as passing. Full generated-Prisma typecheck, real concurrent DB/provider sandbox, mounted clients and release migration remain QA gates.
- Cache audit: `gafus-architecture-roadmap-20261126-cache-inventory.md` and `gafus-architecture-roadmap-20261126-cache-source-index.tsv` contain family policies and source candidates; production TTL/invalidation observations remain to be verified.
