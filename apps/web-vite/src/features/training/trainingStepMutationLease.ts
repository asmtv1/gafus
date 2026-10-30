/** Client-side same-actor/day singleflight for expanded controls + background
 * timer monitor. Core still enforces occurrence+actor in its SQL transaction.
 * This does NOT claim cross-device exclusivity. */
const inFlightDays = new Set<string>();
export function stepDayMutationKey(userId: string, courseId: string, dayId: string): string {
  return [userId, courseId, dayId].map(encodeURIComponent).join(":");
}
export function acquireStepDayMutation(key: string): (() => void) | null {
  if (inFlightDays.has(key)) return null;
  inFlightDays.add(key);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlightDays.delete(key);
  };
}
export const stepDayIsWriting = (key: string): boolean => inFlightDays.has(key);
