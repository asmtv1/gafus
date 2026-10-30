/** Source Next timerStore uses a wall-clock end timestamp in browser storage.
 * This is only a UI countdown/reload hint, NEVER proof of server completion:
 * each resulting mutation still requires a fresh authenticated occurrence GET. */
export type RunningStepClock = { initial: number; startedAt: number };

export function secondsRemaining(clock: RunningStepClock, now: number): number {
  return Math.max(0, clock.initial - Math.floor(Math.max(0, now - clock.startedAt) / 1000));
}

export function isValidClock(clock: unknown, serverRemaining: number, now: number):
  clock is RunningStepClock {
  if (!clock || typeof clock !== "object") return false;
  const c = clock as Partial<RunningStepClock>;
  return Number.isSafeInteger(c.initial) && c.initial! >= 0 &&
    c.initial! <= serverRemaining &&
    Number.isSafeInteger(c.startedAt) && c.startedAt! > 0 &&
    c.startedAt! <= now && now - c.startedAt! < 7 * 24 * 3600 * 1000;
}

export function timerStorageKey(
  actor: string, courseId: string, dayId: string, occurrenceId: string,
): string {
  // Identity & occurrence binding: Never reuse a clock across another user,
  // repeated template Step.id, another course or another day.
  return ["gafus-refactor-step-clock-v1",actor,courseId,dayId,occurrenceId]
    .map(encodeURIComponent).join(":");
}

export function readSavedClock(key: string, serverRemaining: number, now: number):
  RunningStepClock | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isValidClock(parsed, serverRemaining, now)) return parsed;
    localStorage.removeItem(key);
  } catch { /* storage may be forbidden or corrupt; never trust it */ }
  return null;
}
export function saveClock(key: string, clock: RunningStepClock): void {
  try { localStorage.setItem(key, JSON.stringify(clock)); }
  catch { /* clock continues in memory on restricted browsers */ }
}
export function clearClock(key: string): void {
  try { localStorage.removeItem(key); } catch { /* best effort */ }
}
