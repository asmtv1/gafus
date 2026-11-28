# Stage 14 — scheduled backup and unified recovery follow-up (2026-11-27)

Implemented regular external capture job in existing daily-backup.yml, main
and explicit opt-in only, dedicated non-root labeled runner and separate
environment. Existing Yandex Disk DB backup unchanged. scheduled-capture.sh
requires canonical private config/secret paths, TLS verify-full and dedicated
gafus_backup database identity in read-only transaction, custom pg_dump,
encrypted independent archive and independent verify of exact snapshot.
Nonzero unmapped-reference count makes the job fail visibly without deleting
an archived snapshot. No production activation, secrets, runner or bucket
provisioning was performed.

Unified existing private A2 recovery exercise: actual service snapshot and
synthetic media+two X.509-signed OTA revisions go through existing encrypted
archive CLI before crash; after crash restores only archive output into new
PG and fresh object paths. Existing Hono/Chat2 Worker user scenario and ACK
remain end-of-RTO, with externalArchive receipt and storageMode. Real-provider
mode requires unique, explicitly approved synthetic-only source/archive/
restore buckets and separate QA credential files; only synthetic objects are
seeded. No production bucket access, no manifest rewriting, no cloud creds in
API/Worker. The default local path uses the existing file-backed S3 fixture.
The actual CDN and production snapshot recovery remain separate acceptance
requirements. Fixed nested socket path, resource budget and deterministic
locale in isolated PostgreSQL extraction; macOS scrubbed environment had
failed with 'postmaster became multithreaded during startup'.

Evidence: 12/12 external backup tests (four added integration contracts), 28/28
existing workflow/release graph contracts; real PG reference snapshot (29
mapped objects), real PG encrypted archive bridge test passed after source
dump path removal and media corruption, two signed OTA revisions restored
and actual pg_restore succeeded. Syntax of changed TS launchers/scripts and
git diff --check passed. Full A2 service drill attempted; blocked at
A2_LOCAL_BROKER_BINARY_UNAVAILABLE before fixture initialization. Workspace
CLI prerequisites also absent. Real provider mode not executed, scheduled
job not activated. No complete API/Worker RPO/RTO receipt, no real provider
CDN/IAM acceptance. No claim of 100% operational completion. No commit,
push, production deployment or migrations. See external-backup/README.md.
