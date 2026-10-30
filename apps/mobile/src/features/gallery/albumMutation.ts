import type {
  GalleryAlbumDto,
  GalleryAlbumCreateInput,
  GalleryAlbumUpdateInput,
} from "@gafus/types";
import { galleryTransport } from "@/shared/lib/api/gallery";
import { reportClientError } from "@/shared/lib/tracer";
import {
  privateGalleryReads,
  publicGalleryAlbum,
  sameGalleryActor,
  type GalleryActor,
} from "./privateRead";

export type AlbumCoverResult =
  | { status: "confirmed"; album: GalleryAlbumDto }
  | { status: "invalid" | "rejected" | "unknown" | "stale" };

/** Original PUT /gallery/albums/:id/cover then protected owner GET.
 * Never automatically replay PUT on 401, timeout or an unknown ACK.
 */
export async function setAlbumCoverAndReadback({
  actor, ownerUsername, album, photoId, live,
}: {
  actor: GalleryActor;
  ownerUsername: string;
  album: GalleryAlbumDto;
  photoId: string;
  live: () => boolean;
}): Promise<AlbumCoverResult> {
  const guard = () => live() && sameGalleryActor(actor);
  if (!guard()) return { status: "stale" };
  if (album.ownerId !== actor.ownerId || album.ownerUsername !== ownerUsername ||
    !album.canEdit || !/^[A-Za-z0-9_-]{1,128}$/.test(album.id) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(photoId))
    return { status: "invalid" };
  try {
    const ack = await galleryTransport<GalleryAlbumDto>(
      `albums/${encodeURIComponent(album.id)}/cover`, {
        method: "PUT", body: { photoId }, requestGuard: guard,
        skipAuthRefreshReplay: true,
      },
    );
    if (!guard()) return { status: "stale" };
    const coverMatches = (value: GalleryAlbumDto | null | undefined) =>
      !!value && value.id === album.id && value.ownerId === actor.ownerId &&
      value.ownerUsername === ownerUsername && value.canEdit === true &&
      value.coverPhotoId === photoId;
    if (!coverMatches(ack)) return { status: "unknown" };
    const fresh = await privateGalleryReads(actor, live).getAlbum(album.id);
    if (!guard()) return { status: "stale" };
    if (!coverMatches(fresh)) return { status: "unknown" };
    return { status: "confirmed", album: publicGalleryAlbum(fresh) };
  } catch (error) {
    if (!guard()) return { status: "stale" };
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "VALIDATION" || code === "FORBIDDEN" ||
        code === "NOT_FOUND" || code === "GALLERY_DISABLED")
      return { status: "rejected" };
    reportClientError(new Error("GALLERY_COVER_WRITE_OR_READBACK_UNKNOWN"), {
      issueKey: "GalleryAlbumMutation", keys: { operation: "cover_and_verify" },
    });
    return { status: "unknown" };
  }
}

export type AlbumDraft = { name: string; isVisible: boolean };
export type AlbumSaveResult =
  | { status: "confirmed"; album: GalleryAlbumDto }
  | { status: "unchanged" | "invalid" | "rejected" | "unknown" | "stale" };

/** Only owner-controlled fields are writable. The update contract is PATCH, not a full DTO PUT. */
export function albumChangedFields(
  original: GalleryAlbumDto,
  draft: AlbumDraft,
): GalleryAlbumUpdateInput {
  const result: GalleryAlbumUpdateInput = {};
  if (original.name !== draft.name.trim()) result.name = draft.name.trim();
  if (original.isVisible !== draft.isVisible) result.isVisible = draft.isVisible;
  return result;
}

const isSameAlbum = (
  value: GalleryAlbumDto | null | undefined,
  actor: GalleryActor,
  username: string,
  albumId: string,
  fields: GalleryAlbumUpdateInput,
): value is GalleryAlbumDto =>
  !!value &&
  value.id === albumId &&
  value.ownerId === actor.ownerId &&
  value.ownerUsername === username &&
  Object.entries(fields).every(
    ([field, expected]) => (value as unknown as Record<string, unknown>)[field] === expected,
  );

/** One bounded write followed by exactly one GET. No retry on an unknown write result. */
export async function saveAlbumAndReadback({
  actor,
  ownerUsername,
  original,
  draft,
  live,
}: {
  actor: GalleryActor;
  ownerUsername: string;
  original?: GalleryAlbumDto;
  draft: AlbumDraft;
  live: () => boolean;
}): Promise<AlbumSaveResult> {
  const isLive = () => live() && sameGalleryActor(actor);
  if (!isLive()) return { status: "stale" };
  const normalized = draft.name.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    ownerUsername.length === 0 ||
    (original &&
      (original.ownerId !== actor.ownerId ||
        original.ownerUsername !== ownerUsername ||
        !original.canEdit))
  )
    return { status: "invalid" };
  const fields = original
    ? albumChangedFields(original, { name: normalized, isVisible: draft.isVisible })
    : ({ name: normalized, isVisible: draft.isVisible } satisfies GalleryAlbumCreateInput);
  if (Object.keys(fields).length === 0) return { status: "unchanged" };
  const guard = () => isLive();
  const method = original ? "PATCH" : "POST";
  const path = original ? `albums/${encodeURIComponent(original.id)}` : "albums";
  try {
    if (!guard()) return { status: "stale" };
    const ack = await galleryTransport<GalleryAlbumDto>(path, {
      method,
      body: fields,
      requestGuard: guard,
    });
    if (!guard()) return { status: "stale" };
    const savedId = original?.id ?? ack?.id;
    // A JSON 200 is not proof that the write was persisted by our owner.
    if (!savedId || !isSameAlbum(ack, actor, ownerUsername, savedId, fields))
      return { status: "unknown" };
    const readback = await privateGalleryReads(actor, live).getAlbum(savedId);
    if (!guard()) return { status: "stale" };
    if (!isSameAlbum(readback, actor, ownerUsername, savedId, fields)) return { status: "unknown" };
    return { status: "confirmed", album: publicGalleryAlbum(readback) };
  } catch (error) {
    if (!guard()) return { status: "stale" };
    const code = (error as { code?: unknown } | null)?.code;
    // Only definitive, structured server rejections; a timeout/5xx/lost ACK stays UNKNOWN.
    if (
      code === "VALIDATION" ||
      code === "FORBIDDEN" ||
      code === "NOT_FOUND" ||
      code === "GALLERY_DISABLED"
    )
      return { status: "rejected" };
    // Never report the raw error: it may contain a signed URL or private object key.
    reportClientError(new Error("GALLERY_ALBUM_WRITE_OR_READBACK_UNKNOWN"), {
      issueKey: "GalleryAlbumMutation",
      keys: { operation: "save_and_verify" },
    });
    return { status: "unknown" };
  }
}
