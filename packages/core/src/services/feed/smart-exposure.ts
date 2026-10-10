/** Immutable server snapshot; event fields are never authoritative. */
export interface SmartExposureSnapshot {
  actorId: string;
  version: string;
  preferencesUpdatedAt: number;
  rows: Array<{ id: string; exposureToken?: string }>;
}
export interface SmartExposureClaim {
  postId: string;
  rank: number;
  algorithmVersion: string;
  exposureToken?: string;
}
/** A stolen session ID alone is insufficient to forge a qualified exposure. */
export function verifySmartExposure(
  snapshot: SmartExposureSnapshot | undefined,
  actorId: string,
  preferencesUpdatedAt: number,
  claim: SmartExposureClaim,
  requireToken = true,
): boolean {
  if (!snapshot || snapshot.actorId !== actorId ||
      snapshot.version !== claim.algorithmVersion ||
      snapshot.preferencesUpdatedAt !== preferencesUpdatedAt ||
      !Number.isSafeInteger(claim.rank) || claim.rank < 0 ||
      !Array.isArray(snapshot.rows)) return false;
  const row = snapshot.rows[claim.rank];
  if (!row || row.id !== claim.postId) return false;
  return (!requireToken && claim.exposureToken === undefined) ||
    (typeof claim.exposureToken === "string" && !!row.exposureToken &&
      claim.exposureToken === row.exposureToken);
}
