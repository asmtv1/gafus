# A1 → A2: Subscription Promo Serializable SQL Port

**12.11.2026, main HEAD `0dcd18c13c8d`, no commit/merge/push/deploy.**

## Результат

- **23 → 22** Core→server, frozen 41 **19 resolved / 0 new**, historical 142 **120 retired**. Baseline JSON не менялся.
- Core `promoCodeService.ts` больше не импортирует Prisma SQL rows. `SubscriptionPromoPort` связывает eligibility, settings, promo identity, P2002 classifier, `withPromoCodeRecordsTransaction`. SQL в `subscription-finance-server` сохраняет `Serializable` и audit event(s) в одной транзакции.
- Публичные ошибки, план, скидка, ARCHIVED/ENABLED/DISABLED, ревизия и проверка оплаченного YooKassa периода не менялись. Отсутствующий порт отказывает, замена adapter запрещена.

## Файлы и SHA-256

Данные «до» созданы на текущем незакоммиченном дереве перед этой группой (не прежние A2 shared SHA). Полные SHA-256 в JSON.

| Тип | Путь | До SHA | После SHA |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `73084f90f769` | `c05e895faae2` |
| A | `apps/api/src/modules/app-subscription/composition/install-promo-code-rows.contract.test.ts` | `—` | `52f077f6b8c4` |
| A | `apps/api/src/modules/app-subscription/composition/install-promo-code-rows.ts` | `—` | `9c17f60b5290` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `0de066c4cf30` | `6c94d8f3e49b` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `33b580a2aade` | `14a8f4431d4b` |
| M | `packages/core/src/services/appSubscription/__tests__/promoCodeService.test.ts` | `817996d6a39f` | `784109cbb6cb` |
| M | `packages/core/src/services/appSubscription/index.ts` | `356953d2cf4e` | `f915f60bb666` |
| A | `packages/core/src/services/appSubscription/promoCodePort.test.ts` | `—` | `4841c37c6a9c` |
| A | `packages/core/src/services/appSubscription/promoCodePort.ts` | `—` | `05e04787bc07` |
| M | `packages/core/src/services/appSubscription/promoCodeService.ts` | `33242d157953` | `23a4c729e98d` |
| M | `scripts/check-core-server-boundary.mjs` | `53916d92e4b4` | `8dd475ca00cb` |

Всего **11 файлов**: 7 M, 4 A.

## Проверки

| Этап | Результат | Журнал |
|---|---|---|
| Core existing promo policy+SERIALIZABLE audit | PASS 36 passed | `/tmp/a1-promo-existing-target.log` |
| Core new unbound/eligibility/rebind port | PASS 19 passed | `/tmp/a1-promo-port-core-tests.log` |
| API composition SERIALIZABLE transaction | PASS 1 passed | `/tmp/a1-promo-api-contract.log` |
| Full Core | PASS 2118 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-promo-core-full.log` |
| Full API | PASS 2756 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-promo-api-full.log` |
| Core TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-promo-core-types-final.log` |
| Core build | PASS | `/tmp/a1-promo-core-build.log` |
| API TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-promo-api-types-final.log` |
| Subscription finance adapter TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-promo-server-types.log` |
| Architecture boundaries and ratchet | PASS | `/tmp/a1-promo-boundaries.log` |

## Внешние блокеры

- **PG_PROMO_CONCURRENCY** — Dedicated disposable full-schema PostgreSQL + historical YooKassa payment rows + archived/duplicate promo fixture, race to edit/archive/create code. Verify SERIALIZABLE retries, P2002, exactly-once audit/revision and rollback on rejected request.
- **YOOKASSA_EXTERNAL** — Approved nonproduction YooKassa sandbox API and webhook replay history for succeeded/refunded payment + registration promo preview; no live charge or production code.
- **IOS_FEATURE_FLAGS** — Staging iOS app client contexts for disabled/enabled promo flag, verify same HTTP reason codes and not payable below monthly plan.
- **FINAL_ARCH** — Eliminate 22 remaining Core→server edges, integrate A1/A2/A3, then 33-stage architecture final +5-stage chaos and Web/Mobile/Worker/panels/PG/Redis gates before frozen baseline update.

Агент 2: сверить `sha256_after_current` во всех 11 файлах. Перенести порт и исходный SQL-adapter вместе; не подменять сериализуемую транзакцию JS-lock. Shared app.ts/guard/audit семантически интегрировать. A1 не выполнял merge/push.
