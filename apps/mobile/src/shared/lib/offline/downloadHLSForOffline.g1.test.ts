import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  downloadAsync: vi.fn().mockResolvedValue({ status: 200 }),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
}));
const getVideoUrlMock = vi.hoisted(() => vi.fn());

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///ag3-native-fixture/",
  ...fsMock,
}));
vi.mock("@/shared/lib/api", () => ({
  trainingApi: { getVideoUrl: getVideoUrlMock },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import { downloadHLSForOffline } from "./downloadHLSForOffline";

describe("AG3 G1 native HLS writer path confinement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.downloadAsync.mockReset().mockResolvedValue({ status: 200 });
    getVideoUrlMock.mockResolvedValue({
      success: true,
      data: { url: "https://fixture.invalid/hls/index.m3u8" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4,\n0001.ts\n#EXT-X-ENDLIST",
    }));
  });

  it("rejects unsafe course and video identifiers before native IO", async () => {
    for (const pair of [["../private", "safe"], ["base", "../private"], ["%2e%2e", "safe"]]) {
      await expect(downloadHLSForOffline("https://fixture.invalid/video.mp4", pair[0]!, pair[1]!)).rejects.toThrow();
    }
    expect(fsMock.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fsMock.downloadAsync).not.toHaveBeenCalled();
    expect(getVideoUrlMock).not.toHaveBeenCalled();
  });

  it("does not download a manifest segment to a traversing file name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:4,\n../other-course/private.ts",
    }));
    await expect(downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1")).rejects.toThrow();
    expect(fsMock.downloadAsync).not.toHaveBeenCalled();
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("retains signed relative segment URLs while keeping a local path without query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:4,\n0001.ts?sig=demo-only",
    }));
    await expect(downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1")).resolves.toBeUndefined();
    expect(fsMock.downloadAsync).toHaveBeenCalledWith(
      "https://fixture.invalid/hls/0001.ts?sig=demo-only",
      "file:///ag3-native-fixture/offline/base/videos/clip-1/0001.ts",
    );
    expect(fsMock.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///ag3-native-fixture/offline/base/videos/clip-1/manifest.m3u8",
      "#EXTM3U\n#EXTINF:4,\n0001.ts",
    );
  });

  it("keeps different remote segments with the same basename in distinct local files", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:4,\nhttps://fixture.invalid/hls/a/001.ts\n#EXTINF:4,\nhttps://fixture.invalid/hls/b/001.ts",
    }));

    await downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1");

    const transfers = fsMock.downloadAsync.mock.calls.map(([url, destination]) => ({
      url: String(url), destination: String(destination),
    }));
    expect(transfers).toHaveLength(2);
    expect(transfers.map(({ url }) => url)).toEqual([
      "https://fixture.invalid/hls/a/001.ts",
      "https://fixture.invalid/hls/b/001.ts",
    ]);
    const destinations = transfers.map(({ destination }) => destination);
    expect(new Set(destinations).size).toBe(2);
    expect(destinations.every((dest) =>
      dest.startsWith("file:///ag3-native-fixture/offline/base/videos/clip-1/"),
    )).toBe(true);
    const manifest = fsMock.writeAsStringAsync.mock.calls.at(-1)?.[1] as string;
    const localReferences = manifest.split("\n").filter((line) => line.endsWith(".ts"));
    expect(localReferences).toHaveLength(2);
    expect(new Set(localReferences).size).toBe(2);
    for (let i = 0; i < destinations.length; i++) {
      expect(destinations[i]).toBe(
        "file:///ag3-native-fixture/offline/base/videos/clip-1/" + localReferences[i],
      );
    }
  });

  it("does not overwrite the local manifest or poster with an identically named segment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:4,\nmanifest.m3u8\n#EXTINF:4,\nposter.jpg",
    }));
    getVideoUrlMock.mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://fixture.invalid/hls/index.m3u8",
        posterUrl: "https://fixture.invalid/hls/poster.jpg",
      },
    });

    await downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1");

    const transfers = fsMock.downloadAsync.mock.calls.map(([, destination]) => String(destination));
    const manifestPath = "file:///ag3-native-fixture/offline/base/videos/clip-1/manifest.m3u8";
    const posterPath = "file:///ag3-native-fixture/offline/base/videos/clip-1/poster.jpg";
    expect(transfers.filter((path) => path === manifestPath)).toHaveLength(0);
    expect(transfers.filter((path) => path === posterPath)).toHaveLength(1);
    const rewritten = String(fsMock.writeAsStringAsync.mock.calls.at(-1)?.[1]);
    const refs = rewritten.split("\n").filter((line) =>
      line.endsWith(".m3u8") || line.endsWith(".jpg"),
    );
    expect(refs).toHaveLength(2);
    expect(refs).not.toContain("manifest.m3u8");
    expect(refs).not.toContain("poster.jpg");
  });

  it("does not publish a completed manifest when cancellation happens during native segment download", async () => {
    const controller = new AbortController();
    let release!: (result: { status: number }) => void;
    const nativeDownload = new Promise<{ status: number }>((resolve) => {
      release = resolve;
    });
    fsMock.downloadAsync.mockReturnValueOnce(nativeDownload);
    const task = downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1", undefined, controller.signal);
    await vi.waitFor(() => expect(fsMock.downloadAsync).toHaveBeenCalledTimes(1));
    controller.abort();
    release({ status: 200 });

    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("recognizes cancellation during the final local manifest write", async () => {
    const controller = new AbortController();
    fsMock.writeAsStringAsync.mockImplementationOnce(async () => {
      controller.abort();
    });
    await expect(downloadHLSForOffline(
      "https://fixture.invalid/video.mp4",
      "base",
      "clip-1",
      undefined,
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(fsMock.downloadAsync).toHaveBeenCalledTimes(1);
  });

  it("waits for other native writes to settle before reporting a failed segment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:4,\n0001.ts\n#EXTINF:4,\n0002.ts",
    }));
    let release!: (result: { status: number }) => void;
    const unfinishedNativeWrite = new Promise<{ status: number }>((resolve) => {
      release = resolve;
    });
    fsMock.downloadAsync.mockImplementation((url: string) =>
      url.endsWith("/0001.ts") ? Promise.resolve({ status: 500 }) : unfinishedNativeWrite,
    );
    const task = downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1");
    let finished = false;
    void task.then(() => { finished = true; }, () => { finished = true; });
    await vi.waitFor(() => expect(fsMock.downloadAsync).toHaveBeenCalledTimes(4));
    await Promise.resolve();
    expect(finished).toBe(false);
    release({ status: 200 });

    await expect(task).rejects.toThrow("HTTP 500");
    expect(fsMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("keeps ordinary native HLS download paths and relative manifest names", async () => {
    await expect(downloadHLSForOffline("https://fixture.invalid/video.mp4", "base", "clip-1")).resolves.toBeUndefined();
    expect(fsMock.downloadAsync).toHaveBeenCalledWith(
      "https://fixture.invalid/hls/0001.ts",
      "file:///ag3-native-fixture/offline/base/videos/clip-1/0001.ts",
    );
    expect(fsMock.writeAsStringAsync).toHaveBeenCalledWith(
      "file:///ag3-native-fixture/offline/base/videos/clip-1/manifest.m3u8",
      expect.stringContaining("0001.ts"),
    );
  });
});
