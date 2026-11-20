# GAFUS — partial tests for workspaces without a test script (19 Nov 2026)

## Local outcome: PASS_PARTIAL (advisory only)

Reproduction:

    cd /Users/asmtv1/Desktop/gafus-refactor
    node scripts/qa/workspace-gap-advisory.mjs --list
    node scripts/qa/workspace-gap-advisory.mjs --run

Real runner exit 0, receipt: .qa/testing/workspace-gaps-02838273-1350-4ef8-8aaa-a75135675e79/summary.json

Result: **13/13 groups PASS; 18 source test files; 84 passing assertions** on the uncommitted local tree with HEAD 04052d616fa72f8edd2ad49f496f5c744c710fed.

| Workspace without test script | Selected tests | Status |
| --- | ---: | --- |
| @gafus/admin-rewarded-ads-server | 3 | PASS |
| @gafus/bull-board | 7 | PASS |
| @gafus/cdn-upload | 9 | PASS |
| @gafus/chat-media-quality | 21 | PASS |
| @gafus/error-handling | 2 | PASS |
| @gafus/feature-flags-server | 3 | PASS |
| @gafus/feed-cloud | 5 | PASS |
| @gafus/feed-storage | 5 | PASS |
| @gafus/logger | 13 | PASS |
| @gafus/mobile-ota-server | 6 | PASS |
| @gafus/react-query | 1 | PASS |
| @gafus/ui-components | 3 | PASS |
| @gafus/queues | 6 | PASS |

**Five new targeted unit test files** were added to the previously untested admin-rewarded-ads-server, error-handling, feature-flags-server, react-query and ui-components packages. Their 12 actual assertions passed with root Vitest. They test truthful rewarded-ad statistics, safe error-reporting metadata, OTA control guards, stable query-cache storage keys and cookie consent changes. This is **not** full coverage of these packages.

**Unrouted workspaces: zero within the explicit partial adapter**, but **13 still have no dedicated package test script**. The inventory still truthfully reports 70 total, 57 with test scripts, 13 without. No regular CI/full package invocation was automatically added; package-owner test-command migration and consumer acceptance remain open.

## Verification and limits

- Original tests run through root Vitest, Node TAP or tsx. The tool validates exact named Vitest files, all passing assertions, no skips/failures/pending, and full Node TAP ledgers; no empty runner can yield PASS. Minimum case counts and per-file source SHA256 are checked before and after execution.
- Environment is a sanitized allowlist; no inherited production DB, Redis or payment credentials. A non-local network blocker is set for spawned tests.
- Actual local runs **do not prove behavior of real S3/Beget/Apple/YooKassa or native devices** and do not establish full workspace coverage or a reproducible committed SHA.
- No workflow, required release gate, package.json or existing test-invocation path was modified by this pilot.
- Independently, web-vite completed 44/44 test groups, 304/304 test files, 3155 passed and six known gated G05 skipped, final REPORT 0. Receipt: .qa/testing/qa-460213e8-e88e-4dd0-86a2-635b5cfd8957/summary.md. Six G05 scenarios still need their actual HTTP acceptance in the appropriate environment.

## Non-gating package commands (additional local follow-up)

Added an opt-in test:unit script for each of all 13 formerly unrouted workspaces. The existing 57 test scripts and root turbo run test remain unchanged. The new test:unit commands are included only in explicit package/root unit selection, not automatic ci/full. Current selected assertions: 86/86 passing, including two additional OTA negative cases; all package test commands were initially exercised, then renamed to test:unit to preserve existing release gates. Latest handoff: [TEST_REFACTOR_FIVE_LOCAL_STAGES_20261119.md](./TEST_REFACTOR_FIVE_LOCAL_STAGES_20261119.md).
