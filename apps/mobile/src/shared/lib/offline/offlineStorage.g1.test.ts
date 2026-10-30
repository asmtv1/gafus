import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeFs = vi.hoisted(() => ({
  files: new Map<string, string>(),
  directories: new Set<string>(),
  directoryNames: [] as string[],
  deletes: vi.fn(),
  reads: vi.fn(),
  inspectedUris: vi.fn(),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///test-device-sandbox/",
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    nativeFs.directories.add(uri);
  }),
  writeAsStringAsync: vi.fn(async (uri: string, value: string) => {
    nativeFs.files.set(uri, value);
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    nativeFs.reads(uri);
    const content = nativeFs.files.get(uri);
    if (content === undefined) throw new Error("not found");
    return content;
  }),
  getInfoAsync: vi.fn(async (uri: string) => {
    nativeFs.inspectedUris(uri);
    return {
      exists: nativeFs.files.has(uri) || nativeFs.directories.has(uri),
      isDirectory: nativeFs.directories.has(uri),
    };
  }),
  readDirectoryAsync: vi.fn(async () => nativeFs.directoryNames),
  deleteAsync: nativeFs.deletes,
}));

vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

const savedMeta = {
  course: {
    id: "COURSE_A",
    type: "base",
    name: "Test course",
    description: "",
    shortDesc: "",
    duration: "5 days",
    logoImg: "",
    isPrivate: true,
    isPaid: true,
    avgRating: null,
    trainingLevel: "BEGINNER",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-15T10:00:00.000Z",
    authorUsername: "trainer",
    videoUrl: null,
    equipment: null,
  },
  trainingDays: [],
  version: "version-A",
  downloadedAt: "2026-10-15T10:00:00.000Z",
};

const manifestPath = "file:///test-device-sandbox/offline/base/videos/vid-1/manifest.m3u8";
const videoUrl =
  "https://storage.yandexcloud.net/gafus-media/uploads/videocourses/vid-1/original.mp4";

describe("AG3 G1 native offline metadata & HLS JS restart fixtures", () => {
  beforeEach(() => {
    nativeFs.files.clear();
    nativeFs.directories.clear();
    nativeFs.directoryNames.length = 0;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("can read previously downloaded course metadata after JS module reload", async () => {
    const beforeRestart = await import("./offlineStorage");
    await beforeRestart.saveCourseMeta("base", savedMeta);
    const metadataUri = "file:///test-device-sandbox/offline/base/meta.json";
    const persistedBytes = nativeFs.files.get(metadataUri);
    expect(persistedBytes).toBeDefined();

    vi.resetModules(); // JS restart, keeping simulated Expo FileSystem bytes
    const afterRestart = await import("./offlineStorage");
    await expect(afterRestart.getCourseMeta("base")).resolves.toMatchObject({
      schemaVersion: 1,
      course: { id: "COURSE_A" },
      version: "version-A",
    });
    expect(nativeFs.files.get(metadataUri)).toBe(persistedBytes);
    expect(nativeFs.deletes).not.toHaveBeenCalled();
  });

  it("resolves a previously persisted local HLS manifest after JS module reload", async () => {
    nativeFs.files.set(manifestPath, "#EXTM3U\n#EXTINF:4\nsegment-1.ts");
    vi.resetModules();
    const offline = await import("./offlineStorage");

    await expect(offline.getOfflineVideoUri("base", videoUrl)).resolves.toBe(manifestPath);
    expect(nativeFs.reads).not.toHaveBeenCalled();
    expect(nativeFs.deletes).not.toHaveBeenCalled();
  });

  it("does not delete unknown-schema legacy metadata during a read attempt", async () => {
    const metadataUri = "file:///test-device-sandbox/offline/base/meta.json";
    const oldBytes = JSON.stringify({ schemaVersion: 0, course: { id: "LEGACY" } });
    nativeFs.files.set(metadataUri, oldBytes);
    const offline = await import("./offlineStorage");

    await expect(offline.getCourseMeta("base")).resolves.toBeNull();
    expect(nativeFs.files.get(metadataUri)).toBe(oldBytes);
    expect(nativeFs.deletes).not.toHaveBeenCalled();
  });
});

describe("AG3 G1 safe offline paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeFs.files.clear();
    nativeFs.directories.clear();
    vi.resetModules();
  });

  const parent = ["..", "private"].join("/");

  it("rejects unsafe course paths before invoking any native delete", async () => {
    const offline = await import("./offlineStorage");
    const unsafe = [
      parent,
      ".",
      "..",
      ["base", "..", "private"].join("/"),
      "base\\other",
      "%2e%2e",
      "base%2fsecret",
    ];
    for (const name of unsafe) {
      await expect(offline.deleteCourseData(name)).rejects.toThrow();
    }
    expect(nativeFs.deletes).not.toHaveBeenCalled();
  });

  it("does not create directories for unsafe course names", async () => {
    const offline = await import("./offlineStorage");
    await expect(offline.saveCourseMeta(parent, savedMeta)).rejects.toThrow();
    expect(nativeFs.directories.size).toBe(0);
  });

  it("does not probe native files for unsafe course and video IDs", async () => {
    const offline = await import("./offlineStorage");
    await expect(offline.getCourseMeta(parent)).resolves.toBeNull();
    await expect(offline.getLocalVideoManifestPath("base", parent)).resolves.toBeNull();
    await expect(offline.getOfflineVideoUri(parent, videoUrl)).resolves.toBeNull();
    await expect(offline.getOfflineVideoPosterUri(parent, videoUrl)).resolves.toBeNull();
    await expect(
      offline.getOfflineVideoPosterUri(
        "base",
        "https://example.com/uploads/videocourses/%2e%2e/original.mp4",
      ),
    ).resolves.toBeNull();
    expect(nativeFs.inspectedUris).not.toHaveBeenCalled();
  });

  it("ignores unexpected native directory names without probing them", async () => {
    const base = "file:///test-device-sandbox/offline/";
    nativeFs.directories.add(base);
    nativeFs.directories.add(base + "base");
    nativeFs.directoryNames.push("base", "..", "%2e%2e", ["private", "folder"].join("/"));
    const offline = await import("./offlineStorage");

    await expect(offline.getOfflineCourseTypes()).resolves.toEqual(["base"]);
    expect(nativeFs.inspectedUris).toHaveBeenCalledWith(base + "base");
    expect(nativeFs.inspectedUris).toHaveBeenCalledTimes(2);
  });

  it("never resolves outside the native offline tree from an untrusted relative path", async () => {
    const offline = await import("./offlineStorage");
    for (const unsafe of [
      "secrets.json",
      "../secrets.json",
      "/offline/base/videos/vid-1/manifest.m3u8",
      "file:///other-private-file",
      "offline/base/../other/manifest.m3u8",
      "offline/base%2Fother/videos/vid-1/manifest.m3u8",
      "offline/base\\other/videos/vid-1/manifest.m3u8",
      "offline/base/videos/vid-1/manifest.m3u8?token=secret",
      "offline//base/meta.json",
    ]) {
      expect(() => offline.buildFileUri(unsafe)).toThrow("Недопустим");
    }
    expect(nativeFs.deletes).not.toHaveBeenCalled();
    expect(nativeFs.reads).not.toHaveBeenCalled();
  });

  it("still resolves existing safe legacy native paths without schema migration", async () => {
    const offline = await import("./offlineStorage");
    expect(offline.buildFileUri("offline/base/videos/vid-1/manifest.m3u8")).toBe(
      "file:///test-device-sandbox/offline/base/videos/vid-1/manifest.m3u8",
    );
    expect(offline.buildFileUri("offline/base/meta.json")).toBe(
      "file:///test-device-sandbox/offline/base/meta.json",
    );
  });

  it("preserves existing legitimate safe course type names", async () => {
    const offline = await import("./offlineStorage");
    await offline.saveCourseMeta("base-level_1.0", savedMeta);
    await expect(offline.getCourseMeta("base-level_1.0")).resolves.toMatchObject({
      schemaVersion: 1,
      version: "version-A",
    });
    expect(nativeFs.deletes).not.toHaveBeenCalled();
  });
});
