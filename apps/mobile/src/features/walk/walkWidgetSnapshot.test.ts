import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { buildWalkWidgetSnapshot } from "./walkWidgetSnapshot";

describe("dog walk home screen snapshot", () => {
  it("displays ongoing time from its original timestamp, not the training timer", () => {
    const snapshot = buildWalkWidgetSnapshot(
      {
        startedAtMs: 1_000,
        finishedAtMs: null,
        steps: 2500,
        incompleteSteps: false,
      },
      3_601_000,
    );
    expect(snapshot).toMatchObject({
      active: true,
      running: true,
      mode: "stopwatch",
      displayStartMs: 1_000,
      elapsedLabel: "01:00:00",
      metersLabel: "2 км",
      incomplete: false,
    });
    expect(snapshot.stepsLabel.replace(/\s/g, "")).toBe("2500");
  });

  it("freezes iOS timer while paused and shows countdown remaining", () => {
    const paused = buildWalkWidgetSnapshot(
      {
        startedAtMs: 0,
        finishedAtMs: null,
        steps: 500,
        incompleteSteps: false,
        mode: "countdown",
        targetDurationSec: 600,
        elapsedBeforePauseMs: 120000,
        runningSinceMs: null,
      },
      400000,
    );
    expect(paused).toMatchObject({
      active: true,
      running: false,
      mode: "countdown",
      elapsedLabel: "08:00",
    });
    const running = buildWalkWidgetSnapshot(
      {
        startedAtMs: 0,
        finishedAtMs: null,
        steps: 500,
        incompleteSteps: false,
        mode: "countdown",
        targetDurationSec: 600,
        elapsedBeforePauseMs: 120000,
        runningSinceMs: 400000,
      },
      430000,
    );
    expect(running).toMatchObject({ active: true, running: true, elapsedLabel: "07:30" });
    expect(running.displayEndMs).toBe(880000);
  });

  it("renders inactive empty widget without old walking metrics", () => {
    const snapshot = buildWalkWidgetSnapshot(null, 100);
    expect(snapshot.active).toBe(false);
    expect(snapshot.stepsLabel).toBe("0");
    expect(snapshot.metersLabel).toBe("0 м");
  });
});
