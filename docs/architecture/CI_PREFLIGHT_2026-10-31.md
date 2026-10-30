# CI 41137007887 — successful application build, blocked production preflight

## Observed results

- Commit `f3f5fbb2d73d82e78941c854ef9d14a22dffa760`, workflow `https://github.com/asmtv1/gafus/actions/runs/41137007887`.
- `prepare-deps`, `cloudru-media-contracts`, `build-apps`, `security`, and `prepare-docker`: **success**.
- `cutover-preflight`: **failed before reaching the Chat2/QA release validator**, in `actions/setup-node@v5`: `Unable to locate executable file: pnpm`. This job only uses Node scripts; unlike build-apps, it never installs pnpm. With automatic package-manager caching, setup-node attempts to execute pnpm to locate its store.
- `beget-readonly-preflight`: **blocked by `BEGET_RELEASE_GATE_MISSING_GALLERY_BEGET_CDN_SERVICE_ID`**. GitHub production environment / repository variable-name inventory did not contain `GALLERY_BEGET_CDN_SERVICE_ID`, `FEED_BEGET_CDN_SERVICE_ID`, or `GAFUS_MEDIA_CDN_TARGET` at the time of the audit. Do not infer that absent repository/environment names rule out organization-level variables; the actual missing Gallery ID is confirmed directly by CI. Existing approval and credential values were neither printed nor modified.
- All deployment, Cloud.ru Job cutover, and media-activation jobs were **skipped**. No production mutation occurred in the failed workflow.

## Fix included in Refactor

- The `cutover-preflight` `actions/setup-node@v5` step explicitly sets `package-manager-cache: false`, matching other Node-only preflight jobs. This avoids requiring the uninstalled pnpm binary while retaining the **blocking** `check-chat2-prod-boundary.mjs --candidate` verification.
- `ci-cd/scripts/cloudru-first-main-cutover-contract.test.mjs` now asserts the pnpm-free setup and both release gates. Local Node 24, CI YAML validation, Beget readiness contract tests and cutover contract tests pass.

## Remaining protected infrastructure blocker — not a source build defect

The Beget readiness check cannot pass until **actual active provider resource IDs**, required production variable approvals, secret bindings and authorized immutable final-object smoke keys have been independently confirmed. Existing source uses the hard-coded legacy Feed CDN ID `becd9e5d-4fa8-47da-878c-9b80ded74e71`, which `docs/contracts/MEDIA_PIPELINE_NO_VM.md` records as **HTTP 404 and removed** by the provider. The current Feed V2 CDN is documented as `quepraquiecebquomiel.begetcdn.cloud` with tokenized signing **disabled**, whereas the old smoke requires signed URLs on `garaquachegasourn.begetcdn.cloud`. This mismatch must be resolved against current provider evidence before any activation. `Gallery` origin delivery was also previously unverified. **Never add fabricated, deleted or unverified CDN IDs just to satisfy the gate.**

Read-only config inspection is permitted; changing Beget resources, production GitHub environment settings, application deployment, or the other seven Cloud.ru Jobs is not authorized under the four-Feed-Jobs-only standing approval. No production variables, CDN or origin secrets were changed by this fix.

## CI 41139921351 — Mobile medical header cache identity

- Commit `55701e400e563c238a65e49b52dbc82706a00d80`, run `https://github.com/asmtv1/gafus/actions/runs/41139921351`.
- `prepare-deps`, `cloudru-media-contracts`, `security` all **PASS**. `build-apps` completed Web/Trainer/Admin/API build/tests/typechecks; failed at final Mobile unit test with one genuine failing privacy assertion (`PetVetReadCache.v100-mounted.test.tsx`): an exact actor-keyed TanStack Query cache entry with foreign `petId`, `ownerId`, and `authEpoch` could replace the private pet title in the veterinary medical header (`FOREIGN_PRIVATE_PET_TITLE`). No deployment tasks ran.
- Fixed `apps/mobile/src/features/pets/PetVetVisits.tsx`: pet title API responses must match route ID and current verified owner. Query data carries the verified owner, auth epoch and pet ID; only matching records can update the component's last confirmed title. Poisoned cache data is ignored and cannot overwrite or display the foreign title, while a previously confirmed same-owner title remains visible.
- Extended `PetVetReadCache.v100-mounted.test.tsx` with negative tests for mismatched backend owner and stale auth epoch, retaining the original foreign cached title test. No private data or tokens are logged; the local test is fully synthetic.
- Node.js 24 local results: targeted medical cache **12/12 PASS**; Mobile **285 files PASS, 1 SKIP / 2347 tests PASS, 1 SKIP**, exit 0; Mobile `tsc --noEmit` **PASS**. Logs are in ignored `.local-pg-scratch/qa-logs/ci-41139921351/`.
- These changes do not resolve outstanding production Beget CDN release-environment approvals/active-service compatibility; the fail-closed gate remains intact. No production/Cloud.ru/Main repository changes were performed.
