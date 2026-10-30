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
