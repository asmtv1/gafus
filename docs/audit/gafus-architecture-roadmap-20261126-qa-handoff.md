# GAFUS — передача на приёмку рефакторинга

Основание: gafus-architecture-roadmap-20261126.md, текущий незакоммиченный diff от afb4fb0b4 и накопительный implementation-checkpoint. Это карта реализации и проверок, **не акт приёмки**. Кодовая работа и безопасное удаление недостижимых веток выполнялись до широких тестов. Не начинать новый спекулятивный рефакторинг вместо проверки поведения. Исправлять конкретные ошибки, обнаруженные QA.

## Владельцы и точки входа
| Область | Где проверять фактическое решение и запись |
|---|---|
| Auth, reset, profile, consent | API composition → auth/identity-write-server; reset receipt/outbox, актуальная роль, session epoch; mailer |
| Account cleanup | Core accountCleanup → identity-write-server/Worker; media-server, durable cursor и CDN/Stream receipts |
| Pets, documents, prevention | pets-server, pet-prevention; Mobile PetDocumentsSection, PetPreventionSection, scoped query/owner fence |
| Courses/daily/exam/offline | course-read-server/course-progress-server/exam-server/entitlements-server; /offline/mutations, immutable owner receipt, stable occurrence, journal version; native replayProgressJournal/replayPreventionJournal |
| Feed | feed-server, feed-storage; FeedScreen/FeedPostCard/FeedComposeScreen/FeedDetailScreen/FeedPublicationQueue; Core persistence ratchet |
| Q&A/articles | questions-server, questions-write-server, article-server; question row lock + best answer/reward; ACL/media |
| Consultations | consultation-query/write-server, consultation-server booking, Voximplant, durable mail/push intents |
| Finance | subscription-read/write/payment/finance/trial-server; Gafus ledger, unique provider receipt, refund/NPD and entitlement |
| Notifications/reengagement | notifications-server, webpush, reengagement, queues; owner token, delivery receipt, retry/cancel |
| Analytics/AI | statistics, achievements-server, analytics, trainer-ai-server persistence; no mounted Trainer AI external-stream consumer found in API source; do not claim cancellation was verified |
| Flags/native/OTA | feature-flags-server, mobile-ota-server, mobile-intro-server; public config, mandatory gates and signed release fingerprint |
| Admin list | identity-write-server/admin-user-reads → GET /api/v1/admin/users?page=... → UsersPanel; actual DB filtering, stable sort, bounded DTO |

## Feature flags and fallback
| Key | Owner/consumer | Missing row/config | Removal condition |
|---|---|---|---|
| app_subscription_paywall_enabled | feature-flags-server; public mobile config / Admin release controls | true | active product switch, keep until explicit product decision |
| app_subscription_gating_enabled | feature-flags-server, rewarded access/achievements/content policy | true | active access policy; keep; never weaken paid access on DB error |
| mobile_ios_ru_card_payment, mobile_ios_ru_card_payment_hint, mobile_ios_subscription_promo_codes | feature-flags-server retired iOS checkout keys; offer compatibility | false, permanently disabled via getMobileFeatureFlagEnabled | verify supported offer DTO/old clients and exact approved OTA behavior before removing archived fields |
| mobile_rewarded_ads_ios | legacy rewarded settings read; reward provider compatibility | existing settings.iosEnabled | verify old read consumers and archived reward ledger; no new write/enable path |
| Mobile minimum/native/OTA | release policy plus deploy env; feature-flags-server + mobile-ota-server | minimum 1.7.5 both platforms; absent OTA policy optional | active release policy, not temporary flag |

DB errors propagate rather than silently invent an enabled flag value. Admin release-control updates retain revision CAS and role checks. Inventory covers AppFeatureFlag keys in current source, not live DB row values; no production read or modification performed.

## Cleanup gates retained deliberately
| Item | Owner | Evidence before final deletion |
|---|---|---|
| Root Expo 55, root eas.json, numbered native scripts and patches | Mobile release owner | frozen install, clean APK/AAB/IPA for current supported releases, native fingerprints, rollback, GPS and billing; exact compatibility baseline |
| Stream Chat SDK/cleanup | account-cleanup/Worker | historical snapshot/external object cleanup and retry/lease drain; no required cleanup keys left |
| Beget + dual purge | media/CDN/Worker | no supported URL/receipt consumer over rollback/offline window; old and new revoke/delete; drain retries and verify rollback |
| Retired Feed photo jobs | Feed/Worker | no producers, Redis waiting/active/delayed/failed + recovery/lease/DLQ zero or explicitly resolved |
| Catalog v1 / full snapshot walks v1 / old admin list wire | API/clients | supported version telemetry, recovery and mixed-version regression, rollback window; exact last consumer identified |
| Historical PWA retirement | Web | returning old browser still needs address-specific SW unregister until support window ends |
| Historical ownerless offline data | Mobile | no reassignment or destruction; old unprovable operations remain quarantined; test exact owner migration and same-account re-login |
| Temporary flags/QA/native/legacy fields | corresponding domain owner | prove no reachable supported consumers; keep current product switches and required historical ledger/migration receipts |

These are explicit post-verification retirement conditions from the original roadmap; preserving them does not prevent starting QA. Unknown last supported version and production traffic are not fabricated.

## Order of QA
1. Frozen install, generated Prisma client and clean workspace build/typecheck/lint; first resolve missing local dependency links. Run compiled package export smoke and Trainer production bundle boundary. Retest the new admin-users mounted HTTP contract and complete Admin App/Feed mounted suites (blocked locally by dependency resolution, not passed).
2. Full CI/regression matrix and actual PG/Redis integration, mixed-version migrations, concurrent owner-scoped offline commands, notification/worker recovery, payments/entitlements.
3. Real Web/Mobile/Trainer/Admin workflows, physical devices and native/OTA compatibility; performance budgets compared with baseline. Confirm user list search/sort/pagination under DB collation. Test new split routes for keyboard/scroll/focus, offline queue conflict and ACL.
4. Actual provider/CDN/restore/Uptrace operational checks, then evaluate each retirement gate separately. Do not delete historical data or support contracts blindly.
5. Fix proven regressions, repeat affected tests, record evidence and then decide commit/release. No production migration, push, OTA or deployment has been performed.

### Дополнительный gate этапа 12
Карта: gafus-architecture-roadmap-20261126-contracts-ownership.md. После frozen install и полной чистой сборки выполнить `pnpm check:workspace-built-exports`, проверить root QA dependency links, Trainer production graph, Web lazy Admin source export, публичные declaration-only subpaths, actual client bundles/tree shaking, смешанные старые и новые wire responses и root Expo/native fingerprint. Source checks PASS; compiled acceptance не получена.

### Admin paging / feature flag acceptance
Run real-PG equivalence for partner signed commissions, rejected vs reserved payouts, same-amount ordering, detail history and stale role; search consultation history older than 500, same-date IDs and status; UI cancellation/retry/last-page clamp, payout lost ACK; measure first Admin load and lazy chunks. Verify the intro SQL grouping against historical records. Run `pnpm check:feature-flag-policy`, compare documented environment flags and persisted settings against the deployed configuration without disclosing secrets; check exact release/build/OTA at first and repeated startup. Reports: gafus-architecture-roadmap-20261126-environment-flags.md and gafus-architecture-roadmap-20261126-product-flags.md. Preserve old protocol and operational switches until original compatibility/rollback gates pass.
