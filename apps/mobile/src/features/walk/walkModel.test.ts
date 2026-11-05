import { describe, expect, it } from "vitest";
import {
  countdownRemainingSeconds,
  estimatedWalkMeters,
  finishWalk,
  formatWalkDistance,
  formatWalkDuration,
  isWalkRunning,
  pauseWalk,
  resumeWalk,
  secondsToNextWalkReminder,
  startWalk,
  totalTodayWalks,
  walkDurationSeconds,
} from "./walkModel";

describe("dog walking: timer, pauses, reminders, physical steps", () => {
  it("excludes paused time, including after restart, then persists final duration", () => {
    const started = startWalk("stopwatch", 1_000);
    expect(walkDurationSeconds(started, 3_601_000)).toBe(3600);
    const paused = pauseWalk(started, 61_000);
    expect(isWalkRunning(paused)).toBe(false);
    expect(walkDurationSeconds(paused, 1_261_000)).toBe(60);
    const resumed = resumeWalk(JSON.parse(JSON.stringify(paused)), 1_261_000);
    expect(isWalkRunning(resumed)).toBe(true);
    const finished = finishWalk(resumed, 1_291_000);
    expect(walkDurationSeconds(finished, 99_999_000)).toBe(90);
    expect(formatWalkDuration(90)).toBe("01:30");
  });

  it("does not count repeated pause/resume/finish as extra time", () => {
    const walk = startWalk("stopwatch", 100);
    const paused = pauseWalk(walk, 1_100);
    expect(pauseWalk(paused, 3_100)).toEqual(paused);
    const running = resumeWalk(paused, 4_100);
    expect(resumeWalk(running, 5_100)).toEqual(running);
    const final = finishWalk(running, 5_100);
    expect(finishWalk(final, 7_100)).toEqual(final);
    expect(walkDurationSeconds(final, 10_000)).toBe(2);
  });

  it("countdown notifies at zero, but does not finish or change step counts", () => {
    const walk = { ...startWalk("countdown", 0, 600), steps: 2500 };
    expect(countdownRemainingSeconds(walk, 301_000)).toBe(299);
    expect(countdownRemainingSeconds(walk, 601_000)).toBe(0);
    expect(isWalkRunning(walk)).toBe(true);
    const paused = pauseWalk(walk, 301_000);
    expect(countdownRemainingSeconds(paused, 999_000)).toBe(299);
    expect(paused.steps).toBe(2500);
  });

  it("reminds every 30m of active walking, preserving the remainder across pauses", () => {
    const walk = startWalk("stopwatch", 0);
    expect(secondsToNextWalkReminder(walk, 0)).toBe(1800);
    expect(secondsToNextWalkReminder(walk, 1_500_000)).toBe(300);
    const resumed = resumeWalk(pauseWalk(walk, 1_500_000), 9_000_000);
    expect(secondsToNextWalkReminder(resumed, 9_000_000)).toBe(300);
    expect(secondsToNextWalkReminder(resumed, 9_300_000)).toBe(1800);
  });

  it("calculates distance only as an explicitly estimated stride length", () => {
    expect(estimatedWalkMeters(2500)).toBe(2000);
    expect(formatWalkDistance(2000)).toBe("2 км");
    expect(estimatedWalkMeters(-9)).toBe(0);
  });

  it("totals only today's finished dog walks", () => {
    const now = new Date("2026-11-05T18:00:00").valueOf();
    const active = { ...startWalk("stopwatch", now - 3_600_000), steps: 2500 };
    const finished = finishWalk(active, now);
    expect(
      totalTodayWalks([finished, active, { ...finished, finishedAtMs: now - 86_400_000 }], now),
    ).toEqual({ seconds: 3600, steps: 2500, meters: 2000 });
  });

  it("migrates finished walks from older schema without losing duration", () => {
    expect(
      walkDurationSeconds(
        { startedAtMs: 0, finishedAtMs: 3_600_000, steps: 2500, incompleteSteps: false },
        5_000_000,
      ),
    ).toBe(3600);
  });
});
