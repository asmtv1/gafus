/**
 * Application policy for permanent media cleanup intent. No storage or SQL client
 * is created here. Persistence ports run within the caller's deletion transaction.
 */
export type AccountCleanupIntent = {
  dualGallery: boolean;
  dualFeed: boolean;
  dualProviderMarker: string;
};

export type AccountStorageCleanupPorts<TTransaction> = {
  readIntent: () => AccountCleanupIntent;
  insertSnapshot: (
    tx: TTransaction, ownerId: string, at: Date, intent: AccountCleanupIntent,
  ) => Promise<void>;
  enqueueGallery: (tx: TTransaction, ownerId: string, at: Date) => Promise<void>;
  enqueueFeed: (tx: TTransaction, ownerId: string, at: Date) => Promise<void>;
};

/** Every persistence step receives the SAME transaction and is awaited in order. */
export function createAccountStorageCleanup<TTransaction>(
  ports: AccountStorageCleanupPorts<TTransaction>,
) {
  return async function enqueueAccountStorageCleanup(
    tx: TTransaction, ownerId: string, at: Date,
  ): Promise<void> {
    const intent = ports.readIntent();
    await ports.insertSnapshot(tx, ownerId, at, intent);
    await ports.enqueueGallery(tx, ownerId, at);
    await ports.enqueueFeed(tx, ownerId, at);
  };
}
