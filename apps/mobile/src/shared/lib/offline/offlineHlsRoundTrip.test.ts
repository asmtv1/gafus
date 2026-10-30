import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  files: new Map<string, string>(),
  directories: new Set<string>(),
  downloadAsync: vi.fn(),
}));
const getVideoUrl = vi.hoisted(() => vi.fn());
const downloadCourse = vi.hoisted(() => vi.fn());

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///offline-test-device/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: vi.fn(async (path: string) => ({
    exists: native.files.has(path) || native.directories.has(path),
    isDirectory: native.directories.has(path),
  })),
  makeDirectoryAsync: vi.fn(async (path: string) => { native.directories.add(path); }),
  writeAsStringAsync: vi.fn(async (path: string, contents: string) => {
    native.files.set(path, contents);
  }),
  downloadAsync: native.downloadAsync,
  deleteAsync: vi.fn(async (path: string) => {
    for (const key of native.files.keys()) if (key.startsWith(path)) native.files.delete(key);
  }),
}));
vi.mock("@/shared/lib/api/offline", () => ({ offlineApi: { downloadCourse } }));
vi.mock("@/shared/lib/api", () => ({ trainingApi: { getVideoUrl } }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import { downloadCourseForOffline } from "./downloadCourseForOffline";
import { getOfflineVideoUri } from "./offlineStorage";

const libraryUrl = "https://gafus-media.storage.yandexcloud.net/uploads/trainers/t1/videocourses/v123/original.mp4";
const signedMaster = "https://api.fixture/training/video/v123/manifest.m3u8?token=test";
const signedVariant = "https://api.fixture/training/video/v123/segment?path=720p.m3u8&token=test";
const signedSegment = "https://assets.fixture/720p-segment-001.ts?signature=test";

beforeEach(() => {
  vi.clearAllMocks();
  native.files.clear();
  native.directories.clear();
  getVideoUrl.mockResolvedValue({ success: true, data: { url: signedMaster } });
  downloadCourse.mockResolvedValue({
    success: true,
    data: {
      course: { id: "course-db-id", type: "base", name: "Test", updatedAt: "2026-10-01" },
      trainingDays: [],
      mediaFiles: { videos: [libraryUrl], images: [], pdfs: [] },
    },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === signedMaster) {
      return { ok: true, text: async () => `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\n${signedVariant}` };
    }
    if (url === signedVariant) {
      return { ok: true, text: async () => `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n${signedSegment}\n#EXT-X-ENDLIST` };
    }
    throw new Error("Unexpected URL in synthetic offline fixture");
  }));
  native.downloadAsync.mockImplementation(async (_remote: string, local: string) => {
    native.files.set(local, "SYNTHETIC_VIDEO_BYTES");
    return { status: 200 };
  });
});

describe("local course HLS download → persisted manifest → playback URI", () => {
  it("stores all selected-variant segments and resolves by course.type, not course.id", async () => {
    const progress = vi.fn();
    await expect(downloadCourseForOffline("base", progress)).resolves.toMatchObject({ success: true });

    const uri = await getOfflineVideoUri("base", libraryUrl);
    expect(uri).toBe("file:///offline-test-device/offline/base/videos/v123/manifest.m3u8");
    // The DB ID is intentionally not a valid offline folder key.
    await expect(getOfflineVideoUri("course-db-id", libraryUrl)).resolves.toBeNull();

    const content = native.files.get(uri!);
    expect(content).toContain("720p-segment-001.ts");
    expect(content).not.toContain("https://");
    expect(native.files.get("file:///offline-test-device/offline/base/videos/v123/720p-segment-001.ts"))
      .toBe("SYNTHETIC_VIDEO_BYTES");
    expect(native.downloadAsync).toHaveBeenCalledWith(signedSegment,
      "file:///offline-test-device/offline/base/videos/v123/720p-segment-001.ts");
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: "done" }));
  });
});
