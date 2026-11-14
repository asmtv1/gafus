# A1 → A2: Gafus admin + trainer course transaction ports

12.11.2026 · HEAD `0dcd18c13c8d` · **14 → 12 remaining** Core→server, frozen baseline 41: 29 resolved, 0 new; historical 130/142 removed.

Core admin policy runs under a typed, mandatory `GafusAdminRowsPort` preserving a single server transaction, auth role checks, advisory lock, audit trail, replay/idempotency and fraud CAS. Trainer Course policy now uses a mandatory `TrainerCourseRowsPort` bound to the original PostgreSQL version CAS and child transaction, with owner scope and strict missing/stale semantics. SQL adapters remain unmodified. API composes both before route imports.

## Текущие SHA-256

Only actual current SHA-256 is claimed; prior bytes of the concurrently dirty shared tree cannot safely be reconstructed.

| Статус | Путь | SHA256 (current) |
|---|---|---|
| M | `apps/api/src/app.ts` | `ca55f5f99581375b` |
| ?? | `apps/api/src/modules/gafus/composition/install-admin-rows.ts` | `c60c9cc43387c3a6` |
| ?? | `apps/api/src/modules/gafus/composition/install-admin-rows.contract.test.ts` | `6926dbddc28aeaee` |
| ?? | `apps/api/src/modules/trainer-courses/composition/install-trainer-course-rows.ts` | `86337975b932d347` |
| ?? | `apps/api/src/modules/trainer-courses/composition/install-trainer-course-rows.contract.test.ts` | `346feb4c86e45ac2` |
| M | `packages/core/src/services/adminGafus/index.ts` | `3107076fc1e132a6` |
| M | `packages/core/src/services/adminGafus/index.test.ts` | `51b041dd1b47da5e` |
| M | `packages/core/src/services/adminGafus/g1-admin-roles.test.ts` | `1aa089574ba3d486` |
| ?? | `packages/core/src/services/adminGafus/adminRows.realpg.test.ts` | `64c1b5bd34aaafee` |
| ?? | `packages/core/src/services/adminGafus/adminRowsPort.ts` | `0d412eedcd6dc59b` |
| ?? | `packages/core/src/services/adminGafus/adminRowsPort.test.ts` | `65fb72d5e41527e3` |
| M | `packages/core/src/services/trainerCourse/trainerCourseService.ts` | `20b277cfd77232d0` |
| M | `packages/core/src/services/trainerCourse/trainerCourseService.test.ts` | `9000e865ed0d43d4` |
| M | `packages/core/src/services/trainerCourse/g1-trainer-course-draft-error-privacy.source.test.ts` | `8b725a19461d83d7` |
| ?? | `packages/core/src/services/trainerCourse/trainerCourseRowsPort.ts` | `1c130d9b9b7a543f` |
| ?? | `packages/core/src/services/trainerCourse/trainerCourseRowsPort.test.ts` | `640049033acb9689` |
| M | `packages/core/src/services/trainerCourse/index.ts` | `8c0404cb531e1a74` |
| ?? | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `c4ce9308a80e7314` |
| ?? | `docs/audit/core-server-bulk-progress-20261111.md` | `55b5a9a5a0da8df0` |

## Проверки

- **PASS** Core TS + built package + API TS — durable job `5b8b49fc7def1a8d7df5064b17e80298ea9ca3aee0aa6b7d`
- **PASS** Core all tests, 136 skipped — durable job `6323a9d27752ddcf9e5cb2c599b2508e7225beaf09b6699c`
- **PASS** API all tests, 2767 pass/266 skipped — durable job `6323a9d27752ddcf9e5cb2c599b2508e7225beaf09b6699c`
- **PASS** Core admin (13), trainer (24), privacy (2) targeted
- **PASS** API admin routes (26) + two compositions (2)
- **PASS** Architecture core boundaries, 26 assertions
- **PASS** Workspace graph, 0 cycles
- **PASS** AST facade inventory 12 remaining/0 new

- **PASS** Gafus server TS + course-progress server TS + API production bundle build — durable job `db72799e5ebf4f649b2b7b74f637290c1d14935cf6e4f784`

## Непройденные обязательные ворота

- PENDING real disposable PG admin fraud CAS + concurrent settings and wallet
- PENDING real disposable PG trainer Course.version CAS + rollback
- PENDING real-PG/Redis disabled suites
- PENDING joint A1/A2/A3 33-stage regression and five-stage chaos
- PENDING 18/18 cross-agent matrix, cloud/edge/observability/staging acceptance

No commit, merge, push, deploy, production, `gafus1`, or frozen baseline update.
