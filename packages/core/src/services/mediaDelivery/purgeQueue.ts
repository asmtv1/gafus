import type { MediaPurgeScope } from "@gafus/media-shared/purge-paths";
/** Pure cache-key policy is shared; the SQL transaction stays server-owned. */
export { deletedMediaPurgePaths } from "@gafus/media-shared/purge-paths";
export type { MediaPurgeScope } from "@gafus/media-shared/purge-paths";
/** The SQL writer is bound by server composition, not imported by Core. */
export type EnqueueDeletedMediaPurge<Tx, Scope extends MediaPurgeScope = MediaPurgeScope> = (
  tx: Tx, scope: Scope, jobId: string, deletedKeys: readonly string[],
) => Promise<void>;
