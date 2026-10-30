# Mobile documentation consolidation - 2026-10-30

**Scope:** `/Users/asmtv1/Desktop/gafus-refactor` only. The canonical documentation root is `docs/`. `apps/mobile/docs` has been physically deleted. Mobile application source, routes, native configuration and app assets were not modified as part of this relocation.

## Inventory and decisions

Before cleanup: **1,883 files / 12.38 MiB**, including **182 subdirectories** inside `apps/mobile/docs/refactor/evidence`. There were three files directly under `refactor` (a Chat 2.0 UI Markdown report and two G05 JSON receipts), plus 1,880 files in `refactor/evidence`. None were tracked in Git, and the entire evidence directory had been ignored.

- **Deleted:** 1,878 obsolete QA logs, interim command outputs, provisional formatting/diff results, throwaway scratch scripts and hash captures (exactly **12,957,825 bytes**). No tracked active source refers to the old evidence path. These October 17-23 logs are not current acceptance evidence.
- **Moved to `docs/features/chat2-mobile-messages-ui-2026-10-29.md`:** the dated Chat 2.0 Mobile message-list design notes; a historical-status note was added.
- **Preserved byte-identically under `docs/archive/agents/notes/mobile-2026-10-23/`:** two Markdown reports discovered within ignored QA evidence: online progress protocol compatibility and the old achievements DTO blocker. They should not be interpreted as current release status.
- **Preserved byte-identically under `docs/archive/agents/receipts/mobile-g05/`:** two G05 receipt JSON files from isolated synthetic Mobile-Hono-Postgres checks. The SHA-256 and lengths are the same as those in the immutable `docs/archive/agents/manifest.json`. Old lease expiration dates were not changed.

## Dependency and integrity fixes

- `scripts/docs/archive_agent_handoffs.py --verify` continues to validate 40 archived entries and all 10 historical retained JSON entries. For two G05 receipts the verifier now reads their new canonical location while comparing the saved original hashes. `--resolve` maps the exact original path to its new location. **Neither the historical manifest nor the receipts were changed.**
- `apps/web-vite/scripts/g05-web-gate.mjs` accepts only the exact known original and new path spelling for its AG3 resource receipt, then reads the same relocated file. It does not allow arbitrary paths; source SHA, grants, expiration, local-only isolation, roles and operation checks remain mandatory. A new source-only test asserts both path mappings and denial of unrelated paths.
- The stale `apps/mobile/docs/refactor/evidence/` Git-ignored rule was removed. `docs/README.md`, `docs/apps/mobile-rn.md`, `docs/archive/agents/README.md` and the historic agent cleanup ledger now link to the correct locations.

## Verification and limitations

- Archive SHA-256 integrity: see `python3 scripts/docs/archive_agent_handoffs.py --verify`.
- G05 Web Gate source-only tests: `node --test apps/web-vite/scripts/g05-web-gate.test.mjs apps/web-vite/scripts/g05-web-gate-receipt-path.test.mjs`.
- Typechecks: `pnpm --filter @gafus/mobile typecheck` and `pnpm --filter @gafus/web-vite typecheck`.

**Verification PASS (exit 0):** Mobile typecheck; Web Vite typecheck; 25/25 G05 security/source-only tests; archive verification (40 moved + 10 retained, including the 2 relocated receipts); `git diff --check`; documentation index link check (215 links, 0 broken).

These checks do not prove physical iOS/Android functionality, offline playback, real-PG G05 integration, or release readiness. No GAFUS Main access, production changes, database migration, commit, merge or push were performed by this cleanup. Newly moved docs and tests are untracked until separately reviewed and added in a future commit.
