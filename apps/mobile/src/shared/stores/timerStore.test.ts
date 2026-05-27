import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItemMock, removeItemMock, setItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  removeItemMock: vi.fn(),
  setItemMock: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: getItemMock,
    removeItem: removeItemMock,
    setItem: setItemMock,
  },
}));

import { useTimerStore } from "./timerStore";

describe("mobile timer store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    useTimerStore.setState({ activeTimer: null });
  });

  it("starts a timer and persists its end timestamp", () => {
    const started = useTimerStore.getState().startTimer("course-1", "day-1", 0, 90);

    expect(started).toBe(true);
    expect(useTimerStore.getState().activeTimer).toMatchObject({
      courseId: "course-1",
      dayOnCourseId: "day-1",
      stepIndex: 0,
      remainingSec: 90,
      isRunning: true,
      endTsSec: 1779616890,
    });
    expect(setItemMock).toHaveBeenCalledWith(expect.stringContaining("course-1"), "1779616890");
  });

  it("does not start a second timer while one is running", () => {
    useTimerStore.getState().startTimer("course-1", "day-1", 0, 90);

    const started = useTimerStore.getState().startTimer("course-2", "day-2", 1, 30);

    expect(started).toBe(false);
    expect(useTimerStore.getState().activeTimer).toMatchObject({
      courseId: "course-1",
      dayOnCourseId: "day-1",
      stepIndex: 0,
    });
  });

  it("ticks running timers down and stops at zero", () => {
    useTimerStore.getState().startTimer("course-1", "day-1", 0, 2);

    vi.setSystemTime(new Date("2026-05-24T10:00:03.000Z"));
    useTimerStore.getState().tick();

    expect(useTimerStore.getState().activeTimer).toMatchObject({
      remainingSec: 0,
      isRunning: false,
    });
  });

  it("restores a persisted active timer", async () => {
    getItemMock.mockResolvedValueOnce("1779616860");

    const remaining = await useTimerStore
      .getState()
      .restoreTimerFromStorage("course-1", "day-1", 0);

    expect(remaining).toBe(60);
    expect(useTimerStore.getState().activeTimer).toMatchObject({
      remainingSec: 60,
      isRunning: true,
    });
  });
});
