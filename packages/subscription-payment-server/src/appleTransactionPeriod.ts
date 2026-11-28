/** A verified auto-renewable JWS must contain the actual billed interval.
 * Never manufacture an active entitlement from an absent/invalid expiry. */
export function parseAppleTransactionPeriod(payload: {
  purchaseDate?: number; expiresDate?: number; revocationDate?: number;
}) {
  const validDate = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 &&
    Number.isFinite(new Date(value).getTime());
  if (!validDate(payload.purchaseDate) || !validDate(payload.expiresDate) ||
      payload.expiresDate <= payload.purchaseDate ||
      (payload.revocationDate !== undefined && !validDate(payload.revocationDate))) {
    return null;
  }
  return {
    periodStart: new Date(payload.purchaseDate),
    periodEnd: new Date(payload.expiresDate),
    isRevoked: payload.revocationDate !== undefined,
  };
}
