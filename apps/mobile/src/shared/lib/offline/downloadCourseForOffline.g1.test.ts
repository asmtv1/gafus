import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false, isDirectory: false }),
}));
const downloadCourseMock = vi.hoisted(() => vi.fn());
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///ag3-native-fixture/",
  EncodingType: { Base64: "base64" },
  ...fsMock,
}));
vi.mock("@/shared/lib/api/offline", () => ({
  offlineApi: { downloadCourse: downloadCourseMock },
}));
vi.mock("./downloadHLSForOffline", () => ({
  downloadHLSForOffline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import { downloadCourseForOffline } from "./downloadCourseForOffline";
import { downloadHLSForOffline } from "./downloadHLSForOffline";

const stubData = {
  course: { updatedAt: "2026-10-15T10:00:00.000Z" },
  trainingDays: [],
  mediaFiles: { videos: [] as string[], images: [] as string[], pdfs: [] as string[] },
};

describe("AG3 G1 native image/PDF offline writer path confinement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.getInfoAsync.mockReset().mockResolvedValue({ exists: false, isDirectory: false });
    downloadCourseMock.mockResolvedValue({ success: true, data: structuredClone(stubData) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
  });

  it("does not overwrite or delete an existing legacy course directory", async () => {
    fsMock.getInfoAsync.mockResolvedValueOnce({ exists: true, isDirectory: true });

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false,
      code: "EXISTING_OFFLINE_DATA",
    });
    expect(fsMock.getInfoAsync).toHaveBeenCalledWith("file:///ag3-native-fixture/offline/base/");
    expect(downloadCourseMock).not.toHaveBeenCalled();
    expect(fsMock.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
  });

  it("does not touch existing unknown-schema or partial files without a manifest", async () => {
    fsMock.getInfoAsync.mockResolvedValueOnce({ exists: true, isDirectory: true });

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false,
      code: "EXISTING_OFFLINE_DATA",
    });
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("fails closed when native FileSystem cannot determine if legacy data exists", async () => {
    fsMock.getInfoAsync.mockRejectedValueOnce(new Error("native storage unavailable"));

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false,
      code: "OFFLINE_STORAGE_UNAVAILABLE",
    });
    expect(downloadCourseMock).not.toHaveBeenCalled();
    expect(fsMock.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
  });

  it("rejects overlapping same-course downloads before the second native/API operation", async () => {
    let release!: (value: unknown) => void;
    const pendingResponse = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    downloadCourseMock.mockReturnValueOnce(pendingResponse);
    const first = downloadCourseForOffline("base", vi.fn());
    await vi.waitFor(() => expect(downloadCourseMock).toHaveBeenCalledTimes(1));

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false,
      code: "DOWNLOAD_IN_PROGRESS",
    });
    expect(fsMock.getInfoAsync).toHaveBeenCalledTimes(1);
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();

    release({ success: true, data: structuredClone(stubData) });
    await expect(first).resolves.toMatchObject({ success: true });
    expect(downloadCourseMock).toHaveBeenCalledTimes(1);
  });

  it("releases the per-course guard after a terminal failure", async () => {
    downloadCourseMock.mockResolvedValueOnce({
      success: false,
      code: "COURSE_ACCESS_DENIED",
      error: "Access denied",
    });

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false,
      code: "COURSE_ACCESS_DENIED",
    });
    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: true,
    });
    expect(downloadCourseMock).toHaveBeenCalledTimes(2);
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
  });

  it("rejects unsafe course identifiers before API and filesystem calls", async () => {
    const result = await downloadCourseForOffline("../private", vi.fn());
    expect(result).toMatchObject({ success: false });
    expect(downloadCourseMock).not.toHaveBeenCalled();
    expect(fsMock.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
  });

  it("treats abort during last optional image fetch as CANCELLED, not a completed course", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.images = ["https://fixture.invalid/media/photo.jpg"];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      const error = new Error("cancelled in fixture");
      error.name = "AbortError";
      throw error;
    }));

    await expect(downloadCourseForOffline("base", vi.fn(), controller.signal))
      .resolves.toMatchObject({ success: false, code: "ABORTED" });
    expect(fsMock.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it("treats abort during last optional PDF fetch as CANCELLED, not success", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.pdfs = ["https://fixture.invalid/media/manual.pdf"];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      const error = new Error("cancelled in fixture");
      error.name = "AbortError";
      throw error;
    }));

    await expect(downloadCourseForOffline("base", vi.fn(), controller.signal))
      .resolves.toMatchObject({ success: false, code: "ABORTED" });
    expect(fsMock.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it("stores an image with a signed query as its stable safe path basename", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.images = ["https://fixture.invalid/media/photo.jpg?signature=mock"];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });

    const result = await downloadCourseForOffline("base", vi.fn());
    expect(result).toMatchObject({ success: true });
    expect(fsMock.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///ag3-native-fixture/offline/base/images/photo.jpg",
      expect.any(String),
      expect.objectContaining({ encoding: "base64" }),
    );
  });

  it("does not write an encoded traversal PDF file name to native storage", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.pdfs = ["https://fixture.invalid/pdfs/%2e%2e%2fprivate.pdf"];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });

    const result = await downloadCourseForOffline("base", vi.fn());
    expect(result).toMatchObject({ success: true });
    expect(fsMock.writeAsStringAsync.mock.calls.some(([p]) =>
      String(p).includes("/pdfs/"),
    )).toBe(false);
    expect(fsMock.deleteAsync).not.toHaveBeenCalled();
  });

  it("downloads a trainer-library video as HLS before acknowledging offline readiness", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.videos = [
      "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-1/videocourses/video-1/original.mp4",
    ];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({ success: true });
    expect(downloadHLSForOffline).toHaveBeenCalledWith(
      data.mediaFiles.videos[0], "base", "video-1", undefined, undefined,
    );
  });

  it("does not silently declare a course with external videos fully downloaded", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.videos = ["https://youtube.com/watch?v=external-1"];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });

    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false, code: "OFFLINE_VIDEO_UNSUPPORTED",
    });
    expect(downloadHLSForOffline).not.toHaveBeenCalled();
    expect(fsMock.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("does not trust an attacker host that merely embeds a storage hostname", async () => {
    const data = structuredClone(stubData);
    data.mediaFiles.videos = [
      "https://not-storage.invalid/gafus-media.storage.yandexcloud.net/videocourses/video-1/original.mp4",
    ];
    downloadCourseMock.mockResolvedValueOnce({ success: true, data });
    await expect(downloadCourseForOffline("base", vi.fn())).resolves.toMatchObject({
      success: false, code: "OFFLINE_VIDEO_UNSUPPORTED",
    });
    expect(downloadHLSForOffline).not.toHaveBeenCalled();
  });

});
