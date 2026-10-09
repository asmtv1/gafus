import { describe, expect, it, vi } from "vitest";
import { FeedImageError, validateFeedImageInfo, processFeedImage, type FeedImageEngine } from "./image.js";

function engine(overrides: Partial<FeedImageEngine> = {}): FeedImageEngine {
  return {
    inspect: vi.fn(async () => ({ format: "jpeg", width: 1000, height: 2000, pages: 1 })),
    encode: vi.fn(async (_source, options) => {
      const scale = Math.min(1, options.maxEdge / 2000);
      return { bytes: new Uint8Array(42), width: Math.round(1000 * scale), height: Math.round(2000 * scale) };
    }),
    ...overrides,
  };
}
describe("private feed image conversion", () => {
  it("enforces real decoded format, 50 MP, animation and 10 MiB boundary", () => {
    expect(validateFeedImageInfo({ format: "png", width: 10000, height: 5000 }, 10 * 1024 * 1024))
      .toEqual({ orientedWidth: 10000, orientedHeight: 5000 });
    for (const [info, size] of [
      [{ format: "gif", width: 10, height: 10 }, 100],
      [{ format: "jpeg", width: 10000, height: 5001 }, 100],
      [{ format: "webp", width: 10, height: 10, pages: 2 }, 100],
      [{ format: "png", width: 10, height: 10 }, 10 * 1024 * 1024 + 1],
    ] as const) {
      expect(() => validateFeedImageInfo(info, size)).toThrow(FeedImageError);
    }
  });
  it("handles EXIF rotation before proportional resizing", () => {
    expect(validateFeedImageInfo({ format: "jpeg", width: 2400, height: 1200, orientation: 6 }, 100))
      .toEqual({ orientedWidth: 1200, orientedHeight: 2400 });
  });
  it("encodes two metadata-free WebP sizes", async () => {
    const worker = engine();
    const out = await processFeedImage(new Uint8Array(200), worker);
    expect(out.thumb).toMatchObject({ width: 240, height: 480 });
    expect(out.full).toMatchObject({ width: 960, height: 1920 });
    expect(worker.encode).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({
      autoOrient: true, stripMetadata: true, quality: 82, withoutEnlargement: true,
    }));
  });
  it("does not accept incorrect decoder dimensions", async () => {
    const worker = engine({ encode: async () => ({ width: 480, height: 480, bytes: new Uint8Array(1) }) });
    await expect(processFeedImage(new Uint8Array(4), worker)).rejects.toThrow("INVALID_IMAGE");
  });
  it("refuses corrupt input and never trusts claimed MIME", async () => {
    const worker = engine({ inspect: async () => { throw new Error("bad decode"); } });
    await expect(processFeedImage(new Uint8Array(10), worker)).rejects.toThrow("INVALID_IMAGE");
  });
});
