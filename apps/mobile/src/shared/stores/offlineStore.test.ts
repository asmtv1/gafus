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

vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

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

  it("keeps unindexed legacy course files untouched on removeDownload", async () => {
    await useOfflineStore.getState().removeDownload("unindexed-legacy");
    expect(deleteCourseDataMock).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().downloaded).toEqual({});
  });

  it("does not delete an actively downloading course", async () => {
    let finishDownload!: (result: { success: true; version: string }) => void;
    downloadCourseForOfflineMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishDownload = resolve;
      }),
    );
    const inFlight = useOfflineStore.getState().startDownload("base");
    await vi.waitFor(() => {
      expect(useOfflineStore.getState().status).toMatchObject({
        status: "downloading",
        courseType: "base",
      });
    });
    await useOfflineStore.getState().removeDownload("base");
    expect(deleteCourseDataMock).not.toHaveBeenCalled();
    finishDownload({ success: true, version: "v1" });
    await inFlight;
    expect(useOfflineStore.getState().downloaded.base).toEqual({ version: "v1" });
  });

  it("retains an unfinished queue item and restores idle state on unexpected native failure", async () => {
    downloadCourseForOfflineMock.mockRejectedValueOnce(new Error("native filesystem crashed"));
    await expect(useOfflineStore.getState().startDownload("base")).resolves.toBeUndefined();
    expect(useOfflineStore.getState()).toMatchObject({
      downloaded: {},
      downloadQueue: ["base"],
      status: { status: "idle" },
    });
    expect(deleteCourseDataMock).not.toHaveBeenCalled();
    downloadCourseForOfflineMock.mockResolvedValueOnce({ success: true, version: "v2" });
    await useOfflineStore.getState().startDownload("base");
    expect(useOfflineStore.getState()).toMatchObject({
      downloaded: { base: { version: "v2" } },
      downloadQueue: [],
      status: { status: "idle" },
    });
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
