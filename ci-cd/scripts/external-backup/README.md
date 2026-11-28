# External object and signed OTA backup / recovery

## Scope

Encrypted append-only archive, independent of source S3 endpoints, tied to one exact PostgreSQL custom-format dump. Full current object inventories for Cloud.ru Feed, Gallery/vet attachments, Chat2, documents, legacy questions, Questions V2, OTA and Yandex gafus-media. Add distinct legacy stores to sources and targets. Documents and questions may share a physical source bucket; scope copies remain independent. CDN is a derived cache: restore origins and separately validate delivery. SQL checks mapped structured media fields, READY variants, public upload locators and registered active/previous OTA. Unmapped counts are evidence gaps. Full bucket scans also copy objects outside these fields, but cannot recover external third-party media, historical S3 versions or control-plane settings. Review HTML links, HLS segments, pending jobs and account-erasure ledger. Never replay production purge/send jobs on recovered personal data.

## Setup (operator-owned; not activated automatically)

1. Provision a separate archive account/provider with S3 conditional writes and private bucket ACL/policy/public-access-block APIs. Independently enforce immutable retention, least privilege, key escrow and erasure/retention policy. Source profiles must be read-only. Archive credentials must not permit deletion or overwrite. Hostname checks do not prove actual account independence or retention. If required provider APIs are unsupported, stop; don't bypass the guard.
2. Provision private, empty isolated restore buckets named gafus-restore-... and separate scoped credentials. The script cannot create buckets, change ACLs, purge CDN, alter DNS or write production release pointers.
3. Copy config.example.json to a private config. Confirm every source bucket and additional legacy origin. Replace placeholder endpoints and AWS CLI profiles. Configure trustedOtaCertificates as key ID -> array of SHA-256 hashes of independently pinned native certificate PEM bytes; don't derive trust solely from restored DB. Include historical signing certificates. No private OTA signing key needed.
4. Generate a separate random 32-byte backup key and securely escrow outside archive account. Key and dump/reference files mode 0600; encrypted scratch volume with canonical absolute path and mode 0700. Set GAFUS_EXTERNAL_BACKUP_CONFIG, GAFUS_EXTERNAL_BACKUP_KEY_FILE, GAFUS_EXTERNAL_BACKUP_SCRATCH, GAFUS_EXTERNAL_BACKUP_PG_BIN (absolute path to compatible PG binaries). Use Node 24, AWS CLI v2, Python 3.9+, PostgreSQL; OpenSSL for tests. Approved non-root backup runner only.
5. Obtain trusted custom-format pg_dump (-Fc) from approved DBA job via authorized encrypted channel. Existing Yandex Disk SQL.gz backup is separate and is not a valid input. Coordinate writes and especially garbage collection during capture. DB and S3 are not a distributed transaction; missing referenced objects or changed inventories fail capture. Ensure disk/storage/runtime capacity: v1 rejects files above 4 GiB, no multipart or incremental backup.

## Operator commands

From repository root with approved environment and private files:

    GAFUS_EXTERNAL_BACKUP_CAPTURE_APPROVED=encrypted-independent-archive \
      bash ci-cd/scripts/external-backup/capture-production.sh /approved/private/database.dump

Record returned 32-hex snapshot ID and dump SHA-256 in protected ledger. Encrypted manifest written last; incomplete prefixes are not recoverable snapshots. No automatic deletion of partial or historical archives. Keep the key separately available for drills.

    node ci-cd/scripts/external-backup/run.mjs verify "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$ID" "verify-$ID"
    node ci-cd/scripts/external-backup/run.mjs restore "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$ID" "restore-$ID" "$GAFUS_EXTERNAL_BACKUP_SCRATCH/restored.dump"

Verify authenticates each encrypted object and checks plaintext sizes, digests, pinned OTA certificate/signature and native/asset bindings. Real mode restores recovered DB in a fresh socket-only PostgreSQL cluster and compares extracted reference inventory before destination writes. Restore repeats checks, requires private empty targets, conditional PUT, each restored object's readback and final inventory. Interrupted targets are quarantined; provision new isolated buckets rather than auto-delete or overwrite. Output is exact original dump, not modified/re-signed OTA.

## CDN and full service drill

Configure a new isolated CDN hostname starting gafus-restore-... with only restored origins and equivalent signing/access rules. Never touch live CDN/DNS. Supply private JSON plan: origin and probes array (scope, key, visibility private/public, url). Use staging signed URLs for private objects. Include gallery/vet/documents/feed, Chat2 and Questions V2 according to actual policy, course/HLS and active/previous OTA assets.

    node ci-cd/scripts/external-backup/run.mjs probe "$GAFUS_EXTERNAL_BACKUP_CONFIG" "$ID" "probe-$ID" /approved/private/delivery-probes.json

Probe compares actual delivered bytes/MIME to archive, tests unsigned access after warming private cache and rejects foreign origins/redirects. It samples delivery; not proof of all owner fences. Never rewrite signed manifest URL or re-sign. In a hermetic QA client/network only, map original OTA host/path to isolated origin and validate actual manifest selection and signature. Expired active/previous certificate fails closed.

Restore dump to dedicated staging PostgreSQL. Before starting real API/Worker, block all real email/push/billing, prod S3/CDN/purge endpoints and job routing, remove production credentials; use new Redis/broker, isolated credentials and synthetic authorized actors. Verify private course/walk/chat/media owner vs outsider, new outbox write and actual external ACK, previous OTA selection. Existing scripts/qa/observability-real-multi-instance-isolated.sh --restore-only is a synthetic local service scenario, not acceptance of this real external archive. Record last acknowledged pre-dump write, first recovered user operation and RPO/RTO. objectRestoreElapsedMs is object recovery time, not service RTO. Do not claim service/CDN readiness before actual receipts.

## Verification

    node --test ci-cd/scripts/external-backup/*.test.mjs
    bash ci-cd/scripts/external-backup/reference-snapshot.test.sh /path/to/pg/bin

Real AWS CLI test targets loopback only (skips if absent); file-backed S3 CLI is a deterministic fault-injection fixture only. Source-only suite wired into blocking observability-contracts CI. No automatic external backup schedule or production activation. Actual independent archive, IAM, key escrow, retention, provider API compatibility, staging CDN and service RPO/RTO need acceptance. Retain existing daily database backup.

## Scheduled integration (2026-11-27 follow-up)

The existing daily-backup workflow has a second, independent job gated by
repository variable GAFUS_EXTERNAL_BACKUP_ENABLED=true, main only, with
environment external-backup and runner labels self-hosted/linux/gafus-backup.
Do not place that runner in an untrusted-PR runner group. Provision it as a
non-root service account with the approved encrypted scratch and private
configuration/credentials at /var/lib/gafus-backup (config.json, key.bin,
scratch, pg_service.conf, pgpass); compatible PostgreSQL binaries under
/opt/gafus-backup/pg/bin. Configure the dedicated AWS profiles for that
service account. PostgreSQL connection service gafus_backup must specify
the approved server, TLS trust root and read-only backup role gafus_backup
on database gafus. No production DB credentials are passed via Actions.
The scheduler requires TLS with verify-full, correct identity, read-only
transaction, custom-format dump and independently verifies the committed
archive. Unmapped references fail the scheduled job after safe archive
creation. A failure is not permission to overwrite an earlier archive.
Existing Yandex Disk DB backup remains independent; activation requires
actual infrastructure provisioning, capacity and least-privilege review.

## Integrated service fixture / real provider mode

scripts/qa/observability-real-multi-instance-isolated.sh --restore-only now
uses the encrypted archive CLI for the actual service fixture dump, Chat2
media and two signed OTA revisions instead of copying the original files
after a simulated crash. It verifies a real X.509 code-signing certificate
and signed original URLs, restores a new PostgreSQL cluster from the
recovered dump, restarts 2 isolated APIs and 2 Chat2 Worker dispatchers,
checks authenticated actions/previous OTA bytes/ACK and records storageMode
and end-to-end RPO/RTO. The default storage is a file-backed S3 test fixture.
No original backup file is consumed by the restarted PG.

Optional actual S3 provider drill: provision a new random 12-hex drillId and
private empty buckets named gafus-qa-source-ID-SCOPE,
gafus-qa-archive-ID and gafus-restore-ID-SCOPE, with separately scoped
qa-read-ID-SCOPE, qa-seed-ID-SCOPE, qa-archive-ID and qa-restore-ID-SCOPE
profiles. Set the same source/target fields as config.example.json, plus
drillId, source seedProfile, and otaOrigin=https://ota-restore.invalid/gafus-qa-source-ID-ota.
Use empty trustedOtaCertificates (the fixture independently generates its
test certificate). Supply canonical private absolute paths via
A2_EXTERNAL_DRILL_CONFIG, A2_EXTERNAL_DRILL_AWS_CONFIG,
A2_EXTERNAL_DRILL_AWS_CREDENTIALS; explicitly set
A2_EXTERNAL_DRILL_APPROVED=synthetic-isolated-provider. The bridge rejects
any other bucket/profile names, uses only dedicated config/credentials,
checks private/empty buckets before writing, seeds synthetic objects only,
uses conditional writes and reads restored bytes from the target. The
service process is not given cloud credentials, and maps only its synthetic
signed locator to loopback fixture delivery. Keep failed/partial targets
quarantined; no automatic bucket deletion. Real-provider drill still uses
synthetic user data and does not prove production CDN policy or recovery of
an actual production snapshot. Run the separately configured CDN probe and
approved real snapshot recovery before claiming production acceptance.

Targeted integration test:
    bash scripts/qa/observability-external-archive.test.sh /path/to/pg/bin
This uses actual isolated PostgreSQL and signed synthetic assets, loses the
original input path and corrupts the original media before restoring.
No API or worker process is started by this targeted test.
