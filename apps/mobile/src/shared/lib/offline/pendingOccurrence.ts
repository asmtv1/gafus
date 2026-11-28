/** An index is presentation only. Never decorate a reordered or replaced
 * occurrence with an unrelated pending completion. Old unbound commands remain
 * visible in the pending notice but cannot attest a concrete step. */
export function pendingMatchesOccurrence(
  pending: { occurrenceId?: string; originalStepId?: string },
  occurrenceId: string | null | undefined,
  originalStepId: string | null | undefined,
): boolean {
  return !!occurrenceId && !!originalStepId &&
    pending.occurrenceId === occurrenceId && pending.originalStepId === originalStepId;
}
