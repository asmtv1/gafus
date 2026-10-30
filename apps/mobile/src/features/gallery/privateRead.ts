/* eslint-disable @gafus/require-client-catch-tracer -- malformed signed URLs are expected; never log signature parameters. */
import {
  createGalleryClient,
  type GalleryAlbumDto,
  type GalleryPhotoDto,
  type GalleryListDto,
} from "@gafus/types";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { galleryTransport } from "@/shared/lib/api/gallery";

export type GalleryActor = { ownerId: string; authEpoch: string };
export function verifiedGalleryActor(): GalleryActor | null {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !auth.isAuthenticated ||
    auth.isLoading ||
    !auth.user?.id ||
    binding?.principalId !== auth.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: auth.user.id, authEpoch: binding.authEpoch };
}
export function sameGalleryActor(actor: GalleryActor | null): boolean {
  if (!actor) return false;
  const current = verifiedGalleryActor();
  return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
}
export function privateGalleryReads(actor: GalleryActor, live: () => boolean = () => true) {
  const guard = () => sameGalleryActor(actor) && live();
  const transport = async <T>(
    path: string,
    options?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
  ): Promise<T> => {
    if (!guard() || (options?.method && options.method !== "GET"))
      throw new Error("GALLERY_SESSION_CHANGED");
    const result = await galleryTransport<T>(path, { ...options, requestGuard: guard });
    if (!guard()) throw new Error("GALLERY_SESSION_CHANGED");
    return result;
  };
  return createGalleryClient(transport);
}

const stringOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const safeUrl = (url: unknown): string | null => {
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    )
      return null;
    return url;
  } catch {
    return null;
  }
};
/** Default 5-second safety margin leaves time for an HTTP renewal. Invalid expiry is never trusted. */
export function signedGalleryUrl(url: unknown, expiry: unknown, now = Date.now()): string | null {
  if (typeof expiry !== "string") return null;
  const expires = Date.parse(expiry);
  return Number.isFinite(expires) && expires - now > 5_000 ? safeUrl(url) : null;
}
export function galleryExpiryDelay(
  items: readonly { urlsExpireAt: string | null }[],
  now = Date.now(),
): number | null {
  const times = items.flatMap((item) => {
    if (!item.urlsExpireAt) return [];
    const parsed = Date.parse(item.urlsExpireAt);
    return Number.isFinite(parsed) ? [parsed - now - 5_000] : [];
  });
  return times.length ? Math.max(1000, Math.min(...times)) : null;
}
export function publicGalleryAlbum(input: GalleryAlbumDto, now = Date.now()): GalleryAlbumDto {
  return {
    id: stringOrEmpty(input.id),
    ownerId: stringOrEmpty(input.ownerId),
    ownerUsername: stringOrEmpty(input.ownerUsername),
    name: stringOrEmpty(input.name),
    description: typeof input.description === "string" ? input.description : null,
    isVisible: input.isVisible === true,
    coverPhotoId: input.coverPhotoId ?? null,
    coverDisplayPhotoId: input.coverDisplayPhotoId ?? null,
    coverThumbUrl: signedGalleryUrl(input.coverThumbUrl, input.urlsExpireAt, now),
    urlsExpireAt: input.urlsExpireAt ?? null,
    photoCount: input.photoCount,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    canEdit: input.canEdit === true,
  };
}
export function publicGalleryPhoto(input: GalleryPhotoDto, now = Date.now()): GalleryPhotoDto {
  return {
    id: stringOrEmpty(input.id),
    albumId: stringOrEmpty(input.albumId),
    caption: typeof input.caption === "string" ? input.caption : null,
    status: input.status,
    uploadId: null,
    errorCode: null,
    // Never echo a free-form provider error: it could include private S3 keys/URLs.
    errorMessage: input.status === "failed" ? "Не удалось обработать фотографию." : null,
    thumbUrl: signedGalleryUrl(input.thumbUrl, input.urlsExpireAt, now),
    fullUrl: signedGalleryUrl(input.fullUrl, input.urlsExpireAt, now),
    width: input.width,
    height: input.height,
    urlsExpireAt: input.urlsExpireAt ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.createdAt,
    canEdit: input.canEdit === true,
  };
}
export function projectGalleryPage<T extends GalleryAlbumDto | GalleryPhotoDto>(
  page: GalleryListDto<T>,
  kind: "albums" | "photos",
  now = Date.now(),
): GalleryListDto<T> {
  if (!page || !Array.isArray(page.items)) throw new Error("GALLERY_INVALID_LIST_RESPONSE");
  return {
    items: page.items.map((item) =>
      kind === "albums"
        ? publicGalleryAlbum(item as GalleryAlbumDto, now)
        : publicGalleryPhoto(item as GalleryPhotoDto, now),
    ) as T[],
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
    usedSlots: page.usedSlots,
    limit: page.limit,
    isOwner: page.isOwner === true,
    enabled: page.enabled === true,
  };
}
