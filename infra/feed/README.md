# Feed production infrastructure

Feed has its own private bucket, processing queues, service accounts, Lockbox secrets and photo/video containers. The Terraform backend uses the separate `feed/production/terraform.tfstate` key; never substitute the Gallery state key.

Media uses the existing `https://gallery-dev.gafus.ru` CDN. Its API Gateway retains the Gallery catch-all route and adds `/posts/{path+}` to the private Feed origin. Feed reuses that CDN's signing key and origin header secret; runtime storage credentials remain separate. No second CDN or DNS record is required. The optional standalone Feed gateway/certificate are not the active media delivery path.

Local `.secrets`, Terraform state, plan files and tfvars must remain ignored. `scripts/terraform.mjs` captures provider output and prints sanitized status. Review `show -json feed.tfplan` before applying that saved plan. Worker image references must be immutable digests. Leave `enable_triggers=false` until production migrations and the HMAC-protected internal API are available.

Production workflow creates and verifies a private local `pg_dump -Fc` before migrations. GitHub production variables control `FEED_ENABLED`, `FEED_PROCESSOR_READY`, `FEED_MAINTENANCE_ENABLED`, `FEED_PUSH_ENABLED`; defaults are false. Disable these variables and redeploy to stop public Feed/push/maintenance without deleting additive tables or storage. Queue triggers can independently be disabled through this module. Do not roll back by dropping Feed tables or deleting production objects.

Gallery route configuration is declared in `infra/gallery/cdn.tf` with optional Feed IDs. Updating this shared gateway must preserve every existing route and must not apply unrelated Gallery changes.
