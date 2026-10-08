# Gallery implementation contract

**Status:** aligned with the implemented gallery service, transports, clients, and cloud worker (2026-10-08).

## Product and security rules

- All gallery reads and writes require authentication. New albums default to visible. Only the owner can edit albums or photos, choose covers, move photos, upload, or delete. Hidden albums and their photos are owner-only; direct ID requests enforce the same rule.
- A user has at most **200 ready plus active pending/processing photos** across albums. Core reserves capacity in a serialized owner transaction. Upload reservation is 15 minutes; direct POST expires in 10 minutes.
- If the user has no albums, the first upload creates **«Фотографии»**. Albums support CRUD, visibility, captions, cover selection, and moving a photo between albums. A move keeps the source representation available until verified destination objects are published and the association switches; cleanup is durable.
- Accepted source formats are JPG, PNG, and WebP, up to **10 MiB** and **50 megapixels**. The processor inspects actual bytes, rejects corrupt/animated images, auto-orients and strips metadata, then encodes WebP at quality 82. Thumbnail and full variants target maximum edges 480 px and 1920 px; high-entropy outputs reduce dimensions adaptively and are capped at **1,750,000 bytes each** (minimum edge 256 px). Do not upscale.
- App servers handle bounded JSON metadata only. The client sends image bytes directly to the private bucket using the presigned POST. Source and attempt objects are staging; only published final objects receive viewer URLs.
- Final object keys, for both variants, are `albums/{ownerId}/{albumId}/photos/{photoId}/thumb.webp` and `.../full.webp`. Source is `albums/{ownerId}/{albumId}/incoming/{uploadId}/source.{jpg|png|webp}`; attempt outputs live below `incoming/{uploadId}/attempts/{attemptToken}/`. Never return keys or source URLs in public DTOs.
- CDN URLs are signed for **120 seconds maximum**. `urlsExpireAt` marks image URL expiry. Origin is private and accepts only validated final `thumb.webp`/`full.webp` GET/HEAD paths. Responses to viewers are private/no-store. Web uses ordinary image URLs or Next Image `unoptimized`; mobile gallery images use memory cache only. Do not persist image data or signed URLs.
- `GALLERY_ENABLED` is the server/cloud product gate and accepts exact `true`/`false`; enabled storage configuration additionally requires `GALLERY_PROCESSOR_READY=true`. Keep disabled until cloud gates pass. List DTOs carry `enabled`; clients must hide gallery entry points when disabled. Disabled mode still allows durable delete cleanup through maintenance.

## Shared DTOs and transport

The implemented exports are in `packages/types/src/gallery.ts`; `createGalleryClient(transport)` injects transport. Limits, MIME types, input DTOs, list DTOs, and status unions are shared. Important fields:

- `GalleryAlbumDto`: `id`, `ownerId`, `ownerUsername`, `name`, nullable `description`, `isVisible`, nullable `coverPhotoId`, optional nullable `coverThumbUrl`, nullable `urlsExpireAt`, `photoCount`, timestamps, `canEdit`.
- `GalleryPhotoDto`: `id`, `albumId`, nullable `caption`, status `pending | processing | ready | moving | failed`, owner-only optional upload/error details, nullable `thumbUrl`/`fullUrl`, nullable dimensions, nullable `urlsExpireAt` and reservation `expiresAt`, `createdAt`, `canEdit`. Pending/processing records are visible only to the owner; other viewers see ready photos only. A moving photo is represented as ready to nonowners while its old published representation remains available.
- `GalleryUploadDto`: upload/album IDs, status `reserved | uploaded | processing | ready | failed | cancelled | expired`, optional safe error details, nullable POST URL/fields/expiry, reservation expiry, and nullable photo.
- Album and photo list results use `{ items, nextCursor, usedSlots, limit, isOwner, enabled }`. `GalleryErrorDto` contains `code`, `message`, HTTP `status`, optional safe `details`.
- Upload reservation inputs include `filename`, `declaredMime`, `declaredBytes`, optional `albumId`/caption, and `clientRequestId`; retry allocates a new request ID once per logical retry and replays that same ID after response loss. Core validates inputs and remains authoritative for authorization, quota, visibility, and transitions.

## Public endpoint map

All paths are under `/api/v1/gallery`; every endpoint is authenticated. Hono uses JWT; web uses NextAuth and CSRF on mutations. Responses are `Cache-Control: no-store`. Public adapters return `{success:true,data:<DTO>}` or a structured error; the signed internal adapter returns bare core JSON DTOs.

| Method and path | Operation |
| --- | --- |
| `GET /profiles/:username/albums` | Cursor list; visible albums for others, all albums for owner |
| `POST /albums` | Create album |
| `GET`, `PATCH`, `DELETE /albums/:albumId` | Read/update/delete album |
| `GET /albums/:albumId/photos` | Cursor photo list |
| `POST /albums/:albumId/uploads` or `POST /uploads` | Reserve upload (first-upload default album may omit album ID) |
| `GET`, `DELETE /uploads/:uploadId` | Read status / cancel unfinished upload |
| `POST /uploads/:uploadId/complete`, `POST /uploads/:uploadId/retry` | Confirm uploaded object / retry eligible upload |
| `GET`, `PATCH`, `DELETE /photos/:photoId` | Read/update caption/delete photo |
| `PUT /albums/:albumId/cover` | Set or clear cover |
| `POST /photos/:photoId/move` | Move photo to destination album |

Signed internal POSTs are `/internal/gallery/uploads/{claim,complete,fail}`, `/internal/gallery/jobs/{claim,complete,fail}`, and `/internal/gallery/maintenance`. HMAC covers exact path/body, timestamp and nonce; nonce consumption uses Redis `SET NX`. These calls do not accept public actor identity or arbitrary object keys. Cloud entrypoints stay isolated from Prisma and invoke core through this adapter.

## Ownership and design constraints

- **Core/database:** gallery service, persistence/migration, transactional ownership/quota checks, visibility, state transitions, URL authorization, and durable storage cleanup jobs.
- **Storage/cloud:** private bucket and CDN signing, direct POST policy, object events/queue/DLQ, isolated worker, image validation/encoding, durable publish/move/delete jobs and source cleanup. Cloud never decides gallery permissions or quotas.
- **Transport:** shared JSON dispatcher; web NextAuth/CSRF adapter and Hono/JWT adapter; no image bytes pass through these services.
- **Types:** shared DTOs, limits, requests, errors, and injected client in `@gafus/types`.
- **Mobile navigation:** own gallery opens from the «Фотоальбомы» menu row in «Прочее» (`/profile/albums`); the own profile contains no gallery preview. Foreign profiles retain the gallery preview.
- **Web/mobile:** preserve existing profile layout, palette, spacing, components, and interaction patterns. Keep gallery queries separate from public-profile caches and qualify keys by viewer identity plus target profile/album. Clear private memory state on identity changes. Show owner controls only to the owner; handle loading, empty, retry, upload progress, processing, failure/retry, quota, denied permissions, and URL refresh.

## Acceptance and evidence boundary

Verify owner/nonowner and hidden direct-ID authorization; concurrent reservations never exceed 200; cancel/expiry/failure release slots; retry and callbacks are idempotent; disabled mode hides/rejects gallery work while delete cleanup runs; invalid, animated, over-size and over-pixel sources never publish; adaptive WebP output stays within the byte cap; moves retain source on failure; and deletion eventually removes objects. Query/image caches must remain private and nonpersistent.

Repository QA has local PostgreSQL integration and automated package/client checks recorded in [gallery-release.md](gallery-release.md). Browser fixture rendering does not prove provider behavior or native device interactions. Production cloud, billing attachment, and store/device proof remain release gates.
