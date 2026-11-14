/**
 * Composition root for account deletion. This must be passed into the ORIGINAL
 * identity-write transaction, not called later as a detached asynchronous job.
 */
import { createAccountStorageCleanup } from "@gafus/core/services/accountCleanup";
import { insertAccountMediaCleanupSnapshotsTx } from "@gafus/identity-write-server/account-cleanup-records";
import { enqueueFeedAccountCleanup } from "@gafus/core/services/feed";
import { enqueueGalleryAccountCleanup } from "@gafus/core/services/gallery";
import { DUAL_PROVIDER_CLEANUP_MARKER } from "@gafus/cdn-upload";

export const enqueueAccountStorageCleanup = createAccountStorageCleanup({
  readIntent: () => ({
    dualGallery: process.env.GALLERY_DUAL_PROVIDER_CLEANUP === "true",
    dualFeed: process.env.FEED_DUAL_PROVIDER_CLEANUP === "true",
    dualProviderMarker: DUAL_PROVIDER_CLEANUP_MARKER,
  }),
  insertSnapshot: insertAccountMediaCleanupSnapshotsTx,
  enqueueGallery: enqueueGalleryAccountCleanup,
  enqueueFeed: enqueueFeedAccountCleanup,
});
