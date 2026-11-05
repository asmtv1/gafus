import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  create: vi.fn(), manipulate: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-video", () => ({ createVideoPlayer: (...args: unknown[]) => m.create(...args) }));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => m.manipulate(...args) },
  SaveFormat: { JPEG: "jpeg" },
}));
import { makeFeedVideoPoster } from "./videoPoster";
beforeEach(() => { m.create.mockReset(); m.manipulate.mockReset(); });
describe("Moments picked video poster", () => {
  it("extracts and persists a native frame and releases the player", async () => {
    const frame = { native: "image" };
    const remove = vi.fn(), release = vi.fn();
    const generateThumbnailsAsync = vi.fn().mockResolvedValue([frame]);
    m.create.mockReturnValue({
      status: "readyToPlay", pause: vi.fn(), release,
      addListener: vi.fn().mockReturnValue({ remove }), generateThumbnailsAsync,
    });
    const saveAsync = vi.fn().mockResolvedValue({ uri: "file:///cached-poster.jpg" });
    m.manipulate.mockReturnValue({ renderAsync: vi.fn().mockResolvedValue({ saveAsync }) });
    await expect(makeFeedVideoPoster("file:///video.mov")).resolves.toBe("file:///cached-poster.jpg");
    expect(m.create).toHaveBeenCalledWith({ uri: "file:///video.mov" });
    expect(generateThumbnailsAsync).toHaveBeenCalledWith(0, { maxWidth: 480, maxHeight: 480 });
    expect(m.manipulate).toHaveBeenCalledWith(frame);
    expect(saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8 });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("does not reject the chosen video when the native decoder fails", async () => {
    const release = vi.fn();
    m.create.mockReturnValue({
      status: "error", pause: vi.fn(), release,
      addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    });
    await expect(makeFeedVideoPoster("file:///unsupported.mov")).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
