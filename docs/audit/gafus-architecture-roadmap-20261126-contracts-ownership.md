# Этап 12 — контракты и владение пакетами

## Граница ответственности
Публичный HTTP JSON принадлежит @gafus/types, правила и транзакции — предметному владельцу, транспорт — API/клиенту. Не заменяем доменные Date/Decimal/BigInt их JSON-представлениями внутри сервера. Не объединяем независимые read/write-пакеты ради числа пакетов.

| Операция | Владелец | Основной потребитель | Публичный импорт |
|---|---|---|---|
| Персональные карточки | course-read-server | API | @gafus/course-read-server/catalog-cards |
| Скачивание курса | course-read-server | API, Mobile (JSON) | @gafus/course-read-server/offline-application; @gafus/types/offline-course |
| Прогресс курса/дня | course-progress-server | API | @gafus/course-progress-server/training-service; /daily-course-service |
| Offline receipts | course-progress-server (SQL), Core (policy) | API | @gafus/course-progress-server/offline-mutation-rows |
| Подписки и финансовые правила | subscription-read/write/payment/finance-server, subscription-shared | API/Worker | @gafus/subscription-read-server; @gafus/subscription-write-server; @gafus/subscription-payment-server/service; @gafus/subscription-finance-server/payment-finance |
| Offer/status/promo JSON | types | Web/Mobile/API | @gafus/types |
| Chat2 writes/access | Core Chat2 (existing domain owner) | API | @gafus/core/services/chat2 |
| Chat2 outbox/video recovery/deletion | notifications-server, media-server | Worker | @gafus/media-server/chat2-video-recovery; /chat2-deletion-rows |
| Chat2 draft and send/realtime orchestration | core-client | Web/Mobile | @gafus/core-client/chat2/draft; /chat2/send-attempt; /chat2/realtime-subscription |
| CDN delivery/recovery | media-server, core-client | API/Worker, Web/Mobile | @gafus/media-server/purge-repository; @gafus/core-client/media-delivery |
| Feed publication client | core-client | Web/Mobile | @gafus/core-client/feed/publication-client |
| Feed persistence/recovery | feed-server | API/Worker | @gafus/feed-server/runtime-services; /background-operations |
| OTA registration/commands/admin/read/storage | mobile-ota-server | API, CI | @gafus/mobile-ota-server/ci-registration; /deployment-commands; /native-release-admin; /patch-commands; /queries; /repository |
| Feature flags | feature-flags-server | API/Admin | @gafus/feature-flags-server |
| Identity | identity-write-server | API/Worker | @gafus/identity-write-server/password-reset; /profile-rows; /account-cleanup-records |
| Shared consultation room UI | ui-components | Trainer | @gafus/ui-components/voximplant-room |
| Embedded Admin shell | Admin | Web lazy route | @gafus/admin-panel/mount-in-web (explicit source export bundled by Vite) |

## Source audit result
- 67 workspaces, 386 export entries, 2748 import references, 309 used public subpaths. All existing export targets have matching source; no unknown imported subpaths, unapproved cross-workspace source import or undeclared production workspace dependency in audited TS/JS sources. 96 imports of shared test dependencies explicitly resolved by root QA manifest. Source audit includes static imports/reexports, dynamic literal imports, require, import-type and import-equals; review-only paths are named, not a general production exception. Literal references to removed Core targets checked in repository code/config/scripts; not a proof for unobserved external consumers or computed module names.
- Core export count 77 → 73. Feed publication one-hop facade removed; existing CI tests import actual core-client implementation. Three dangling entries (consultation bookingService, consultation slotService, mediaDelivery purgeWorker) removed; no remaining consumer, obsolete Worker/Api tsconfig aliases removed (seven total including purgeWorker). Six original mobile-ota one-hop facades already gone; API HTTP/protocol code retained.
- 22 tracked generated declarations from gallery-storage mkdtemp build scratch deleted; future scratch ignored.
- Trainer runtime now imports the public UI and core-client entries. Existing server dependencies stay dev-only with production bundle guard. Web declares its existing Admin lazy shell dependency. Shared cross-domain QA dependencies declared at root rather than adding new reverse runtime edges; lockfile workspace groups checked. Zero runtime cycles in existing graph.
- Shared DTO: offline-course (ISO date strings, optional occurrence/progressVersion and videoUrls); public paid outline (strong server projection and named older-client optional metadata); subscription offer, status and promo preview (strong server fields, explicitly named legacy client projection). Existing training/course/exam/notes/pet/survey declaration-only subpaths retained; Mobile view models remain named narrower views, not incorrect claims that their nested data is the canonical HTTP wire. JSON payload shape, nullability, existing public validation, ownership checks and big-sequence serialization not changed in this pass.
- New check:workspace-public-exports blocks missing source/export/dependency and private paths; added to check:core-boundaries. check:workspace-built-exports additionally verifies exact declared output files without executing server code; CI prepare-deps runs it after workspace build. Four isolated guard tests include missing artifact negative and positive synthetic output. Actual compiled outputs not verified locally.

## Verification / QA boundary
49 targeted behavior tests in eight suites + 4 guard contract tests PASS. Strict tsc of three shared contract files PASS. 16 source architecture guards PASS; 697 modified/new TS/TSX parse with zero syntax errors. 67 runtime workspaces, zero cycles. Manifest/lock groups for root/Web/Trainer match. Temporary source-only Vitest config removed. Updated test catalog and A3 plan. No full frozen install, build/typecheck, client tree-shaking measurements or native release fingerprint verification performed. These are explicit acceptance gates in original roadmap, not code-only receipts. Root Expo/eas/native compatibility retained pending clean release verification; do not delete them preemptively. No commit, push or deploy.

The two selected source-code blocks (DTO/contracts and package ownership/public exports) have a concrete code result and reproducible source gates. Whole stage 12 is not yet accepted at 100%: built-artifact and release/tree-shaking checks belong to QA; broad DTO equivalence across every possible historical payload is not established by a static import audit.
