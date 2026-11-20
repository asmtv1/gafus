# GAFUS — адресные проверки переходов платежей и Worker coverage delta (19.11.2026)

**Статус: `MEASURED / INFORMATIONAL` — не release-ready.** Проверки выполнялись строго локально на свежих PostgreSQL 18 через `prisma db push`, со синтетической YooKassa и без обращения к продуктивным внешним провайдерам. Никакие mandatory release gates, CI workflow/deploy настройки не менялись; коммита/пуша/деплоя нет.

## Сравнение настоящих исходных счётчиков V8/Istanbul

| Источник | До: строки | После: строки | До: ветви | После: ветви |
| --- | ---: | ---: | ---: | ---: |
| `packages/subscription-payment-server/src/subscriptionTransitions.ts` | 2/19 | **19/19** (+17) | 0/27 | **27/27** (+27) |
| `packages/subscription-payment-server/src/paymentService.ts` | 86/547 | **98/547** (+12) | 72/539 | **79/539** (+7) |
| `packages/subscription-payment-server/src/appleSubscriptionState.ts` | 17/20 | 17/20 | 41/53 | 41/53 |
| `packages/worker/src/media-cdn-purge-worker.ts` | 21/37 | 21/37 | 20/35 | 20/35 |
| **Все 4 измеряемых источника** | **126/623 (20,22%)** | **155/623 (24,88%)** | **133/654 (20,34%)** | **167/654 (25,54%)** |

Прирост **+29 покрытых инструментированных строк / +34 ветви**, **+4,66 / +5,20 процентного пункта** без изменения исходников приложения и знаменателей. Это **не** покрытие всего платежного домена/Worker/репозитория. Показатель «100%» у `subscriptionTransitions.ts` относится только к **19 уникальным инструментированным строкам и 27 слотам ветвлений V8** для 153-строчного исходника. Из него **не следует** 100% бизнес-переходов/исключений/сценариев в проде.

Корень прежних 2/19 и 0/27 частично был **в атрибуции source coverage**: реальный PG-тест импортировал `./subscriptionTransitions.js`, а не напрямую `./subscriptionTransitions`. Тестовый импорт изменён на исходный TS; новые сценарии в том же тесте реально выполняют логику. Поэтому прирост — **совокупный эффект исправленного импортирования и новых тестов**; нельзя приписывать его исключительно расширению бизнес-кейсов.

### Что именно добавлено (15 новых сценариев)

**Transitions, 6:** initial PENDING → ACTIVE создаёт один трёхдневный trial receipt и даты; активный оплаченный период сохраняет даты и не создаёт лишний trial; fingerprint другой учётной записи отклоняет новый trial без доступа; конкурирующие привязки одного fingerprint дают ровно один grant/один отказ под PostgreSQL advisory lock; исключение при неизвестном subscription ID оставляет транзакцию без trial receipt; cancel/expire не изменяют Apple, EXPIRED/CANCELED и не отменяют PAST_DUE-доступ немедленно.

**Webhook, 9:** неподтверждённый платеж → отказ без grant, затем корректный replay → один grant; несовпадающая сумма/чужой owner metadata → отказ до побочных эффектов, затем recovery; подтверждённая отмена и повтор не предоставляют доступ; неподтверждённая отмена сначала FAILED, затем подтверждённый replay; неизвестный local payment не вызывает запрос к провайдеру и **остаётся RECEIVED, а не считается обработанным**; неправильный payment reference у возврата не отнимает доступ и не создаёт finance refund, корректный повтор один раз проводит возврат; частичный refund оставляет подписку ACTIVE и одну финансовую запись; поздний полный refund старого платежа не отменяет более новый оплаченный период.

## Доказательства и baseline-история

- **До:** `.qa/testing/qa-49f61b0e-2326-4d8a-b5d9-c7240e0762f3/summary.json`, **23 passing assertions**, старый baseline сохранён **без изменения** в `tests/catalog/coverage-risk-baseline-pre-transition-20261119.json` (включая SHA исходников).
- **После:** `.qa/testing/qa-6b621307-24b4-4007-b0ea-c5f4cbb16cbb/summary.json` (сверка входных измерений после расширения кейсов; см. также актуальный финальный запуск ниже). Прогон вернул `REPORT 0`, 2/2 checks, 4/4 source files, **38 Vitest assertions**: 17 Core webhook + 9 transition + 4 Apple state + 8 Worker. Все прошли, 0 failed/skipped.
- **Новый текущий baseline:** `tests/catalog/coverage-risk-baseline.json` с теми же исходными SHA-256 и знаменателями. В нём записаны новые числители, `previousBaseline.file`, исходный run ID и версия измерителя `vitest 4.1.0 / @vitest/coverage-v8 4.1.0`. Исторический файл не перезаписывался; `plan/run/report` показывает значения **старого и текущего** снимков отдельно, не выдавая переписанный baseline за прирост.
- В `tests/catalog/suites.json` у `coverage.payment.pg` теперь **17 явно именованных обязательных assertions** (2 существовавших + 15 новых), у `coverage.worker.pg` — 3. Отчёт включает таблицу имён, файлов-источников и статусов; один отсутствующий/неуспешный/повторный результат блокирует отчёт.
- Регрессионный `pnpm test:faults` пройден на новых PG18: `REPORT 0`, обе задачи PASS, **38/38** текущих тестов. Исправлена техническая ошибка shell-обёрток под macOS Bash 3.2 (`set -u` + пустые массивы аргументов без покрытия); режимы с coverage и без неё разделены. TypeScript Core, Subscription Payment Server, Worker — PASS; контракты plan/report — PASS.

Выполнение:

```bash
pnpm test:coverage-risk
pnpm test:faults
pnpm test:system:contract
node scripts/qa/test-system.mjs report --run-id qa-6b621307-24b4-4007-b0ea-c5f4cbb16cbb
```

## Непокрытые границы и блокеры

1. Функции `paymentService.ts` вне этих webhook-ветвей по-прежнему мало измерены: 98/547 строк, 79/539 ветвей. Наиболее важные остающиеся поверхности — реальные YooKassa/Apple HTTP-адаптеры, финансовые проводки, promo/start checkout, `payment_method.active`, API ingress, другие суммы/планы/валюты и ошибки сети.
2. Не измерены `packages/subscription-payment-server/src/yookassaProvider.ts`, `appleProvider.ts`, `paymentFinanceService.ts`, `apps/api/src/routes/v1/payment-provider-webhooks.ts` и SQL `mediaCdnPurgeRepository.ts` через dist. Не выполнялись настоящие деньги, сертификаты, повторные сетевые подтверждения провайдера и полноценный process crash/Redis recovery.
3. Внешние workflow GitHub не выполнялись на незакоммиченном дереве; строгая Prisma миграционная цепочка всё ещё BLOCKED (`P3018/42P01`, `20241108120000_exam_result_trainer_review`, `ExamResult`). `prisma db push` и локальный `REPORT 0` не снимают блокировку релиза.
4. Текущий baseline **описательный, не минимальный threshold**: его нельзя объявлять обязательным CI gate без отдельного утверждения, воспроизводимого clean-checkout CI и расширения охвата.

Проверки не затрагивают прод/релизные gates. Все временные PG18-инстансы останавливаются и их принадлежащие тесту каталоги удаляются; raw coverage evidence остаётся только в `.qa/testing/` (ignored by Git). Параллельные незакоммиченные изменения в монорепозитории сохраняются и не должны попадать в предполагаемый test-only commit автоматически.
