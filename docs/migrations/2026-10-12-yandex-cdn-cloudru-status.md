> **Решение владельца проекта, 12.10.2026:** существующих медиа на Яндексе для переноса **нет**. Миграцию объектов, обратную синхронизацию и двойную очистку legacy-хранилищ не выполнять. Это подтверждение владельца, а не результат независимого S3 inventory (dev-bucket ListObjects=403). Дальнейшие работы — только новая выдача медиа через Cloud.ru S3 + прежний Yandex CDN и staging-проверки. Актуальный отчёт: `2026-10-12-cloudru-staging-execution.md`.

# GAFUS Yandex CDN / Cloud.ru S3 readiness

Date: 2026-10-12. Code ready for gated staging; NOT enabled on production.

- Existing Gallery/Feed CDN query signing is MD5 + expires, NOT HMAC-SHA256.
- Yandex CDN origin remains Yandex API Gateway unless cloudru_origin_hostname is explicitly configured.
- Cloud.ru media buckets are private; live preflight blocked and IAM CORS/versioning access denied.
- Three Cloud.ru private buckets LIST allowed; Container Services and Jobs absent; Registry permission unavailable.
- Web/Mobile use core outage classification, never automatically bypass a known 403/404.
- API fallback reauthorizes gallery photo/media in core; HLS signs every .ts segment.
- Existing courses and avatar infrastructure must remain on Yandex.
- Actual Cloud.ru Origin + private CDN cache HIT signature-expiry acceptance, migration/dual-write E2E and rollback remain BLOCKED.
- Do not change production CDN, storage, feature flags or destroy infrastructure without owner approval.

## Tests and builds verified through AI Commander

- Cloud.ru contract suite: PASS (`pnpm test:cloudru-media`): CORS manifest, allowed buckets, cache-auth security model, owner-bound migration SHA-256/multipart.
- Full monorepo no-cache `pnpm exec turbo run typecheck lint --concurrency=2 --force`: **63/63** tasks PASS.
- Full monorepo no-cache `pnpm exec turbo run test --concurrency=1 --force`: **50/50** tasks PASS.
- Targeted fallback and CDN integration tests: Gallery, Feed, API, core policy, purge; Web CdnImage 403/404/503 negative paths PASS.
- Real isolated PostgreSQL `AccountStorageCleanup` cascade/transaction: **5/5** PASS on a newly created temporary local test-only PostgreSQL at 127.0.0.1:55439, with `prisma db push` PASS; test database service stopped after the test. Production PostgreSQL untouched.
- Web production build: **exit 0**, 108/108 static page generation. Isolated Next output directory; generated Next config changes restored to their exact pre-build bytes.
- Mobile TypeScript/Web TypeScript: PASS. Expo Android export (Hermes bundle) **exit 0**, no EAS release required. Native live-device iOS/Android smoke remains pending.
- Both Yandex Terraform module validations: PASS; changed-file `terraform fmt -check` PASS; `git diff --check` PASS.

## Operational blockers, not release-ready

Cloud.ru S3 private LIST allowed on all three audited buckets, but scoped IAM bucket CORS/versioning reads are denied, browser POST/GET CORS currently blocked; Container Apps Services/Jobs 0 and Registry access unavailable. Gallery/feed legacy private Yandex source buckets and credentials are not independently verified. Real CDN signed-URL **expiry on a warm cache**, Origin service network reachability, TLS/SNI and purge have not been exercised against a staged Cloud.ru origin. Therefore no actual user-media migration, no staged Cloud.ru deployment, no production activation or deletion took place. Future release requires owner approval for production switches and destructive actions.

Git: branch `main`, HEAD `05c5b67f` as of this audit; the workspace already contained hundreds of unrelated modified/untracked files. No migration commit, staging, push, merge or production deploy was performed to avoid mixing concurrent unrelated work. Review and isolate the complete migration patch before commit.
