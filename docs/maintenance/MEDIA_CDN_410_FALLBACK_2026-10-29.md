# CDN 410 Gone and fail-closed media fallback (GAFUS Refactor)

Scope: **Refactor only** (`apps/api`, `apps/web-vite`, `apps/mobile`). No production probing, PostgreSQL/S3 changes, secrets, push or deployment.

## Status rules

| Source signal | Per-object Web/Mobile fallback | Server synthetic health monitor |
| --- | --- | --- |
| CDN 200/204 | No | 200 is ambiguous for a non-existing monitor object |
| CDN 401/403 | **No** | Unknown: never switches CDN |
| CDN 404 | **No** | Healthy for a freshly signed, guaranteed-missing monitor key |
| CDN 410 | Eligible **only after per-object probe** and server media-specific authorization | Failed: two consecutive independent probes required before service-wide switch |
| CDN 5xx | Eligible **only after per-object probe** and server media-specific authorization | Failed: two consecutive probes required |
| Opaque Web CORS failure | **No** | Not observable from client; Hono proxy returns a status instead |
| Mobile native network error/timeout | Individual request may try an authorized fallback; cannot open a service-wide circuit | N/A |
| Expired/unknown/unsigned media URL | **No** | No probe on unknown URLs |

For source failures, Web always HEAD-probes that **exact signed media URL** via the same-origin authenticated, allowlisted CDN status API; Mobile probes directly with native networking. A previous 504 on *another* file is not a grant to bypass a 403/404 on this file. The existing client 60-second circuit state remains diagnostic but no longer skips those media-specific checks. The Mobile server-health optimization may preselect Cloud.ru only when fresh, verified *server* health declares a service unavailable; this is not an ACL grant and still requires the individual API fallback endpoint to authorize that object.

For 410 on an individual URL, the client does **not** poison all media: it requests one media-specific alternative, with a strict one-time retry. For service-wide 410, the API monitor checks unique signed **nonexistent final-media keys** and requires two failures (15 seconds apart) per CDN. A 403/404 cannot open the outage circuit; two successful 404 probes restore CDN preference.

The monitoring Feed URL previously used the retired legacy `posts/.../thumb.webp` and path-style `md5(...)` signing. It now uses the same final object path as Feed Media V2 (`/media/v2/{id}/v1/image/s.webp`) and the same Beget query-token signing algorithm as `packages/feed-storage/src/storage.ts`. Gallery retains its established path-token signing. This avoids false CDN outage reports from invalid monitor URLs.

## Authorization invariant

- CDN probe endpoint `GET /api/v1/media-cdn-probe` only accepts authenticated callers and approved, short-lived, signed, exact-host media URLs; it returns **status only**, no original response body, S3 keys or secrets.
- A positive probe or health flag **never** generates an S3 URL. Only existing Hono/Core Feed (`POST /api/v1/feed/media/:id/fallback`) or Gallery (`POST /api/v1/gallery/photos/:id/fallback`) endpoints grant the signed Cloud.ru alternative after actor-specific `fallbackSource` authorization and validation of variant/key.
- A denied/unknown/deleted media object still fails closed (401/403/404) even when the CDN itself returned 410/504. The UI must display an unavailable placeholder instead of an S3 URL.

## Test matrix

- `apps/api/src/lib/media-cdn-monitor.test.ts`: verifies correct Feed V2 signature, unique probes, two 410 rounds, independent CDN state, 403/404 response treatment and recovery hysteresis.
- `apps/api/src/routes/v1/media-cdn-probe.test.ts`: preserves 401/403/404/410/504 from CDN, rejects unauthorized callers/URLs.
- `apps/web-vite/src/features/gallery/GalleryImageFallback.test.tsx`: confirms 403/404 blocked, 410/503 per-photo authorized recovery.
- `apps/web-vite/src/features/moments/FeedCdnImage.test.tsx`: confirms 403/404 blocked, 410/504 fallback, 401/403/404 API grant refusal and S3 signature validation.
- `apps/mobile/src/shared/components/media/CdnImage.test.tsx`: verifies 410 native HEAD fallback; a previous 504 circuit does not override a later 403; unsigned/untrusted URLs never trigger fallback; signed images cannot leak across account switches.
- Existing `packages/core/src/services/mediaDelivery/index.test.ts` confirms 410 is per-object, while only 5xx opens a local CDN circuit.
- Existing `packages/feed-server/src/index.test.ts` and `packages/gallery-server/src/dispatcher.test.ts` cover refusal by the actor-scoped `fallbackSource` authority.

Remaining validation before any separate, explicitly authorized production rollout: real CDN 410 response and media playback on native devices, and end-to-end fallback with authorized and forbidden real users in an isolated environment. No live production or cloud state was changed.
