# Subscription tier / billing-code split (2026-11-24)

Product tiers are independent of billing cadence:

| Tier | Legacy billing code | Title | Default new YooKassa offer |
|---|---|---|---|
| BASIC | TWO_WEEKS | Самостоятельный | 1185 RUB / 30 days |
| STANDARD | MONTHLY | Поддержка в чате | 1465 RUB / 30 days |
| PREMIUM | THREE_MONTHS | Полное сопровождение | 2470 RUB / 30 days |
| LEGACY_WEEKLY | WEEKLY | Недельный (архивный) | not sold |

The production settings were checked read-only on 2026-11-24: all three
public YooKassa plans have a 30-day period. Historical active 90-day
agreements exist.

The product contract is in @gafus/types. API v1 offer/status add planTier
while retaining code/planCode for old native clients. The YooKassa checkout
and promo endpoints accept both forms; the adapter converts to the stable
billing code before payment processing. Clients tolerate missing planTier
during backend rollback. Prices and duration are still provided by the
server or native store. Feature policies are independent of period.

Storage compatibility: Prisma enum literals and legacy settings columns
remain stable billing identifiers, NOT public tier names. Do not rename
historical payment rows or recalculate agreement snapshots. There is no
destructive SQL migration for this phase. Do not change Apple product IDs,
Google Play product/base-plan IDs, transaction IDs, renewal price/period,
or partner commission amounts. Fiscal receipts use actual payment period.
The admin UI shows tier and retains original purchase title as history.

Release sequence: backend (additive compatible contract), web/admin,
then separately build/test compatible OTA updates for each supported
iOS/Android native runtime. Check actual OTA fingerprints/runtime versions,
including 1.7.5 and Google Play test 1.7.6; no changes to store products or
native libraries. Test purchase, promo, cancellation, renewal, historical
90-day terms, restored store purchase, access and rollback before a broad
OTA rollout. Never remove API v1 billing aliases while supported clients
still depend on them.
