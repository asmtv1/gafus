/**
 * AG4 G1 legacy safety: v1 persisted queues have no authenticated owner.
 * No live dispatch or ACK from ownerless history, including after account switch.
 * This is a permanent local fail-closed invariant, NOT an env/feature flag.
 * Historical transport regression tests may mock this module in isolation.
 */
export function canDispatchOwnerlessLegacyOfflineQueue(): boolean {
  return false;
}
