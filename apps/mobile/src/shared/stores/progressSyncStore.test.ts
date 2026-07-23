import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportClientErrorMock, saveVideoProgressMock, startStepMock } = vi.hoisted(() => ({
  reportClientErrorMock: vi.fn(),
  saveVideoProgressMock: vi.fn(),
  startStepMock: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: reportClientErrorMock,
}));

vi.mock("@/shared/lib/api", () => ({
  dailyCourseApi: {
    completeStep: vi.fn(),
    pauseStep: vi.fn(),
    resetStep: vi.fn(),
    resumeStep: vi.fn(),
    startStep: vi.fn(),
  },
  trainingApi: {
    completePracticeStep: vi.fn(),
    completeTheoryStep: vi.fn(),
    pauseStep: vi.fn(),
    resetStep: vi.fn(),
    resumeStep: vi.fn(),
    saveVideoProgress: saveVideoProgressMock,
    startStep: startStepMock,
  },
}));

import { useProgressSyncStore, type QueuedAction } from "./progressSyncStore";

const action: QueuedAction = {
  type: "startStep",
  params: {
    courseId: "course-1",
    dayOnCourseId: "day-1",
    durationSec: 60,
    status: "IN_PROGRESS",
    stepIndex: 0,
  },
};

describe("mobile progress sync store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProgressSyncStore.setState({ consecutive401: 0, queue: [] });
  });

  it("returns done when the queue is empty", async () => {
    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("done");
  });

  it("removes successful actions and resets unauthorized counter", async () => {
    useProgressSyncStore.setState({ consecutive401: 2, queue: [action] });
    startStepMock.mockResolvedValueOnce({ success: true });

    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("ok");

    expect(startStepMock).toHaveBeenCalledWith(action.params);
    expect(useProgressSyncStore.getState()).toMatchObject({
      consecutive401: 0,
      queue: [],
    });
  });

  it("stops after three consecutive unauthorized responses", async () => {
    useProgressSyncStore.setState({ consecutive401: 2, queue: [action] });
    startStepMock.mockResolvedValueOnce({ success: false, code: "UNAUTHORIZED" });

    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("unauthorized");

    expect(useProgressSyncStore.getState()).toMatchObject({
      consecutive401: 3,
      queue: [],
    });
  });

  it("keeps failed thrown actions queued for retry", async () => {
    useProgressSyncStore.setState({ queue: [action] });
    const error = new Error("network");
    startStepMock.mockRejectedValueOnce(error);

    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("retry");

    expect(reportClientErrorMock).toHaveBeenCalledWith(error, {
      issueKey: "ProgressSync",
      keys: { actionType: "startStep" },
    });
    expect(useProgressSyncStore.getState().queue).toEqual([action]);
  });

  it("оставляет в очереди только последнюю позицию одного видео", () => {
    const store = useProgressSyncStore.getState();
    store.add({
      type: "saveVideoProgress",
      params: { videoId: "video-1", positionSec: 10, updatedAt: 1 },
    });
    store.add({
      type: "saveVideoProgress",
      params: { videoId: "video-1", positionSec: 25, updatedAt: 2 },
    });

    expect(useProgressSyncStore.getState().queue).toHaveLength(1);
    expect(useProgressSyncStore.getState().queue[0]).toMatchObject({
      type: "saveVideoProgress",
      params: { videoId: "video-1", positionSec: 25, updatedAt: 2 },
    });
  });

  it("синхронизирует позицию видео", async () => {
    useProgressSyncStore.getState().add({
      type: "saveVideoProgress",
      params: { videoId: "video-1", positionSec: 25, updatedAt: 2 },
    });
    saveVideoProgressMock.mockResolvedValueOnce({ success: true });

    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("ok");

    expect(saveVideoProgressMock).toHaveBeenCalledWith("video-1", 25);
    expect(useProgressSyncStore.getState().queue).toEqual([]);
  });

  it("не теряет позицию видео при временной ошибке сервера", async () => {
    useProgressSyncStore.getState().add({
      type: "saveVideoProgress",
      params: { videoId: "video-1", positionSec: 25, updatedAt: 2 },
    });
    saveVideoProgressMock.mockResolvedValueOnce({ success: false, error: "server error" });

    await expect(useProgressSyncStore.getState().processNext()).resolves.toBe("retry");
    expect(useProgressSyncStore.getState().queue).toHaveLength(1);
  });
});
