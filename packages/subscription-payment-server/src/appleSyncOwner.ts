/** Select a subscription only from verified transaction ownership evidence.
 * An original transaction ID is a chain identifier, not an account credential:
 * a later paid renewal may have been attached to a different GAFUS account.
 */
type AppleSyncCandidate = {
  id: string;
  userId: string;
  user: { appleAppAccountToken: string | null };
};

type AppleSyncReceipt = {
  userId: string;
  subscriptionId: string | null;
  appleOriginalTransactionId: string | null;
};

export function selectAppleSyncOwner<T extends AppleSyncCandidate>(input: {
  candidates: readonly T[];
  originalTransactionId: string;
  receipt: AppleSyncReceipt | null;
  appAccountToken?: string;
  requestedUserId?: string;
  requestedSubscriptionId?: string;
}): T | null {
  const { receipt } = input;
  if (receipt && receipt.appleOriginalTransactionId !== input.originalTransactionId) return null;

  const token = input.appAccountToken?.trim();
  const matches = input.candidates.filter(candidate =>
    (!receipt || (candidate.userId === receipt.userId &&
      (receipt.subscriptionId === null || candidate.id === receipt.subscriptionId))) &&
    (!token || candidate.user.appleAppAccountToken === token),
  );
  // Scope is a constraint, not proof of ownership. Never resolve ambiguity
  // by selecting an arbitrary row or by trusting the requested user ID.
  if (matches.length !== 1) return null;
  const selected = matches[0]!;
  if ((input.requestedUserId && selected.userId !== input.requestedUserId) ||
      (input.requestedSubscriptionId && selected.id !== input.requestedSubscriptionId)) return null;
  return selected;
}
