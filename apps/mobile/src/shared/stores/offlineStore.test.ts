import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteCourseDataMock, downloadCourseForOfflineMock, hasEnoughDiskSpaceMock } = vi.hoisted(
  () => ({
    deleteCourseDataMock: vi.fn(),
    downloadCourseForOfflineMock: vi.fn(),
    hasEnoughDiskSpaceMock: vi.fn(),
  }),
);

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/lib/offline/offlineStorage", () => ({
  deleteCourseData: deleteCourseDataMock,
}));

vi.mock("@/shared/lib/offline/downloadCourseForOffline", () => ({
  downloadCourseForOffline: downloadCourseForOfflineMock,
  hasEnoughDiskSpace: hasEnoughDiskSpaceMock,
}));

import { useOfflineStore } from "./offlineStore";

describe("mobile offline store", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    hasEnoughDiskSpaceMock.mockResolvedValue(true);
    useOfflineStore.setState({
      downloaded: {},
      downloadQueue: [],
      status: { status: "idle" },
    });
  });

  it("downloads a course and stores its version", async () => {
    downloadCourseForOfflineMock.mockImplementationOnce(async (_courseType, onProgress) => {
      onProgress({ phase: "assets", current: 1, total: 2 });
      return { success: true, version: "v1" };
    });

    await useOfflineStore.getState().startDownload("base");

    expect(downloadCourseForOfflineMock).toHaveBeenCalledWith(
      "base",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(useOfflineStore.getState()).toMatchObject({
      downloaded: { base: { version: "v1" } },
      downloadQueue: [],
      status: { status: "idle" },
    });
  });

  it("does not enqueue downloads when disk space is unavailable", async () => {
    hasEnoughDiskSpaceMock.mockResolvedValueOnce(false);

    await useOfflineStore.getState().startDownload("base");

    expect(downloadCourseForOfflineMock).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().downloadQueue).toEqual([]);
  });

  it("removes downloaded course data", async () => {
    useOfflineStore.setState({
      downloaded: { base: { version: "v1" } },
    });

    await useOfflineStore.getState().removeDownload("base");

    expect(deleteCourseDataMock).toHaveBeenCalledWith("base");
    expect(useOfflineStore.getState().downloaded).toEqual({});
  });
});
