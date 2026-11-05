import { describe, expect, it } from "vitest";
import { finishWalk, pauseWalk, resumeWalk, startWalk } from "./walkModel";
import { getWalkWeekOverview } from "./walkOverview";

describe("walk week overview", () => {
  it("counts a completed walk in its local calendar week and ignores active walks", () => {
    const start = new Date(2026, 10, 2, 9, 0).getTime(); // Monday
    const walk = finishWalk({ ...startWalk("stopwatch", start), steps: 1500 }, start + 30 * 60_000);
    const overview = getWalkWeekOverview(
      [walk, startWalk("stopwatch", start + 4 * 86400_000)],
      new Date(2026, 10, 5, 12, 0).getTime(),
    );
    expect(overview.count).toBe(1);
    expect(overview.seconds).toBe(1800);
    expect(overview.steps).toBe(1500);
    expect(overview.meters).toBe(1200);
    expect(overview.days[0]?.seconds).toBe(1800);
    expect(overview.days[3]?.isToday).toBe(true);
    expect(overview.latest).toEqual(walk);
  });

  it("excludes pauses and previous calendar weeks while retaining latest history", () => {
    const prev = new Date(2026, 10, 1, 18, 0).getTime();
    const current = new Date(2026, 10, 3, 10, 0).getTime();
    const first = finishWalk(startWalk("stopwatch", prev), prev + 20 * 60_000);
    const paused = pauseWalk(startWalk("stopwatch", current), current + 10 * 60_000);
    const resumed = resumeWalk(paused, current + 40 * 60_000);
    const second = finishWalk(resumed, current + 50 * 60_000);
    const overview = getWalkWeekOverview([second, first], new Date(2026, 10, 5).getTime());
    expect(overview.count).toBe(1);
    expect(overview.seconds).toBe(1200);
    expect(overview.days[1]?.seconds).toBe(1200);
    expect(overview.latest).toEqual(second);
  });
});
