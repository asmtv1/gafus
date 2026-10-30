/** Only explicit authenticated server PRE-COMMIT access refusals; never negative receipt. */
export function isDefiniteConsultationPrecommitAccessFailure(result: {
  success: boolean;
  code?: string;
}): boolean {
  // Core bookSlotWithSubscription checks entitlement BEFORE the booking transaction.
  // 404, 409, generic 403, 429 and transport faults remain UNKNOWN.
  return (
    result.success === false &&
    (result.code === "SUBSCRIPTION_REQUIRED" || result.code === "CONSULTATION_BOOKING_NOT_INCLUDED")
  );
}
