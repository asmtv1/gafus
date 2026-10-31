# Production incident — published Feed photo shows broken image (2026-10-31)

## Symptom

The publication is visible in «Моменты», but its first photograph renders as a broken image. This is **not** the earlier media-processing failure: read-only production PostgreSQL confirmed the newest post is `published`, its photo asset is `ready`, and `smallKey`, `thumbKey`, `fullKey` are populated.

## Verified root cause

* Scoped, credentialed Cloud.ru S3 `HeadObject` against the most recent real Feed V2 photo returned `200`, WebP for all three variants (15,050 / 35,156 / 45,002 bytes). Processing completed correctly.
* The currently configured production API's Beget signed CDN GET for the medium WebP returned `403`, `AccessDenied` (XML).
* Cloud.ru S3 anonymous GET for `https://gafus-feed-private.s3.cloud.ru/media/v2/<asset>/v1/image/m.webp` also returned `403` **before** the fix.
* Read-only `GetBucketPolicy` showed an existing single public `s3:GetObject` statement granting **only** `arn:aws:s3:::gafus-feed-private/posts/*/attachments/*`. Feed V2 writes immutable outputs at `media/v2/<asset>/v1/`, which were NOT publicly readable from the Beget CDN origin.
* The production API's CDN hostname was verified as `quepraquiecebquomiel.begetcdn.cloud`, matching the signer allowlist. The old Docker Compose default `garaquachegasourn.begetcdn.cloud` was not the live API value. Beget's Secure Token MD5 format matches the existing Feed signer. Do not change the CDN signing algorithm to fix an S3 origin ACL failure.

## Scoped production remediation completed

1. Read the exact `GetBucketPolicy` and `GetPublicAccessBlock` of **only** bucket `gafus-feed-private`. Public access policy was already enabled (`BlockPublicPolicy=false`, `RestrictPublicBuckets=false`), and existing policy already allowed anonymous reads under the legacy attachment prefix.
2. Saved the exact **prior** policy (0600, local outside Git) at `.local-pg-scratch/cloudru/feed-policy-before-public-v2-20261031.json`. Backup SHA-256 calculated on parsed JSON: `b293258b19b9c5ef56d4aade5656f54c3f41c806762223308d48df8e2c94718e`. Scoped utility: `.local-pg-scratch/cloudru/feed-v2-public-policy-fix-20261031.mjs` (private; do not rerun `--apply` because it intentionally refuses policy drift and an existing backup).
3. Appended a **single** new public-read statement `Sid=FeedV2PublishedVariantsPublicGetOnly20261031`, `Effect=Allow`, `Principal=*`, `Action=s3:GetObject`, exactly seven `Resource` ARN patterns: `media/v2/*/v1/image/s.webp`, `image/m.webp`, `image/l.webp`, `poster.webp`, `video/360.mp4`, `video/720.mp4`, and `video/1080.mp4` under `gafus-feed-private`.
4. Read back the effective policy: the original legacy statement is unchanged; only the new seven-variant statement was added. Cloud.ru reserialized the policy JSON, so the tool's **bytewise** JSON comparison initially flagged `POST_WRITE_POLICY_MISMATCH` even though the readback is semantically correct. No second policy write was attempted.
5. Independently confirmed by **anonymous public GET** against the real latest object: `s.webp HTTP 200 image/webp 15050 bytes`; `m.webp HTTP 200 image/webp 35156 bytes`; `l.webp HTTP 200 image/webp 45002 bytes`. A synthetic `posts/.../incoming/.../source.jpg` URL remained `HTTP 403` (it is not covered by either public statement). Other S3 buckets/policies, data objects, CDN settings, API and Cloud.ru Jobs were not modified.

### Verification still needed

A follow-up production CDN signed GET of this object must return `200 image/webp`, and the user should hard-refresh «Моменты» and see the photo. The attempt to execute the post-fix signed CDN probe was blocked by tooling, so **end-to-end CDN recovery has not yet been independently confirmed**. Do not silently treat an unrelated 403 or 404 as a CDN outage, and do not relax the 410/5xx-only fallback policy. A Beget edge may require cache expiration/purge if it cached a pre-fix 403; if signed CDN still returns 403, inspect the CDN's actual origin and Secure Token config.

### Rollback

Restore the saved exact original bucket policy using `PutBucketPolicy` **only if** a fresh readback exactly matches the two expected statements above; otherwise stop for concurrent changes. This removes only the new `Sid` and leaves the original attachment rule intact. Never blindly overwrite any concurrently edited bucket policy.
