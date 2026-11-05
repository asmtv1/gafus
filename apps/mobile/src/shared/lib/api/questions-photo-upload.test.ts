import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoUploadStageError } from "../media/photoUploadStage";

const m = vi.hoisted(() => ({
  prepare: vi.fn(),
  post: vi.fn(),
  api: vi.fn(),
  smallDispose: vi.fn(),
  mediumDispose: vi.fn(),
}));
vi.mock("@gafus/types", () => ({ createQuestionsClient: () => ({}) }));
vi.mock("./client", () => ({ apiClient: (...args: unknown[]) => m.api(...args) }));
vi.mock("../media/prepareUploadWebp", () => ({
  prepareUploadWebpVariants: (...args: unknown[]) => m.prepare(...args),
}));
vi.mock("../media/directPhotoUpload", () => ({
  postClientWebp: (...args: unknown[]) => m.post(...args),
}));
import { uploadClientQuestionsPhoto } from "./questions";

const src = { uri: "file:///cache/photo.jpg", width: 1920, height: 1280 };
const versions = () => ({
  small: {
    uri: "file:///cache/s.webp", mime: "image/webp" as const, bytes: 1900,
    dispose: m.smallDispose, width: 360, height: 240,
  },
  medium: {
    uri: "file:///cache/m.webp", mime: "image/webp" as const, bytes: 15000,
    dispose: m.mediumDispose, width: 1440, height: 960,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  m.prepare.mockResolvedValue(versions());
  m.post.mockResolvedValue(undefined);
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith("client-reservations")) {
      return { success: true, data: {
        id: "reserve-1", upload: { url: "https://s3.cloud.ru", fields: {}, method: "POST" },
        smallUpload: { url: "https://s3.cloud.ru", fields: {}, method: "POST" },
      } };
    }
    if (path.endsWith("client-confirm"))
      return { success: true, data: { id: "reserve-1", status: "READY" } };
    if (path.endsWith("/reserve-1")) return { success: true, data: {} };
    throw Error("unexpected API call");
  });
});
describe("client-only Questions photo uploads", () => {
  it("uploads both WebP renditions and commits READY", async () => {
    await expect(uploadClientQuestionsPhoto(src)).resolves.toEqual({
      id: "reserve-1", status: "READY", url: src.uri,
    });
    expect(m.prepare).toHaveBeenCalledExactlyOnceWith(src, { small: 360, medium: 1440 });
    expect(m.post).toHaveBeenCalledTimes(2);
    expect(m.smallDispose).toHaveBeenCalledOnce();
    expect(m.mediumDispose).toHaveBeenCalledOnce();
  });
  it("reuses pre-encoded draft WebPs on publish without encoding or disposing them", async () => {
    const cached = versions();
    expect(m.api).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
    await expect(uploadClientQuestionsPhoto(src, undefined, cached)).resolves.toEqual({
      id: "reserve-1", status: "READY", url: src.uri,
    });
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.post).toHaveBeenCalledTimes(2);
    expect(m.post.mock.calls.map(([, file]) => file.uri).sort()).toEqual([
      "file:///cache/m.webp", "file:///cache/s.webp",
    ]);
    expect(m.smallDispose).not.toHaveBeenCalled();
    expect(m.mediumDispose).not.toHaveBeenCalled();
  });
  it("preserves cached WebPs after a failed post so just that photo can be retried", async () => {
    const cached = versions();
    m.post.mockRejectedValueOnce(new Error("offline"));
    await expect(uploadClientQuestionsPhoto(src, undefined, cached)).rejects.toMatchObject({
      stage: "transfer", name: "PhotoUploadStageError",
    });
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.smallDispose).not.toHaveBeenCalled();
    expect(m.mediumDispose).not.toHaveBeenCalled();
  });
  it("attributes HEIC/WebP encode failure before any server request", async () => {
    m.prepare.mockRejectedValueOnce(new TypeError("iOS encoder unavailable"));
    await expect(uploadClientQuestionsPhoto(src)).rejects.toMatchObject({
      stage: "webp", name: "PhotoUploadStageError",
    } satisfies Partial<PhotoUploadStageError>);
    expect(m.api).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
  });
  it("waits for second S3 request to finish before deleting its source file", async () => {
    let release!: () => void;
    const second = new Promise<void>(resolve => { release = resolve; });
    m.post.mockRejectedValueOnce(new Error("S3 network"))
      .mockImplementationOnce(() => second);
    const sending = uploadClientQuestionsPhoto(src);
    await vi.waitFor(() => expect(m.post).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(m.smallDispose).not.toHaveBeenCalled();
    expect(m.mediumDispose).not.toHaveBeenCalled();
    release();
    await expect(sending).rejects.toMatchObject({
      stage: "transfer", name: "PhotoUploadStageError",
    } satisfies Partial<PhotoUploadStageError>);
    expect(m.smallDispose).toHaveBeenCalledOnce();
    expect(m.mediumDispose).toHaveBeenCalledOnce();
    expect(m.api.mock.calls.filter(([path]) => String(path).endsWith("client-confirm"))).toHaveLength(0);
  });
});
