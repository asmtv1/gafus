# Production panel login: incorrect trusted browser origins (2026-10-31)

## Symptom

Admin login page displayed `Недостаточно прав` even for `admin`, before a role-aware session could be established. The UI mapped all HTTP 403 responses to a permissions error.

## Confirmed root cause

- Production edge config (`ci-cd/nginx/conf.d/gafus.ru.conf`) serves the admin panel on `https://adminka.gafus.ru` and the trainer panel on `https://trainer-panel.gafus.ru`.
- API browser-cookie origin allowlist (`apps/api/src/middleware/cors.ts`) instead included `https://admin.gafus.ru` and `https://trainer.gafus.ru`.
- An unauthenticated production diagnostic POST to `https://adminka.gafus.ru/api/v1/auth/login`, with its matching Origin and an intentionally nonexistent username, returned `403` and `{"success":false,"error":"Недоверенный Origin"}`. The identical check against the trainer host returned the same error.
- The same diagnostic on `https://api.gafus.ru`, with `Origin: https://admin.gafus.ru`, returned expected `401 Неверные учётные данные`. No real user password or cookie was used. No production data was changed.
- This does **not** establish that `admin` has lost its `ADMIN` role; the request was denied *before credential verification*.

## Refactor changes

- The exact production HTTPS origins now match the deployed DNS/edge hosts; obsolete hostnames are removed from browser-cookie trust and cross-origin credentialed allowlist.
- The admin UI now identifies `403 Недоверенный Origin` as a deployment/configuration error, not a user-role error.
- The trainer panel now distinguishes this Origin rejection from a bad password (401), genuine permission denial (403), and temporary API errors. Its cookie-only session transport and role checks are unchanged.
- Contract tests cover both real panel hosts, reject obsolete and forged variants, require secure HttpOnly cookies, and keep actual permission denials distinct. Trainer login tests also verify safe error messages without leaking server internals.

## Safe release/verification checklist

Production code deployment requires its own authorization. **No deployment, production database mutation, schema migration, or production configuration change was performed in this incident investigation.**

For an independently authorized release, record the previous API image digest and deployment configuration for rollback. Release the updated API and both updated panel UIs (admin and trainer) together to keep diagnostics consistent. After rollout, a dummy-credentials POST through each real panel host with its matching Origin must return `401 Неверные учётные данные`, not `403 Недоверенный Origin` (avoid repeated guesses/rate limits). A real admin should then authenticate, receive a session and be able to navigate authorized sections. Verify the trainer panel separately. Check API health and logs without exposing user credentials or cookies; roll back the previous image/configuration on regression.
