import { describe, expect, it, vi } from "vitest";
import { createGalleryImageProcessor, GALLERY_IMAGE_MAX_OUTPUT_BYTES } from "./imageProcessing";
import type { GalleryImageEngine, GalleryImageInfo } from "./imageProcessing";
import { galleryAttemptKeys, galleryPhotoKeys, gallerySourceKey } from "./keys";
import {
  galleryAlbumCreateSchema,
  galleryAlbumUpdateSchema,
  galleryUploadSchema,
  galleryParse,
} from "./schemas";
import { createGalleryClient, GALLERY_LIMITS } from "../../../../types/src/gallery";

function engine(
  info: GalleryImageInfo = { format: "jpeg", width: 4000, height: 2000, orientation: 6 },
) {
  const rotated = [5, 6, 7, 8].includes(info.orientation ?? 1);
  const w = rotated ? info.height : info.width,
    h = rotated ? info.width : info.height;
  return {
    inspect: vi.fn(async () => info),
    autoOrientResizeEncodeWebp: vi.fn(async (_bytes, { maxEdge }) => {
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      return {
        bytes: new Uint8Array([82]),
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
      };
    }),
  } satisfies GalleryImageEngine;
}
describe("isolated gallery processor and contracts", () => {
  it("orients BEFORE resize, creates 480/1920 WebP with quality82 and strips metadata", async () => {
    const e = engine(),
      process = createGalleryImageProcessor(e),
      bytes = new Uint8Array([1, 2]);
    const result = await process(bytes);
    expect(result.thumb).toMatchObject({ width: 240, height: 480 });
    expect(result.full).toMatchObject({ width: 960, height: 1920 });
    expect(e.inspect).toHaveBeenCalledWith(bytes, { limitInputPixels: GALLERY_LIMITS.pixels });
    for (const maxEdge of [480, 1920])
      expect(e.autoOrientResizeEncodeWebp).toHaveBeenCalledWith(bytes, {
        maxEdge,
        autoOrient: true,
        withoutEnlargement: true,
        stripMetadata: true,
        quality: 82,
        limitInputPixels: 50_000_000,
      });
  });
  it("reduces oversized full output while preserving oriented aspect, fixed quality and flags", async () => {
    const e = engine();
    const encode = e.autoOrientResizeEncodeWebp.getMockImplementation()!;
    e.autoOrientResizeEncodeWebp.mockImplementation(async (bytes, options) => ({
      ...(await encode(bytes, options)),
      bytes: new Uint8Array(
        options.maxEdge === 1920
          ? GALLERY_IMAGE_MAX_OUTPUT_BYTES + 1
          : options.maxEdge === 1440
            ? GALLERY_IMAGE_MAX_OUTPUT_BYTES
            : 1,
      ),
    }));
    const bytes = new Uint8Array([1]);
    const result = await createGalleryImageProcessor(e)(bytes);
    expect(result.thumb).toMatchObject({ width: 240, height: 480 });
    expect(result.full).toMatchObject({ width: 720, height: 1440 });
    expect(result.full.bytes.byteLength).toBe(GALLERY_IMAGE_MAX_OUTPUT_BYTES);
    expect(e.autoOrientResizeEncodeWebp.mock.calls.map(([, options]) => options.maxEdge)).toEqual([
      480, 1920, 1440,
    ]);
    for (const maxEdge of [480, 1920, 1440])
      expect(e.autoOrientResizeEncodeWebp).toHaveBeenCalledWith(bytes, {
        maxEdge,
        autoOrient: true,
        withoutEnlargement: true,
        stripMetadata: true,
        quality: 82,
        limitInputPixels: 50_000_000,
      });
  });
  it("bounds oversized encoding at 256 for either variant and stops before full if thumb fails", async () => {
    for (const oversizedThumb of [false, true]) {
      const e = engine();
      const encode = e.autoOrientResizeEncodeWebp.getMockImplementation()!;
      e.autoOrientResizeEncodeWebp.mockImplementation(async (bytes, options) => ({
        ...(await encode(bytes, options)),
        bytes: new Uint8Array(
          oversizedThumb || options.maxEdge !== 480 ? GALLERY_IMAGE_MAX_OUTPUT_BYTES + 1 : 1,
        ),
      }));
      await expect(createGalleryImageProcessor(e)(new Uint8Array([1]))).rejects.toMatchObject({
        code: "OUTPUT_TOO_LARGE",
        message: "Изображение слишком большое после обработки. Попробуйте другое фото",
      });
      expect(e.autoOrientResizeEncodeWebp.mock.calls.map(([, options]) => options.maxEdge)).toEqual(
        oversizedThumb
          ? [480, 360, 270, 256]
          : [480, 1920, 1440, 1080, 810, 608, 456, 342, 257, 256],
      );
    }
  });
  it("does not enlarge small PNG/WebP inputs", async () => {
    for (const format of ["png", "webp"]) {
      const result = await createGalleryImageProcessor(engine({ format, width: 100, height: 50 }))(
        new Uint8Array([1]),
      );
      expect(result.thumb.width).toBe(100);
      expect(result.full.width).toBe(100);
    }
  });
  it("rejects empty/>10MiB before calling the decoder", async () => {
    const e = engine(),
      process = createGalleryImageProcessor(e);
    for (const data of [new Uint8Array(), new Uint8Array(GALLERY_LIMITS.photoBytes + 1)])
      await expect(process(data)).rejects.toMatchObject({ code: "IMAGE_SIZE" });
    expect(e.inspect).not.toHaveBeenCalled();
  });
  it("rejects actual unsupported type, >50MP, animation and invalid dimensions", async () => {
    for (const [info, code] of [
      [{ format: "gif", width: 10, height: 10 }, "IMAGE_FORMAT"],
      [{ format: "jpeg", width: 10000, height: 5001 }, "IMAGE_PIXELS"],
      [{ format: "webp", width: 10, height: 10, pages: 2 }, "IMAGE_ANIMATED"],
      [{ format: "png", width: NaN, height: 10 }, "IMAGE_PIXELS"],
      [{ format: "png", width: 0, height: 10 }, "IMAGE_PIXELS"],
    ] as [GalleryImageInfo, string][]) {
      const e = engine(info);
      await expect(createGalleryImageProcessor(e)(new Uint8Array([1]))).rejects.toMatchObject({
        code,
      });
      expect(e.autoOrientResizeEncodeWebp).not.toHaveBeenCalled();
    }
  });
  it("maps corrupt inspect/encode failures and rejects dishonest resized dimensions", async () => {
    const e = engine();
    e.inspect.mockRejectedValueOnce(new Error("corrupt"));
    await expect(createGalleryImageProcessor(e)(new Uint8Array([1]))).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
    e.autoOrientResizeEncodeWebp.mockRejectedValueOnce(new Error("decode failed"));
    await expect(createGalleryImageProcessor(e)(new Uint8Array([1]))).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
    e.autoOrientResizeEncodeWebp.mockResolvedValueOnce({
      bytes: new Uint8Array([1]),
      width: 9999,
      height: 9999,
    });
    await expect(createGalleryImageProcessor(e)(new Uint8Array([1]))).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  });
  it("validates shared lengths, disallows unknown client keys and empty album edits", () => {
    expect(galleryParse(galleryAlbumCreateSchema, { name: "  Альбом  " })).toEqual({
      name: "Альбом",
    });
    expect(() => galleryParse(galleryAlbumCreateSchema, { name: "x".repeat(121) })).toThrow();
    expect(() => galleryParse(galleryAlbumUpdateSchema, {})).toThrow();
    expect(() =>
      galleryParse(galleryAlbumCreateSchema, { name: "Name", description: "x".repeat(2001) }),
    ).toThrow();
    expect(
      galleryUploadSchema.safeParse({
        filename: "a",
        declaredMime: "image/jpeg",
        declaredBytes: 10,
        clientRequestId: "10931daa-3d3a-41ba-a2cc-f4722d8c3425",
        sourceKey: "arbitrary/key",
      }).success,
    ).toBe(false);
  });
  it("pure keys enforce components, ignore filenames and use exact incoming/final folders", () => {
    expect(gallerySourceKey("owner", "album", "upload", "image/jpeg")).toBe(
      "albums/owner/album/incoming/upload/source.jpg",
    );
    expect(galleryAttemptKeys("owner", "album", "upload", "token").fullKey).toBe(
      "albums/owner/album/incoming/upload/attempts/token/full.webp",
    );
    expect(galleryPhotoKeys("owner", "album", "photo").thumbKey).toBe(
      "albums/owner/album/photos/photo/thumb.webp",
    );
    for (const component of ["..", "x/y", "x%2Fy", "", "?x"])
      expect(() => galleryPhotoKeys(component, "album", "photo")).toThrow();
  });
  it("shared client only delegates typed routes and encodes identities/query cursor", async () => {
    const transport = vi.fn(async () => ({})),
      client = createGalleryClient(transport as never);
    await client.listAlbums("name/other", { cursor: "a+/=", pageSize: 3 });
    expect(transport).toHaveBeenCalledWith(
      "profiles/name%2Fother/albums?cursor=a%2B%2F%3D&pageSize=3",
    );
    await client.setCover("album", { photoId: null });
    expect(transport).toHaveBeenCalledWith("albums/album/cover", {
      method: "PUT",
      body: { photoId: null },
    });
  });
});
