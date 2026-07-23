import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { selectDayStepStatuses, useStepStore } from "./stepStore";

describe("mobile step store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    useStepStore.getState().reset();
  });

  it("tracks the start, pause, resume, and complete lifecycle", () => {
    const store = useStepStore.getState();

    store.startStep("course-1", "day-1", 0, 120);
    expect(store.getStepState("course-1", "day-1", 0)).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 120,
      timeLeft: 120,
    });

    store.pauseStep("course-1", "day-1", 0, 45);
    expect(store.getStepState("course-1", "day-1", 0)).toMatchObject({
      status: "PAUSED",
      remainingSec: 45,
      timeLeft: 45,
    });

    store.resumeStep("course-1", "day-1", 0);
    expect(store.getStepState("course-1", "day-1", 0)).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 45,
      timeLeft: 45,
    });

    store.completeStep("course-1", "day-1", 0);
    expect(store.getStepState("course-1", "day-1", 0)).toMatchObject({
      status: "COMPLETED",
      remainingSec: null,
      timeLeft: 0,
    });
  });

  it("clears all states for a specific training day", () => {
    const store = useStepStore.getState();
    store.startStep("course-1", "day-1", 0, 120);
    store.startStep("course-1", "day-2", 0, 120);

    store.clearDayStates("course-1", "day-1");

    expect(store.getStepState("course-1", "day-1", 0)).toBeNull();
    expect(store.getStepState("course-1", "day-2", 0)).toMatchObject({
      status: "IN_PROGRESS",
    });
  });

  it("выбирает только статусы шагов текущего дня для живого прогресса", () => {
    const store = useStepStore.getState();
    store.startStep("course-1", "day-1", 0, 120);
    store.completeStep("course-1", "day-1", 1);
    store.completeStep("course-1", "day-2", 0);

    expect(
      selectDayStepStatuses(useStepStore.getState().stepStates, "course-1", "day-1", 3),
    ).toEqual(["IN_PROGRESS", "COMPLETED", null]);
  });
});
