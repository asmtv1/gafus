import type { GalleryTx } from "./ports";
/** Runs in the account-deletion transaction BEFORE User cascade. No configuration or network
 * dependency: immutable job snapshots outlive User/Album/Photo/Upload rows. */
export declare function enqueueGalleryAccountCleanup(tx: Pick<GalleryTx, "$executeRaw">, ownerId: string, at: Date): Promise<void>;
