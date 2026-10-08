import { z } from "zod";
import { GALLERY_LIMITS as L, GALLERY_MIME_TYPES } from "../../../../types/src/gallery";
import { GalleryError } from "./errors";
export const galleryIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const caption = z.string().trim().max(L.caption).nullable();
const albumFields = {
  name: z.string().trim().min(1).max(L.albumName),
  description: caption.optional(),
  isVisible: z.boolean().optional(),
};
export const galleryAlbumCreateSchema = z.object(albumFields).strict();
export const galleryAlbumUpdateSchema = z
  .object(albumFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Empty update");
export const galleryPhotoUpdateSchema = z.object({ caption }).strict();
export const galleryUploadSchema = z
  .object({
    albumId: galleryIdSchema.nullable().optional(),
    filename: z.string().trim().min(1).max(255),
    declaredMime: z.enum(GALLERY_MIME_TYPES),
    declaredBytes: z.number().int().positive().max(L.photoBytes),
    caption: caption.optional(),
    clientRequestId: z.string().uuid(),
  })
  .strict();
export const galleryUploadRetrySchema = z.object({ clientRequestId: z.string().uuid() }).strict();
export const galleryCoverSchema = z.object({ photoId: galleryIdSchema.nullable() }).strict();
export const galleryMoveSchema = z
  .object({ albumId: galleryIdSchema, clientRequestId: z.string().uuid() })
  .strict();
export const galleryListSchema = z
  .object({
    cursor: z.string().max(512).nullable().optional(),
    pageSize: z.number().int().min(1).max(L.maxPageSize).default(L.pageSize),
  })
  .strict();
export const galleryProfileAlbumsSchema = galleryListSchema.extend({
  username: z.string().trim().min(1).max(128),
});
export const galleryAlbumPhotosSchema = galleryListSchema.extend({ albumId: galleryIdSchema });
export const galleryUploadCompleteSchema = z.object({ uploadId: galleryIdSchema }).strict();
export const galleryClaimUploadSchema = z.object({ uploadId: galleryIdSchema }).strict();
export const galleryCompleteUploadSchema = z
  .object({
    uploadId: galleryIdSchema,
    attemptToken: z.string().uuid(),
    sourceETag: z.string().min(1).max(256),
    width: z.number().int().positive().max(1920),
    height: z.number().int().positive().max(1920),
  })
  .strict()
  .refine((v) => v.width * v.height <= 1920 * 1920);
export const galleryFailUploadSchema = z
  .object({
    uploadId: galleryIdSchema,
    attemptToken: z.string().uuid(),
    errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
    retryable: z.boolean(),
  })
  .strict();
export const galleryClaimStorageJobsSchema = z
  .object({ limit: z.number().int().min(1).max(50).default(10) })
  .strict();
export const galleryCompleteStorageJobSchema = z
  .object({ jobId: galleryIdSchema, attemptToken: z.string().uuid() })
  .strict();
export const galleryFailStorageJobSchema = galleryCompleteStorageJobSchema.extend({
  errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  retryable: z.boolean(),
});
export function galleryParse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new GalleryError("VALIDATION", "Некорректные данные галереи", 400, {
      issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  return result.data;
}
