# GAFUS GitHub Actions — simplified production operations (2026-10-31)

Repository: `asmtv1/gafus`. Source of truth: `.github/workflows/`.
Main working branch: `main`. All changes in this document are **local**
until reviewed, committed, and pushed. Running a workflow requires GitHub
Actions to have loaded the new YAML from `main`.

## The four actions to use

| Workflow | When to use | What it changes |
| --- | --- | --- |
| **CI/CD Pipeline** (`ci-cd.yml`) | Automatic after every push to `main` | Lint/tests/boundary checks, seven app images in GHCR tagged `sha-<commit>`, app-only coordinated deploy + read-only Beget CDN verification |
| **Deploy Only** (`deploy-only.yml`) | Main deployment failed, images already built; or explicitly approved rollback | Redeploys seven previously verified images, no image build, no Cloud.ru Job changes, no S3 writes |
| **Build Single Container** (`build-single-container.yml`) | Rebuild only web, trainer-panel, admin-panel, api, worker, bull-board or prisma | Builds and publishes **one** image under a unique `manual-<run>-<attempt>` tag and records its digest. Optional production deploy updates **only** the selected service |
| **Infrastructure & Jobs** (`infrastructure-jobs.yml`) | Cloud.ru media image / existing Job configuration maintenance | Read-only plan/preflight/verify, optional deliberate image publish or change to *exactly the existing 11 Jobs* |

One separate **Daily Database Backup to Yandex Disk** (`daily-backup.yml`)
runs on its existing schedule and can be triggered manually. Backups are
append-only. Failed upload is an error; it must never silently delete backups.

Three internal reusable workflows exist for technical composition only:
`production-deploy-reusable.yml`, `production-job-release-reusable.yml`,
`cloudru-media-images.yml`. They are not separate user-facing procedures.

Historic one-time/refactor/incident workflows live in
`docs/operations/workflow-archive/`; never restore them unreviewed.

## Operational procedures

### Automatic main release

1. Push to `main` triggers CI. The frontend Vite builds and all seven
   containers are built/published **only after** required checks.
2. A source/production preflight and live Beget CDN check must succeed.
3. Shared app-only deployment downloads all seven `sha-<commit>` images,
   preserves existing S3/CDN/Cloud.ru media configuration, performs the existing
   coordinated schema cutover with safety checks, and verifies health.
4. The post-deploy CDN smoke is read-only.
5. **No 11-Job cutover/Cloud.ru image publishing/S3 bucket creation is part
   of ordinary CI/CD.** Do not disable failing readiness checks to force release.

### Manual redeployment and rollback

- Open **Deploy Only** → Run workflow **from `main`**.
- For a failed rollout of current `main`: choose `redeploy`; optional SHA
  must equal current main HEAD. QA and all seven images must have succeeded in
  a main CI run; this workflow does not rebuild anything.
- For a prior commit: choose `rollback`, give the exact full 40-character
  previous main SHA and type `SCHEMA_COMPATIBLE`. **This is operator
  acknowledgement, not an automatic migration compatibility test.**
  Rollback must not be used after incompatible database changes; no automatic
  `pg_restore`/reverse migration occurs.
- The production script still uses fixed SHA **tags** for the coordinated
  seven-image release (not OCI digests). Protect GHCR SHA tags from replacement
  and retain images of previous releases. Single-container builds pin by digest.

### Build one container

- Select the exact service; selecting `deploy=false` is **build/push only**.
- `deploy=true` is allowed only when the VPS checked-out commit matches the
  workflow SHA. No mixed-version deployment across different commits.
- The selected OCI digest is fetched before touching its running container;
  the prior image is retained under a temporary rollback tag.
- A failed service-level health/HTTPS check tries restoring the prior image.
  It does **not** reverse DB migrations. `prisma` can be built, but cannot
  be individually deployed because schema changes need coordinated release.
- Admin/trainer panels are independent production images and can be selected
  individually.

### Infrastructure & Jobs

- `plan`: offline inventory of pinned image targets, read-only config info.
- `preflight` / `verify`: read-only inspection of the 11 existing Jobs.
- `apply-existing-jobs`: requires `UPDATE_11_EXISTING_JOBS`. Performs
  preflight → controlled existing-Job config update → verification.
  **Does not provision new Jobs or buckets.**
- `publish-media-images`: requires `PUBLISH_MEDIA_IMAGES`; publishes media
  images but **does not attach them to Jobs**.
- Changing/adding a new bucket, S3 policy, CDN distribution, or brand-new Job
  requires separately reviewed infrastructure-as-code and credentials. Those
  operations are deliberately unsupported by this workflow to protect media
  and user objects.

## Production protection / unresolved issues

- GitHub API observation on 2026-10-31: environment `production` has
  `protection_rules: []` and branch `main` has no branch protection.
  Thus **there is no GitHub reviewer approval gate or PR protection**.
  Typed confirmations in Infrastructure & Jobs are safeguards, not a second
  human approval. Configure required reviewers and restrict deployment branches
  on `production` before treating it as approval-protected.
- Yandex.Disk returned `DiskAPIDisabledForOverdraftUserError` on the
  2026-10-31 backup attempt. Storage quota must be expanded or sufficient
  free capacity restored deliberately (preserve backup retention!). No
  workflow change can fix a full remote disk.
- The revised backup script becomes active on the production server only
  **after** the code is safely deployed there. Existing failed runs must not
  be counted as successful backups.
- Current full coordinated deploy still uses the established server-side
  migration/cutover scripts. A source change in these scripts requires separate
  release safety review and explicit data-compatibility checks.

## Mandatory verification before first push

- Review `git diff` and keep unrelated feature/media work untouched.
- Validate all YAML, custom workflow-contract tests, and `bash -n` on
  extracted SSH scripts and backup scripts.
- Check production secrets, GHCR permissions, Beget smoke keys, and manual
  production branch approval settings.
- First main release can automatically deploy production: **do not push only
  to "test" workflow syntax**.
- Confirm an actual successful backup independently after resolving quota.
