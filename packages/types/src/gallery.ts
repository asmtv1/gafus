/** Platform-independent gallery contracts. Transport injects authentication and no-store policy. */
export const GALLERY_LIMITS = {
  slots: 200,
  albumName: 120,
  caption: 2000,
  photoBytes: 10 * 1024 * 1024,
  pixels: 50_000_000,
  pageSize: 20,
  maxPageSize: 50,
  postSeconds: 600,
  reservationSeconds: 900,
  urlSeconds: 300,
  leaseSeconds: 120,
  attempts: 3,
  storageAttempts: 5,
  uploadRetries: 3,
} as const;
export const GALLERY_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type GalleryPhotoStatus = "pending" | "processing" | "ready" | "moving" | "failed";
export type GalleryUploadStatus =
  | "reserved"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired";
export interface GalleryAlbumDto {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string | null;
  isVisible: boolean;
  coverPhotoId: string | null;
  /** Effective preview (first visible photo when no cover is explicitly selected). */
  coverDisplayPhotoId?: string | null;
  coverThumbUrl?: string | null;
  urlsExpireAt: string | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}
export interface GalleryPhotoDto {
  id: string;
  albumId: string;
  caption: string | null;
  status: GalleryPhotoStatus;
  /** Core always populates these; optional for compatibility with existing DTO fixtures. */
  uploadId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  thumbUrl: string | null;
  fullUrl: string | null;
  width: number | null;
  height: number | null;
  urlsExpireAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  canEdit: boolean;
}
export interface GalleryUploadDto {
  uploadId: string;
  albumId: string;
  status: GalleryUploadStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  postUrl: string | null;
  postFields: Record<string, string> | null;
  expiresAt: string | null;
  reservationExpiresAt: string;
  photo: GalleryPhotoDto | null;
}
export interface GalleryListDto<T> {
  items: T[];
  nextCursor: string | null;
  usedSlots: number;
  limit: number;
  isOwner: boolean;
  enabled: boolean;
}
export type GalleryAlbumListDto = GalleryListDto<GalleryAlbumDto>;
export type GalleryPhotoListDto = GalleryListDto<GalleryPhotoDto>;
export interface GalleryErrorDto {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}
export interface GalleryAlbumCreateInput {
  name: string;
  description?: string | null;
  isVisible?: boolean;
}
export type GalleryAlbumUpdateInput = Partial<GalleryAlbumCreateInput>;
export interface GalleryPhotoUpdateInput {
  caption: string | null;
}
export interface GalleryUploadInput {
  albumId?: string | null;
  filename: string;
  declaredMime: (typeof GALLERY_MIME_TYPES)[number];
  declaredBytes: number;
  caption?: string | null;
  clientRequestId: string;
}
export interface GalleryUploadCompleteInput {
  uploadId: string;
}
export interface GalleryUploadRetryInput {
  clientRequestId: string;
}
export interface GalleryCoverInput {
  photoId: string | null;
}
export interface GalleryMoveInput {
  albumId: string;
  clientRequestId: string;
}
export interface GalleryListQuery {
  cursor?: string | null;
  pageSize?: number;
}
export interface GalleryProfileAlbumsInput extends GalleryListQuery {
  username: string;
}
export interface GalleryAlbumPhotosInput extends GalleryListQuery {
  albumId: string;
}
export interface GalleryMoveDto {
  jobId: string | null;
  photo: GalleryPhotoDto;
}
export type GalleryTransport = <T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
  },
) => Promise<T>;
export function createGalleryClient(transport: GalleryTransport) {
  const id = encodeURIComponent;
  const query = (q: GalleryListQuery = {}) => {
    const params = new URLSearchParams();
    if (q.cursor) params.set("cursor", q.cursor);
    if (q.pageSize !== undefined) params.set("pageSize", String(q.pageSize));
    return params.size ? `?${params}` : "";
  };
  return {
    listAlbums: (username: string, q?: GalleryListQuery) =>
      transport<GalleryAlbumListDto>(`profiles/${id(username)}/albums${query(q)}`),
    createAlbum: (body: GalleryAlbumCreateInput) =>
      transport<GalleryAlbumDto>("albums", { method: "POST", body }),
    getAlbum: (albumId: string) => transport<GalleryAlbumDto>(`albums/${id(albumId)}`),
    updateAlbum: (albumId: string, body: GalleryAlbumUpdateInput) =>
      transport<GalleryAlbumDto>(`albums/${id(albumId)}`, { method: "PATCH", body }),
    deleteAlbum: (albumId: string) =>
      transport<{ id: string }>(`albums/${id(albumId)}`, { method: "DELETE" }),
    listPhotos: (albumId: string, q?: GalleryListQuery) =>
      transport<GalleryPhotoListDto>(`albums/${id(albumId)}/photos${query(q)}`),
    // null album is the first-upload default-album scenario; dispatcher maps uploads to reserveUpload.
    reserveUpload: (body: GalleryUploadInput) =>
      transport<GalleryUploadDto>(body.albumId ? `albums/${id(body.albumId)}/uploads` : "uploads", {
        method: "POST",
        body,
      }),
    confirmUpload: (uploadId: string) =>
      transport<GalleryUploadDto>(`uploads/${id(uploadId)}/complete`, { method: "POST", body: {} }),
    getUpload: (uploadId: string) => transport<GalleryUploadDto>(`uploads/${id(uploadId)}`),
    cancelUpload: (uploadId: string) =>
      transport<GalleryUploadDto>(`uploads/${id(uploadId)}`, { method: "DELETE" }),
    retryUpload: (uploadId: string, body: GalleryUploadRetryInput) =>
      transport<GalleryUploadDto>(`uploads/${id(uploadId)}/retry`, { method: "POST", body }),
    getPhoto: (photoId: string) => transport<GalleryPhotoDto>(`photos/${id(photoId)}`),
    requestMediaFallback: (photoId: string, variant: "thumb" | "full") =>
      transport<{ url: string; source: "cloudru"; expiresAt: string }>(`photos/${id(photoId)}/fallback`, {
        method: "POST", body: { variant },
      }),
    updatePhoto: (photoId: string, body: GalleryPhotoUpdateInput) =>
      transport<GalleryPhotoDto>(`photos/${id(photoId)}`, { method: "PATCH", body }),
    deletePhoto: (photoId: string) =>
      transport<{ id: string }>(`photos/${id(photoId)}`, { method: "DELETE" }),
    setCover: (albumId: string, body: GalleryCoverInput) =>
      transport<GalleryAlbumDto>(`albums/${id(albumId)}/cover`, { method: "PUT", body }),
    movePhoto: (photoId: string, body: GalleryMoveInput) =>
      transport<GalleryMoveDto>(`photos/${id(photoId)}/move`, { method: "POST", body }),
  };
}
