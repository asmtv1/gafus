import { beforeEach, describe, expect, it, vi } from "vitest";

const { getActiveStepMock, stopTimerMock } = vi.hoisted(() => ({
  getActiveStepMock: vi.fn(),
  stopTimerMock: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/error-handling", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@shared/stores/timerStore", () => ({
  useTimerStore: {
    getState: () => ({
      getActiveStep: getActiveStepMock,
      stopTimer: stopTimerMock,
    }),
  },
}));

vi.mock("./userStore", () => ({
  useUserStore: {
    getState: () => ({ user: { id: "user-1" } }),
  },
}));

import { getStepTimerEndStorageKey, getStepTimerPauseStorageKey } from "@gafus/core/utils/training";

import { useStepStore } from "./stepStore";

function installLocalStorage() {
  const storage = new Map<string, string>();
  const localStorageMock = {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: localStorageMock },
  });

  return localStorageMock;
}

describe("web step store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    installLocalStorage();
    getActiveStepMock.mockReturnValue(null);
    useStepStore.getState().clearAllSteps();
  });

  it("starts, pauses, resumes, and finishes a step", async () => {
    const stepKey = useStepStore.getState().getStepKey("course-1", "day-1", 0);

    await expect(useStepStore.getState().startStep("course-1", "day-1", 0, 120)).resolves.toBe(
      true,
    );
    expect(useStepStore.getState().stepStates[stepKey]).toMatchObject({
      status: "IN_PROGRESS",
      timeLeft: 120,
      isPaused: false,
      isFinished: false,
    });

    await useStepStore.getState().pauseStep("course-1", "day-1", 0, 45);
    expect(stopTimerMock).toHaveBeenCalledWith("course-1", "day-1", 0);
    expect(useStepStore.getState().stepStates[stepKey]).toMatchObject({
      status: "PAUSED",
      timeLeft: 45,
      isPaused: true,
    });

    useStepStore.getState().resumeStep("course-1", "day-1", 0);
    expect(useStepStore.getState().stepStates[stepKey]).toMatchObject({
      status: "IN_PROGRESS",
      timeLeft: 45,
      isPaused: false,
    });

    useStepStore.getState().finishStep("course-1", "day-1", 0);
    expect(useStepStore.getState().stepStates[stepKey]).toMatchObject({
      status: "COMPLETED",
      timeLeft: 0,
      isFinished: true,
    });
  });

  it("does not start a new step when another timer is active", async () => {
    getActiveStepMock.mockReturnValue("course-1-day-1-0");

    await expect(useStepStore.getState().startStep("course-1", "day-1", 1, 120)).resolves.toBe(
      false,
    );

    expect(useStepStore.getState().stepStates).toEqual({});
  });

  it("restores paused and active step state from localStorage", () => {
    const pauseKey = getStepTimerPauseStorageKey("course-1", "day-1", 0);
    localStorage.setItem(pauseKey, JSON.stringify({ pausedAt: Date.now(), timeLeft: 30 }));

    expect(useStepStore.getState().restoreStepFromLS("course-1", "day-1", 0)).toMatchObject({
      status: "PAUSED",
      isPaused: true,
      timeLeft: 30,
    });

    localStorage.removeItem(pauseKey);
    localStorage.setItem(getStepTimerEndStorageKey("course-1", "day-1", 0), "1779616860");

    expect(useStepStore.getState().restoreStepFromLS("course-1", "day-1", 0)).toMatchObject({
      status: "IN_PROGRESS",
      isPaused: false,
      timeLeft: 60,
    });
  });
});
