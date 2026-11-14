import { enqueueDeletedMediaPurge } from "@gafus/media-server/deleted-media-purge";
import { prisma } from "@gafus/prisma";
import { createGalleryService } from "@gafus/core/services/gallery";
import type { GalleryStoragePort } from "@gafus/core/services/gallery";

/** The gallery-server adapter owns database binding; Core stays port-driven. */
export function createCurrentGalleryService(storage: GalleryStoragePort) {
  return createGalleryService({ db: prisma, storage, enqueueDeletedMediaPurge });
}
