import { prisma } from "@gafus/prisma";
import { createGalleryService } from "./service";
import type { GalleryStoragePort } from "./ports";

/** Core owns database binding; gallery HTTP adapter supplies storage transport only. */
export function createCurrentGalleryService(storage: GalleryStoragePort) {
  return createGalleryService({ db: prisma, storage });
}
