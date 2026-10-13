# Deploy Only (production)

Use **GitHub Actions → Deploy Only → Run workflow → main** only when a
**completed, tested main CI build** has already published all seven images
for the *current* main commit. This workflow does not rebuild anything.

**Guarantees**

- Uses the same reusable production job as CI/CD Pipeline; both share the
  `gafus-production-deploy` concurrency group.
- Verifies the main commit has successful security, app tests, Cloud.ru
  preparations and all seven image builds.
- Pulls every GHCR image from `sha-<release-commit>` and only then retags
  local `:latest` references consumed by Compose.
- Recreates the full production `.env` from the same GitHub production
  secrets/variables as main CI. It does not reuse the old incomplete
  Deploy Only secret list.
- Uses the coordinated HTTPS maintenance gate, stops application writers
  before the PostgreSQL snapshot, checks the backup, applies Prisma
  migrations, starts the new services and checks health.
- If migrations may have started, the production maintenance gate remains
  active on failure. Never roll older images onto a newer Prisma schema.

**Limitations**

- A build with missing SHA-tagged images, a failed security/test/media
  preparation job, or a main branch that moved since dispatch is **rejected**.
- `Deploy Only` is not a rollback facility and cannot deploy a previous
  commit. Plan a schema-compatible rollback separately.
- Cloud.ru CDN activation remains exclusive to the main push pipeline.
  `Deploy Only` reuses an already validated Cloud.ru configuration.
- No Mobile binary is produced; release artifacts for Mobile are separate.
