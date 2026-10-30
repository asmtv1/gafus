/** Phase1 Mobile booking intent: memory-only, never a proof of server absence. */
import type { consultationsApi } from "@/shared/lib/api/consultations";

export type BookingBody = Parameters<typeof consultationsApi.book>[0];
export type BookingAttempt = {
  readonly ownerId: string;
  readonly authEpoch: string;
  readonly cynologistUserId: string;
  readonly slotId: string;
  readonly body: Readonly<BookingBody>;
  state: "verifying" | "sending" | "unknown" | "confirmed" | "rejected";
  postStarted: boolean;
};

let active: BookingAttempt | null = null;

export function currentBookingAttempt(
  ownerId: string,
  epoch: string,
  cynologistId: string,
  slotId: string,
) {
  return active?.ownerId === ownerId &&
    active.authEpoch === epoch &&
    active.cynologistUserId === cynologistId &&
    active.slotId === slotId
    ? active
    : null;
}
export function uncertainBookingForOwner(ownerId: string, epoch: string): boolean {
  return active?.ownerId === ownerId && active.authEpoch === epoch && active.state === "unknown";
}
/** Don't create a different booking while a prior POST could already have committed. */
export function unresolvedBookingForOwner(ownerId: string, epoch: string): boolean {
  return (
    !!active &&
    active.ownerId === ownerId &&
    active.authEpoch === epoch &&
    active.postStarted &&
    active.state !== "confirmed" &&
    active.state !== "rejected"
  );
}
export function beginBookingAttempt(
  ownerId: string,
  epoch: string,
  cynologistId: string,
  body: BookingBody,
): BookingAttempt | null {
  if (!ownerId || !epoch || !cynologistId || !body.slotId || !body.idempotencyKey) return null;
  if (currentBookingAttempt(ownerId, epoch, cynologistId, body.slotId)) return null;
  if (unresolvedBookingForOwner(ownerId, epoch)) return null;
  const snapshot = Object.freeze({ ...body });
  active = {
    ownerId,
    authEpoch: epoch,
    cynologistUserId: cynologistId,
    slotId: body.slotId,
    body: snapshot,
    state: "verifying",
    postStarted: false,
  };
  return active;
}
export function markBookingSending(attempt: BookingAttempt): boolean {
  if (active !== attempt || attempt.state !== "verifying") return false;
  attempt.postStarted = true;
  attempt.state = "sending";
  return true;
}
export function bookingAttemptCurrent(attempt: BookingAttempt): boolean {
  return active === attempt;
}
export function finishBookingAttempt(
  attempt: BookingAttempt,
  state: "unknown" | "confirmed" | "rejected",
) {
  if (active === attempt) attempt.state = state;
}
export function releaseBeforePost(attempt: BookingAttempt): void {
  if (active === attempt && !attempt.postStarted) active = null;
}
/** Release only after a durably verified PRE-COMMIT rejection. */
export function releaseRejectedBookingAttempt(attempt: BookingAttempt): void {
  if (active === attempt && attempt.state === "rejected") active = null;
}
/** Tests only: never called from production screens or on sign-out. */
export function resetBookingAttemptForTests(): void {
  active = null;
}
