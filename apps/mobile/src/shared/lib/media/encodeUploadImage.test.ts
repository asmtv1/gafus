import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  manipulate: vi.fn(),
  legacy: vi.fn(),
  resize: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  releaseImage: vi.fn(),
  releaseContext: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: native.manipulate },
  manipulateAsync: native.legacy,
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
}));
import { encodeUploadImage } from "./encodeUploadImage";

beforeEach(() => {
  for (const item of Object.values(native)) item.mockReset();
  native.manipulate.mockReturnValue({
    resize: native.resize, renderAsync: native.render, release: native.releaseContext,
  });
  native.render.mockResolvedValue({ saveAsync: native.save, release: native.releaseImage });
  native.save.mockResolvedValue({ uri: "file:///cache/photo.webp", width: 720, height: 600 });
});
describe("Expo 55 Android image lifetime", () => {
  it("releases both native refs after successful save, without deprecated API", async () => {
    const result = await encodeUploadImage("file:///source.jpg",
      [{ resize: { width: 720 } }], { format: "webp" as never, compress: 0.8 });
    expect(result.width).toBe(720);
    expect(native.manipulate).toHaveBeenCalledExactlyOnceWith("file:///source.jpg");
    expect(native.resize).toHaveBeenCalledExactlyOnceWith({ width: 720 });
    expect(native.legacy).not.toHaveBeenCalled();
    expect(native.releaseImage).toHaveBeenCalledOnce();
    expect(native.releaseContext).toHaveBeenCalledOnce();
    expect(native.releaseImage.mock.invocationCallOrder[0])
      .toBeLessThan(native.releaseContext.mock.invocationCallOrder[0]!);
  });
  it("releases native refs even when Android encoder fails", async () => {
    native.save.mockRejectedValueOnce(new Error("cannot encode bitmap"));
    await expect(encodeUploadImage("file:///source.jpg", [],
      { format: "webp" as never })).rejects.toThrow("cannot encode bitmap");
    expect(native.releaseImage).toHaveBeenCalledOnce();
    expect(native.releaseContext).toHaveBeenCalledOnce();
  });
  it("releases context when decoding/resize fails before image is created", async () => {
    native.render.mockRejectedValueOnce(new Error("decode failed"));
    await expect(encodeUploadImage("file:///source.jpg", [],
      { format: "jpeg" as never })).rejects.toThrow("decode failed");
    expect(native.releaseImage).not.toHaveBeenCalled();
    expect(native.releaseContext).toHaveBeenCalledOnce();
  });
});
