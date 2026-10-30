import { afterEach, describe, expect, it, vi } from "vitest";
import {
  secondsRemaining, isValidClock, timerStorageKey,
  readSavedClock, saveClock, clearClock,
} from "./trainingStepClock";

afterEach(() => vi.unstubAllGlobals());
describe("Next-compatible wall-clock timer scope", () => {
  it("ticks from real timestamps, clamps at zero, never goes below zero", () => {
    const clock = { initial: 120, startedAt: 1_000_000 };
    expect(secondsRemaining(clock, 1_000_000)).toBe(120);
    expect(secondsRemaining(clock, 1_031_000)).toBe(89);
    expect(secondsRemaining(clock, 1_121_000)).toBe(0);
    expect(secondsRemaining(clock, 4_000_000)).toBe(0);
    expect(secondsRemaining(clock, 999_000)).toBe(120);
  });
  it("persisted timer never crosses account, course, day or occurrence", () => {
    const first=timerStorageKey("A","course1","day1","occ1");
    for(const different of [
      timerStorageKey("B","course1","day1","occ1"),
      timerStorageKey("A","course2","day1","occ1"),
      timerStorageKey("A","course1","day2","occ1"),
      timerStorageKey("A","course1","day1","occ2"),
    ]) expect(different).not.toBe(first);
  });
  it("accepts only bounded positive clock, not stale, future or forged duration", () => {
    const now=1_600_000;
    expect(isValidClock({ initial: 40, startedAt: 1_500_000 },40,now)).toBe(true);
    expect(isValidClock({ initial: 0, startedAt: 1_500_000 },0,now)).toBe(true);
    for(const invalid of [
      { initial: 50, startedAt: 1_500_000 },
      { initial: -2, startedAt: 1_500_000 },
      { initial: 5.5, startedAt: 1_500_000 },
      { initial: 40, startedAt: now + 20_000 },
      { initial: 40, startedAt: now - 8 * 24 * 3600 * 1000 },
    ]) expect(isValidClock(invalid,40,now)).toBe(false);
  });
  it("degrades without localStorage, never authorizes a write by itself", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw Error("DENIED"); },
      setItem: () => { throw Error("DENIED"); },
      removeItem: () => { throw Error("DENIED"); },
    });
    expect(readSavedClock("any",120,Date.now())).toBeNull();
    expect(() => saveClock("any",{initial:120,startedAt:Date.now()})).not.toThrow();
    expect(() => clearClock("any")).not.toThrow();
  });
});
