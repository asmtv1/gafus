-- Enable private veterinary image preview processing in the already durable
-- GalleryStorageJob queue. This enum addition does not rewrite existing rows.
ALTER TYPE "GalleryStorageJobKind" ADD VALUE IF NOT EXISTS 'vetPreview';
