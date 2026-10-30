# Архив исторических отчётов агентов AG1–AG4

**Исторические данные, не актуальная архитектура и не инструкции для запуска.**
Текущую архитектуру см. в [docs/current](../../current/ARCHITECTURE.md), а актуальное состояние QA — в [CURRENT_RELEASE_STATUS](../../qa/CURRENT_RELEASE_STATUS.md).

Материалы 16–23 октября 2026 перенесены из корней приложений сюда без изменения байтов. Первые 312 неподключённых отчётов находятся в локальном приватном архиве `.local-pg-scratch/archives/legacy-agent-reports-20261029.tar.gz`; ещё 40 файлов находятся в этом каталоге. 

**Исторические контракты и зафиксированные в них хэши не переписывались:** их пути соответствуют исходному состоянию проекта. Таблица `manifest.json` отображает исходный путь в новое местоположение, при этом SHA-256 содержимого не изменился.

Of the 10 checksum-pinned JSON receipts listed in the immutable historical `manifest.json`, 8 remain at their original paths and 2 G05 receipts are now in [receipts/mobile-g05](./receipts/mobile-g05/README.md). The archive verifier resolves those two paths without changing the saved hashes.

Содержимое `apps/` здесь исключено из Git: исторические файлы могут содержать внутренние данные тестов. Не добавляйте их в коммиты без отдельной проверки.

Проверка контрольных сумм:

```sh
python3 scripts/docs/archive_agent_handoffs.py --verify
python3 scripts/docs/archive_agent_handoffs.py --resolve apps/api/G1_AG1_OFF021_JOURNAL_EXECUTABLE_TRANSACTION_PLAN_AG4_AG3_20261017.md
```

См. также [аудит исторических SHA-256](./PINNED_SHA_AUDIT.md), включая одно несовпадение между редакциями v1 и v1_1.

## Перенесённые файлы

- [apps/admin-panel/AG4_REMINDER_UPGRADE_FAILED_HISTORY_OWNER_CLEANUP_20261018.exit](./apps/admin-panel/AG4_REMINDER_UPGRADE_FAILED_HISTORY_OWNER_CLEANUP_20261018.exit)
- [apps/api/AG1_G1_VET53_ACH33_FINAL_SHARED_SOURCE_GATE_20261018.v1.json](./apps/api/AG1_G1_VET53_ACH33_FINAL_SHARED_SOURCE_GATE_20261018.v1.json)
- [apps/api/G1_AG1_AG3_NATIVE_PROGRESS_PREVENTION_SQL_WINDOW_REQUEST_20261017.md](./apps/api/G1_AG1_AG3_NATIVE_PROGRESS_PREVENTION_SQL_WINDOW_REQUEST_20261017.md)
- [apps/api/G1_AG1_G05_NORMAL_PACKAGED_CORE_SHARED_PRISMA_PG16_FINAL_AG4_HANDOFF_20261017.md](./apps/api/G1_AG1_G05_NORMAL_PACKAGED_CORE_SHARED_PRISMA_PG16_FINAL_AG4_HANDOFF_20261017.md)
- [apps/api/G1_AG1_NEXT_OFF021_VIDEO_POSITION_SCOPE_REQUEST_20261017.md](./apps/api/G1_AG1_NEXT_OFF021_VIDEO_POSITION_SCOPE_REQUEST_20261017.md)
- [apps/api/G1_AG1_OFF021_JOURNAL_EXECUTABLE_TRANSACTION_PLAN_AG4_AG3_20261017.md](./apps/api/G1_AG1_OFF021_JOURNAL_EXECUTABLE_TRANSACTION_PLAN_AG4_AG3_20261017.md)
- [apps/api/G1_AG1_OFF021_JTX9_REALPG_SKIP4_INDEPENDENT_AG4_HANDOFF_20261017.md](./apps/api/G1_AG1_OFF021_JTX9_REALPG_SKIP4_INDEPENDENT_AG4_HANDOFF_20261017.md)
- [apps/api/G1_AG1_OFF021_PREVENTION_V2_METHODSCOPE_REQUEST_AG4_20261017.md](./apps/api/G1_AG1_OFF021_PREVENTION_V2_METHODSCOPE_REQUEST_AG4_20261017.md)
- [apps/api/G1_AG1_OFF021_REWARD_GAFUS_ACK_IDEMPOTENCY_PROPOSAL_20261017.md](./apps/api/G1_AG1_OFF021_REWARD_GAFUS_ACK_IDEMPOTENCY_PROPOSAL_20261017.md)
- [apps/api/G1_AG1_OFF021_V2_JOURNAL_SOURCE_SCOPE_AG4_AG3_HANDOFF_20261017.md](./apps/api/G1_AG1_OFF021_V2_JOURNAL_SOURCE_SCOPE_AG4_AG3_HANDOFF_20261017.md)
- [apps/mobile/docs/refactor/AG3_AUTH011_PROFILE_EDIT_ACTUAL_SCREEN_AG4_V36_20261018.md](./apps/mobile/docs/refactor/AG3_AUTH011_PROFILE_EDIT_ACTUAL_SCREEN_AG4_V36_20261018.md)
- [apps/mobile/docs/refactor/AG3_CACHE012_PRIVATE_PREFETCH_20261017.md](./apps/mobile/docs/refactor/AG3_CACHE012_PRIVATE_PREFETCH_20261017.md)
- [apps/mobile/docs/refactor/AG3_G1_LEGACY_OFFLINE_V1_HANDOFF.md](./apps/mobile/docs/refactor/AG3_G1_LEGACY_OFFLINE_V1_HANDOFF.md)
- [apps/mobile/docs/refactor/AG3_OFF021_AG1_WIRE_V1_INCOMPATIBILITIES_AG4_HANDOFF_20261017.md](./apps/mobile/docs/refactor/AG3_OFF021_AG1_WIRE_V1_INCOMPATIBILITIES_AG4_HANDOFF_20261017.md)
- [apps/mobile/docs/refactor/AG3_OFF021_NEW_ONLY_V2_PHASE1_IMPLEMENTATION_20261017.md](./apps/mobile/docs/refactor/AG3_OFF021_NEW_ONLY_V2_PHASE1_IMPLEMENTATION_20261017.md)
- [apps/mobile/docs/refactor/AG3_OFF021_OWNER_AUTH_EPOCH_ACK_DECISION_MATRIX_20261017.md](./apps/mobile/docs/refactor/AG3_OFF021_OWNER_AUTH_EPOCH_ACK_DECISION_MATRIX_20261017.md)
- [apps/mobile/docs/refactor/AG3_OFF022_ONLINE_SEEK_RACE_20261017.md](./apps/mobile/docs/refactor/AG3_OFF022_ONLINE_SEEK_RACE_20261017.md)
- [apps/trainer-panel/AG4_G1_MATRIX.md](./apps/trainer-panel/AG4_G1_MATRIX.md)
- [apps/web-vite/migration/AG2_AG4_FEED_AUTHOR_READ_ONLY_BATCH_SCOPE_20261018.md](./apps/web-vite/migration/AG2_AG4_FEED_AUTHOR_READ_ONLY_BATCH_SCOPE_20261018.md)
- [apps/web-vite/migration/AG2_AG4_SPECIAL_ROUTES_054_055_AND_WALLET_READ_SCOPE_20261018.md](./apps/web-vite/migration/AG2_AG4_SPECIAL_ROUTES_054_055_AND_WALLET_READ_SCOPE_20261018.md)
- [apps/web-vite/migration/G1_AG2_G03_INDEPENDENT_HONO14_PRODUCER_28_CASE_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_G03_INDEPENDENT_HONO14_PRODUCER_28_CASE_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_G15_CHAT_METHOD_SPECIFIC_AG1_REQUEST_20261017.md](./apps/web-vite/migration/G1_AG2_G15_CHAT_METHOD_SPECIFIC_AG1_REQUEST_20261017.md)
- [apps/web-vite/migration/G1_AG2_G20_V11_VK05_28CASE_INDEPENDENT_DELTA_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_G20_V11_VK05_28CASE_INDEPENDENT_DELTA_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_G20_VK05_VALID_ORIGIN_HOST_SUBSTRING_ACCEPTANCE_PREP_20261017.md](./apps/web-vite/migration/G1_AG2_G20_VK05_VALID_ORIGIN_HOST_SUBSTRING_ACCEPTANCE_PREP_20261017.md)
- [apps/web-vite/migration/G1_AG2_G20_VK_BROWSER_CAPTURE_HANDOFF_AG1_20261017.md](./apps/web-vite/migration/G1_AG2_G20_VK_BROWSER_CAPTURE_HANDOFF_AG1_20261017.md)
- [apps/web-vite/migration/G1_AG2_G20_VK_BROWSER_METHOD_SPECIFIC_AG1_REQUEST_20261017.md](./apps/web-vite/migration/G1_AG2_G20_VK_BROWSER_METHOD_SPECIFIC_AG1_REQUEST_20261017.md)
- [apps/web-vite/migration/G1_AG2_G21_FIRST_KEEP_READ_ONLY_RECEIPT.md](./apps/web-vite/migration/G1_AG2_G21_FIRST_KEEP_READ_ONLY_RECEIPT.md)
- [apps/web-vite/migration/G1_AG2_POST_GATE_SEQUENCE.md](./apps/web-vite/migration/G1_AG2_POST_GATE_SEQUENCE.md)
- [apps/web-vite/migration/G1_AG2_REMAINING_BLOCKERS.md](./apps/web-vite/migration/G1_AG2_REMAINING_BLOCKERS.md)
- [apps/web-vite/migration/G1_AG2_SERVER_DTO_GAPS.md](./apps/web-vite/migration/G1_AG2_SERVER_DTO_GAPS.md)
- [apps/web-vite/migration/G1_AG2_W1_CURRENT4_S1_A11Y_NAV_SESSION52_SCOPED_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_W1_CURRENT4_S1_A11Y_NAV_SESSION52_SCOPED_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_EMAIL_CHANGE_CONFIRM_AG1_NEXT_BACKEND_HANDOFF_20261017.md](./apps/web-vite/migration/G1_AG2_W1_EMAIL_CHANGE_CONFIRM_AG1_NEXT_BACKEND_HANDOFF_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_G02_PASSWORD_CLIENT_SCOPED_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_W1_G02_PASSWORD_CLIENT_SCOPED_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_G03_LEGACY_USERNAME_MOUNTED_CLIENT_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_W1_G03_LEGACY_USERNAME_MOUNTED_CLIENT_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_G03_LOCAL_VITE_ROUTE_SOURCE_MOCK_43_ACCEPTANCE_20261017.md](./apps/web-vite/migration/G1_AG2_W1_G03_LOCAL_VITE_ROUTE_SOURCE_MOCK_43_ACCEPTANCE_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_G03_NEXTSLICE_DTO_SESSION_PRIVACY_ACCEPTANCE_HANDOFF_V2_20261017.md](./apps/web-vite/migration/G1_AG2_W1_G03_NEXTSLICE_DTO_SESSION_PRIVACY_ACCEPTANCE_HANDOFF_V2_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_G03_USERNAME_FROZEN_CONTRACT_AG4_GATE_HANDOFF_20261017.md](./apps/web-vite/migration/G1_AG2_W1_G03_USERNAME_FROZEN_CONTRACT_AG4_GATE_HANDOFF_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_MINIMAL_VITE4_S1_LOCAL_IMPLEMENTATION_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_W1_MINIMAL_VITE4_S1_LOCAL_IMPLEMENTATION_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_W1_S2_CONCRETE_HTTPS_AG4_HANDOFF_AND_S1_TOKEN_LIFECYCLE_RECEIPT_20261017.md](./apps/web-vite/migration/G1_AG2_W1_S2_CONCRETE_HTTPS_AG4_HANDOFF_AND_S1_TOKEN_LIFECYCLE_RECEIPT_20261017.md)
- [apps/web-vite/migration/G1_AG2_WEB_KEEP_CONTRACT_TEST_MATRIX.md](./apps/web-vite/migration/G1_AG2_WEB_KEEP_CONTRACT_TEST_MATRIX.md)

## Действующие тестовые входные данные, оставленные в исходных папках

- `apps/api/G1_PRISMA_SHARED_BASELINE_MANIFEST.json`
- `apps/mobile/docs/refactor/AG3_G05_REAL_MOBILE_HONO_PG_AG3_DONE_V13_20261017.json`
- `apps/mobile/docs/refactor/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json`
- `apps/web-vite/migration/AG2_PROFILE_HONO_SYNTHETIC_FIXTURES_20261018.json`
- `apps/web-vite/migration/AG2_REMINDER_V2_REAL_CHROME_INDEXEDDB_CAS_WEBLOCKS12_EVIDENCE_20261018.json`
- `apps/web-vite/migration/AG2_WEB_URL005_ACHIEVEMENTS_SOURCE_EVIDENCE_20261018.json`
- `apps/web-vite/migration/AG2_WEB_URL019_POST_DETAIL_SOURCE_EVIDENCE_20261018.json`
- `apps/web-vite/migration/AG2_WEB_URL024_PUBLIC_AUTHOR_PARITY_EVIDENCE_20261018.json`
- `apps/web-vite/migration/AG2_WEB_URL027_WALLET_SOURCE_EVIDENCE_20261018.json`
- `apps/web-vite/migration/G05_AG2_WEB_REAL_CONSUMER_DONE_R01_R06_20261017.json`
