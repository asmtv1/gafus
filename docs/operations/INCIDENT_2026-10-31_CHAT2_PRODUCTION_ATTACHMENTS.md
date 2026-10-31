# Chat 2.0: production attachment upload failure — 2026-10-31

## Symptom

Production Web chat displays «Не удалось загрузить вложение». The error is raised by
`apps/web-vite/src/features/chats/chat2Api.ts` when a multipart POST to
`/api/v1/chats/:id/attachments` receives an unsuccessful or malformed envelope.

## Code-level root cause

- The browser used the old multipart endpoint whenever the Vite build flag
  `VITE_CHAT2_MEDIA_V2` was absent/false. None of the tracked production Web
  build workflows configured that flag.
- The legacy S3 adapter in `packages/cdn-upload/src/chat2Media.ts` deliberately
  rejects all environments except `NODE_ENV=development` together with
  `GAFUS_ISOLATED_NONPROD_S3=enabled` and
  `CHAT2_PRIVATE_MEDIA_ENABLED=isolated-dev-only`. Hence the legacy
  upload route cannot handle production uploads.
- The API-side Chat Media V2 pipeline uses a different authenticated
  `reserve → S3 POST → confirm → READY → attach` flow. The intended production
  activation flags are API/worker runtime flags, **not** the Vite build flag.
- The old Web client discarded the response's diagnostic error and showed a
  generic message. Confirm the exact HTTP status/error for a failing user upload
  from production logs; anonymous `/health` returning HTTP 200 does not prove
  the attachment pipeline has working Cloud Jobs.

## Fix in Refactor (not deployed)

1. Production Web builds now use the authenticated Chat Media V2 flow for JPG,
   PNG, WebP and MP4 even if `VITE_CHAT2_MEDIA_V2` was not set at build time.
   Local development retains the existing isolated legacy path when no V2 opt-in
   is set. The V2 API remains fail-closed if disabled; no unsafe fallback.
2. Mobile release builds select the same V2 flow without depending on
   `EXPO_PUBLIC_CHAT2_MEDIA_V2`; local/dev builds preserve their existing
   feature-gated behavior and their explicit isolated-chat origin restrictions.
3. PDF remains unsupported in a production release build with an explicit
   Russian error instead of silently uploading via the known-disabled legacy
   path. **Do not** send private PDFs into the publicly readable V2 bucket.
   PDF needs a separately validated private-media pipeline and acceptance.

## Verification

- Web upload-contract Vitest: 6/6 PASS, including production missing-flag
  routing and PDF privacy guard.
- Mobile isolated-origin Vitest: 7/7 PASS, including release V2 routing and
  PDF guard.
- Production public health checks at investigation time: API `/health` 200,
  site `/` 200. This is not authenticated end-to-end proof.
- Typechecks for `@gafus/web-vite` and `@gafus/mobile`: PASS, exit 0
  (OneShot `b7b4f86df48e6b419f1957f3a5da08d2ef6bd2a5bc831452`). Tests do not prove
  live production S3 POST, processing, job dispatch, CDN/GET or message attachment.
- Latest GitHub Actions app-only workflow run `41184427313` at check time:
  `success`, but `deploy-app-only` and `verify-live-production` were **skipped**.
  It is not a successful production deployment or full live verification.
- Production-mode Vite Web build: PASS, exit 0 (OneShot
  `1f7e6982f776e3561ed9c75a8e9efaee6a8c78679bccfe9e`).
  Bundler emitted existing large-chunk/code-splitting warnings; they are not upload failures.

## Release and safety

No production API/Frontend/Worker deploy, no Cloud.ru Job change, and no
production PostgreSQL/S3/CDN mutation was performed. The four Chat2 Jobs are
**not** within the separate authorization for the four Feed Jobs.

Before marking fixed in production: review actual deployed runtime flags,
Cloud.ru Chat2 Job readiness and HMAC, apply only an explicitly authorized
application rollout, then perform a real user-controlled photo/video
reserve → S3 POST → confirm → READY → attach → message readback test, inspect
HTTP errors on failure, and verify Mobile native release separately. Do not
run synthetic jobs that might write production data.
