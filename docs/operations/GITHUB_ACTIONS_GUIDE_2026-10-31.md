# GAFUS GitHub Actions — simplified production operations (2026-10-31)

Repository: `asmtv1/gafus`. Source of truth: `.github/workflows/`.
Main working branch: `main`. All changes in this document are **local**
until reviewed, committed, and pushed. Running a workflow requires GitHub
Actions to have loaded the new YAML from `main`.

## The four actions to use

| Workflow | When to use | What it changes |
| --- | --- | --- |
| **CI/CD Pipeline** (`ci-cd.yml`) | Automatic after every push to `main` | Lint/tests/boundary checks, seven app images in GHCR tagged `sha-<commit>`, coordinated app deploy + existing Cloud.ru Job image sync + postdeploy verification |
| **Deploy Only** (`deploy-only.yml`) | Main deployment failed, images already built; or explicitly approved rollback | Redeploys seven previously verified images, no image build, no Cloud.ru Job changes, no S3 writes |
| **Build Single Container** (`build-single-container.yml`) | Rebuild only web, trainer-panel, admin-panel, api, worker, bull-board or prisma | Builds and publishes **one** image under a unique `manual-<run>-<attempt>` tag and records its digest. Optional production deploy updates **only** the selected service |
| **Infrastructure & Jobs** (`infrastructure-jobs.yml`) | Cloud.ru media image / existing Job configuration maintenance | Read-only plan/preflight/verify, optional media image publish or reconcile *exactly the existing 11 Jobs* without rebuilding |

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
2. Source/production readiness, all 11 existing Cloud.ru Job identities,
   current immutable image pins, target digests and real Beget CDN delivery
   must pass a read-only preflight **before** application deployment.
3. Shared app-only deployment pulls the seven GHCR application images,
   performs the existing coordinated migration and verifies application health.
4. CI synchronizes image references and essential Job secrets on the **11
   existing Cloud.ru Jobs only**. Unchanged Jobs are not patched; no media
   images are built or published and no S3/CDN resources are modified.
5. Read-only Cloud.ru verification confirms actual state before the final
   read-only Beget CDN smoke reports a successful release.

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

## Updating Cloud.ru Job container references from GitHub

Existing GitHub **production Environment Variables** (already configured):
- `CLOUDRU_GALLERY_WORKER_IMAGE` → 2 Gallery Jobs
- `CLOUDRU_FEED_WORKER_IMAGE` → 4 Feed Jobs
- `CLOUDRU_QUESTIONS_WORKER_IMAGE` → 1 Questions Job
- `CLOUDRU_WORKER_PINS_REQUIRED=true` → fail closed if any of these three are missing

Optional `CLOUDRU_CHAT_PHOTO_IMAGE` (2 photo Jobs) and
`CLOUDRU_CHAT_VIDEO_IMAGE` (2 video Jobs) can be added later; without these
the existing Chat2 image digest is preserved.

Each image is `gafus.cr.cloud.ru/<repository>@sha256:<64 hex>` or a bare
`sha256:<64 hex>`. The repository must match the exact Job role; tags
such as `:latest` and arbitrary registries are rejected. A GitHub
Secret of the **same name takes precedence** over the Environment Variable.
This supports the historic Secrets delivery path without changing names.

**Change only the image URL in production Environment Variables or Secrets.**
An edit to GitHub Secrets/Variables **does not itself trigger a workflow**.
To apply immediately without rebuilding, run **Infrastructure & Jobs**
→ `apply-existing-jobs` with confirmation `UPDATE_11_EXISTING_JOBS`.
Alternatively, the next successful push to `main` automatically includes
the read-only preflight → app release → Job sync → read-only verify.
The separate `publish-media-images` action merely builds/publishes
new OCI images: you must then update the reference to the verified
digest to activate that image.

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
