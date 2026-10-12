import type { PrismaClient, Prisma } from "@gafus/prisma";
/** No singleton import: composition injects the actual Prisma 6.10.1 client. */
export type GalleryDb = Pick<
  PrismaClient,
  "$transaction" | "user" | "galleryAlbum" | "galleryPhoto" | "galleryUpload" | "galleryStorageJob"
>;
export type GalleryTx = Prisma.TransactionClient;
export interface GalleryObjectMetadata {
  etag: string;
  bytes: number;
  contentType: string;
}
/** Infrastructure never decides authorization, generates keys, or queries the DB. */
export interface GalleryStoragePort {
  /** True only when private bucket, POST signer, CDN signer and processor are configured. */
  enabled: boolean;
  presignPost(input: {
    key: string;
    expiresAt: Date;
    maxBytes: number;
    contentType: string;
  }): Promise<{ url: string; fields: Record<string, string> }>;
  head(key: string): Promise<GalleryObjectMetadata | null>;
  signCdn(input: { key: string; expiresAt: Date }): Promise<string>;
}
export interface GalleryUploadClaim {
  uploadId: string;
  photoId: string;
  attemptToken: string;
  sourceKey: string;
  sourceETag: string;
  thumbKey: string;
  fullKey: string;
  leaseUntil: string;
  reservationExpiresAt: string;
}
export interface GalleryStorageJobClaim {
  jobId: string;
  kind: "publish" | "move" | "delete" | "vetPreview";
  attemptToken: string;
  sourceKeys: string[];
  sourceETags: string[];
  targetKeys: string[];
  leaseUntil: string;
  /** Copy with If-Match sourceETags and create-if-absent targets. Never overwrite READY objects.
   * Check lease before each side effect; DELETE is idempotent. Core verifies HEAD before commit. */
  writeMode: "create-if-absent";
}
export interface GalleryCallbackResult {
  accepted: boolean;
  status:
    | "reserved"
    | "uploaded"
    | "processing"
    | "ready"
    | "failed"
    | "cancelled"
    | "expired"
    | "pending"
    | "done"
    | "unavailable"
    | "protected";
}
