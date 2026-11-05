import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  manipulate: vi.fn(),
  sizes: new Map<string, number>(),
  deleted: [] as string[],
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: undefined,
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: state.manipulate,
}));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(readonly uri: string) {}
    get size() { return state.sizes.get(this.uri) ?? 0; }
    delete() { state.deleted.push(this.uri); }
  },
}));
import { prepareUploadPhoto, UPLOAD_PHOTO_MAX_EDGE, UPLOAD_PHOTO_QUALITY } from "./prepareUploadPhoto";

beforeEach(() => {
  state.manipulate.mockReset();
  state.sizes.clear();
  state.deleted.length = 0;
});

describe("shared native photo S3 pre-processing", () => {
  it("compresses landscape 4032x3024 into 1920px JPEG at quality 0.8, with accurate bytes", async () => {
    state.manipulate.mockResolvedValue({ uri: "file:///temp/landscape.jpg", width: 1920, height: 1440 });
    state.sizes.set("file:///temp/landscape.jpg", 420_100);
    const photo = await prepareUploadPhoto({ uri: "file:///original/landscape.png", width: 4032, height: 3024 });
    expect(UPLOAD_PHOTO_MAX_EDGE).toBe(1920);
    expect(UPLOAD_PHOTO_QUALITY).toBe(0.8);
    expect(state.manipulate).toHaveBeenCalledWith("file:///original/landscape.png",
      [{ resize: { width: 1920 } }], { format: "jpeg", compress: 0.8 });
    expect(photo).toMatchObject({
      mime: "image/jpeg", uri: "file:///temp/landscape.jpg", bytes: 420_100,
      width: 1920, height: 1440,
    });
    photo.dispose();
    expect(state.deleted).toEqual(["file:///temp/landscape.jpg"]);
    expect(state.deleted).not.toContain("file:///original/landscape.png");
  });

  it("limits portrait image by height and re-encodes even small photos", async () => {
    state.manipulate.mockResolvedValueOnce({ uri: "file:///temp/portrait.jpg", width: 960, height: 1920 });
    state.sizes.set("file:///temp/portrait.jpg", 120_000);
    await prepareUploadPhoto({ uri: "file:///original/portrait.heic", width: 2160, height: 4320 });
    expect(state.manipulate).toHaveBeenCalledWith("file:///original/portrait.heic",
      [{ resize: { height: 1920 } }], { format: "jpeg", compress: 0.8 });
    state.manipulate.mockClear().mockResolvedValueOnce({ uri: "file:///temp/small.jpg", width: 800, height: 600 });
    state.sizes.set("file:///temp/small.jpg", 45_000);
    await prepareUploadPhoto({ uri: "file:///original/small.webp", width: 800, height: 600 });
    expect(state.manipulate).toHaveBeenCalledWith("file:///original/small.webp", [],
      { format: "jpeg", compress: 0.8 });
  });

  it("checks actual generated dimensions when picker metadata is missing", async () => {
    state.manipulate.mockResolvedValueOnce({ uri: "file:///temp/first.jpg", width: 3500, height: 2400 })
      .mockResolvedValueOnce({ uri: "file:///temp/final.jpg", width: 1920, height: 1317 });
    state.sizes.set("file:///temp/final.jpg", 150_000);
    const photo = await prepareUploadPhoto({ uri: "file:///original/unknown.jpg", width: 0, height: 0 });
    expect(state.manipulate).toHaveBeenCalledTimes(2);
    expect(state.manipulate.mock.calls[1][1]).toEqual([{ resize: { width: 1920 } }]);
    expect(state.deleted).toContain("file:///temp/first.jpg");
    expect(photo.bytes).toBe(150_000);
    photo.dispose();
    expect(state.deleted).not.toContain("file:///original/unknown.jpg");
  });

  it("rejects empty transformed output and cleans up only the generated file", async () => {
    state.manipulate.mockResolvedValue({ uri: "file:///temp/empty.jpg", width: 900, height: 900 });
    await expect(prepareUploadPhoto({ uri: "file:///original/photo.jpg", width: 900, height: 900 }))
      .rejects.toThrow("Получилась пустая фотография");
    expect(state.deleted).toEqual(["file:///temp/empty.jpg"]);
  });
});
