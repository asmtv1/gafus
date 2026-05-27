import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@shared/lib/StepNotification/manageStepNotificationSimple", () => ({
  pauseNotificationClient: vi.fn(),
  resetNotificationClient: vi.fn(),
  resumeNotificationClient: vi.fn(),
}));

vi.mock("@shared/lib/training/pauseResumeUserStep", () => ({
  pauseUserStepServerAction: vi.fn(),
  resumeUserStepServerAction: vi.fn(),
}));

vi.mock("@shared/lib/training/startUserStepServerAction", () => ({
  startUserStepServerAction: vi.fn(),
}));

vi.mock("@shared/lib/training/updateUserStepStatus", () => ({
  updateStepStatusServerAction: vi.fn(),
}));

vi.mock("@shared/utils/hapticFeedback", () => ({
  hapticComplete: vi.fn(),
  hapticStart: vi.fn(),
}));

import { getStepTimerEndStorageKey } from "@gafus/core/utils/training";

import { useTimerStore } from "./timerStore";

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
    value: {
      dispatchEvent: vi.fn(),
      localStorage: localStorageMock,
    },
  });

  return localStorageMock;
}

describe("web timer store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    installLocalStorage();
    useTimerStore.getState().cleanupTimers();
  });

  it("starts a timer only when the end timestamp exists in localStorage", () => {
    const onTimeUpdate = vi.fn();
    const onFinish = vi.fn();
    localStorage.setItem(getStepTimerEndStorageKey("course-1", "day-1", 0), "1779616860");

    const started = useTimerStore
      .getState()
      .startTimer("course-1", "day-1", 0, onTimeUpdate, onFinish);

    expect(started).toBe(true);
    expect(useTimerStore.getState().getActiveStep()).toBe("course-1-day-1-0");
    expect(onTimeUpdate).toHaveBeenCalledWith(60);
  });

  it("blocks a second active step until the current timer is stopped", () => {
    localStorage.setItem(getStepTimerEndStorageKey("course-1", "day-1", 0), "1779616860");
    localStorage.setItem(getStepTimerEndStorageKey("course-1", "day-1", 1), "1779616860");

    expect(useTimerStore.getState().startTimer("course-1", "day-1", 0, vi.fn(), vi.fn())).toBe(
      true,
    );
    expect(useTimerStore.getState().startTimer("course-1", "day-1", 1, vi.fn(), vi.fn())).toBe(
      false,
    );

    useTimerStore.getState().stopTimer("course-1", "day-1", 0);

    expect(useTimerStore.getState().getActiveStep()).toBeNull();
  });

  it("finishes and clears the timer when the end timestamp expires", () => {
    const onTimeUpdate = vi.fn();
    const onFinish = vi.fn();
    localStorage.setItem(getStepTimerEndStorageKey("course-1", "day-1", 0), "1779616801");

    useTimerStore.getState().startTimer("course-1", "day-1", 0, onTimeUpdate, onFinish);
    vi.setSystemTime(new Date("2026-05-24T10:00:02.000Z"));
    vi.advanceTimersByTime(1000);

    expect(onTimeUpdate).toHaveBeenLastCalledWith(0);
    expect(onFinish).toHaveBeenCalledOnce();
    expect(useTimerStore.getState().getActiveStep()).toBeNull();
  });
});
