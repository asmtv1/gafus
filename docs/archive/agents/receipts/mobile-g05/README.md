# Historical Mobile G05 / Hono / PostgreSQL receipts - 2026-10-17

These two JSON files are **historical QA receipts, not currently valid execution grants**. Both were moved byte-for-byte from `apps/mobile/docs/refactor/` on October 30, 2026. The saved tests used synthetic local data; their leases have expired. Do not use these files as authorization for another test or production access.

The historical `docs/archive/agents/manifest.json` deliberately keeps the original paths and content hashes. `python3 scripts/docs/archive_agent_handoffs.py --verify` checks the exact bytes at the relocated paths. The source-only Web G05 gate recognizes only the pinned previous and new receipt paths, still enforcing lease time, checksum, role and isolation rules.

## SHA-256 of unchanged JSON files

- `AG3_G05_REAL_MOBILE_HONO_PG_AG3_DONE_V13_20261017.json`: `104de2e73cf327e544ba8969ce8062daefce1dd42cfd58e9a3794a04862f5f6e`
- `AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json`: `d1daabba5d10c6757af4051a8781aac00502734ea14f20c2ce884997510f6581`

See the [consolidation audit](../../../../maintenance/MOBILE_DOCS_CONSOLIDATION_2026-10-30.md).
