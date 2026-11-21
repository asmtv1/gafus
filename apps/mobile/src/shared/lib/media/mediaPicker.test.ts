import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePickerAsset } from "expo-image-picker";
import { MediaPickerError, pickMedia } from "./mediaPicker";

const native = vi.hoisted(() => ({
  platform: "android",
  launch: vi.fn(),
  permission: vi.fn(),
  size: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { get OS() { return native.platform; } } }));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: native.launch,
  requestMediaLibraryPermissionsAsync: native.permission,
}));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(private readonly uri: string) {}
    get size() { return native.size(this.uri); }
  },
}));

const photo: ImagePickerAsset = {
  type: "image", uri: "file:///cache/photo.jpg", width: 100, height: 100,
};
const video: ImagePickerAsset = {
  type: "video", uri: "file:///cache/video.mp4", fileName: "original.mov",
  width: 1080, height: 1920, duration: 20_000,
};
const canceled = { canceled: true, assets: null };

beforeEach(() => {
  vi.resetAllMocks();
  native.platform = "android";
  native.size.mockReturnValue(1024);
  native.permission.mockResolvedValue({ granted: false });
});

describe("Android system Photo Picker", () => {
  it("keeps cropping and skips the media-library permission even if access is denied", async () => {
    native.launch.mockResolvedValue({ canceled: false, assets: [photo] });
    const onPermissionDenied = vi.fn();
    const options = { mediaTypes: ["images" as const], allowsEditing: true, quality: 0.8 };
    await expect(pickMedia(options, { onPermissionDenied })).resolves.toEqual({
      canceled: false, assets: [{ ...photo, mimeType: "image/jpeg", fileName: "photo.jpg", fileSize: 1024 }],
    });
    expect(native.launch).toHaveBeenCalledExactlyOnceWith({ ...options, legacy: false });
    expect(native.permission).not.toHaveBeenCalled();
    expect(onPermissionDenied).not.toHaveBeenCalled();
  });

  it.each([5, 10])("returns all %i photos in the order selected", async count => {
    const assets = Array.from({ length: count }, (_, index) => ({
      ...photo, uri: `file:///cache/${index}.jpg`,
    }));
    native.launch.mockResolvedValue({ canceled: false, assets });
    const result = await pickMedia({
      mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: count,
    });
    expect(result.assets?.map(asset => asset.uri)).toEqual(assets.map(asset => asset.uri));
    expect(native.launch).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: count }));
  });

  it.each([false, true])("preserves video metadata with a mixed selection of %s", async mixed => {
    native.launch.mockResolvedValue({ canceled: false, assets: mixed ? [video, photo] : [video] });
    const result = await pickMedia({
      mediaTypes: mixed ? ["images", "videos"] : ["videos"], allowsMultipleSelection: mixed,
    });
    expect(result.assets?.[0]).toEqual({ ...video, mimeType: "video/quicktime", fileSize: 1024 });
  });

  it("treats cancellation and an empty provider response as a no-op", async () => {
    native.launch.mockResolvedValueOnce(canceled).mockResolvedValueOnce({ canceled: false, assets: [] });
    await expect(pickMedia({ mediaTypes: ["videos"] })).resolves.toEqual(canceled);
    await expect(pickMedia({ mediaTypes: ["videos"] })).resolves.toEqual(canceled);
    expect(native.size).not.toHaveBeenCalled();
  });

  it("enforces the capacity if the fallback returns too many assets", async () => {
    native.launch.mockResolvedValue({ canceled: false, assets: [photo, photo] });
    await expect(pickMedia({
      mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 1,
    })).rejects.toThrow("не более 1");
    expect(native.size).not.toHaveBeenCalled();
  });

  it("does not open the picker when no slots remain", async () => {
    await expect(pickMedia({
      mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 0,
    })).resolves.toEqual(canceled);
    expect(native.launch).not.toHaveBeenCalled();
  });

  it("rejects a video delivered to an image-only screen", async () => {
    native.launch.mockResolvedValue({ canceled: false, assets: [video] });
    await expect(pickMedia({ mediaTypes: ["images"] })).rejects.toThrow("тип файла не поддерживается");
  });

  it("reports provider failures with a message safe to show and allows reselection", async () => {
    native.launch.mockRejectedValueOnce(new Error("private provider URI"))
      .mockResolvedValueOnce({ canceled: false, assets: [photo] });
    await expect(pickMedia({ mediaTypes: ["images"] })).rejects.toThrow(MediaPickerError);
    await expect(pickMedia({ mediaTypes: ["images"] })).resolves.toMatchObject({ canceled: false });
  });

  it.each(["content://provider/file", "file:///missing.jpg"])("rejects unavailable %s", async uri => {
    native.size.mockReturnValue(0);
    native.launch.mockResolvedValue({ canceled: false, assets: [{ ...photo, uri }] });
    await expect(pickMedia({ mediaTypes: ["images"] })).rejects.toThrow("выберите файл заново");
  });
});

describe("existing iOS selection behavior", () => {
  beforeEach(() => { native.platform = "ios"; });

  it("preserves screen-specific permission and leaves native results untouched", async () => {
    native.permission.mockResolvedValue({ granted: true });
    const result = { canceled: false, assets: [photo] };
    native.launch.mockResolvedValue(result);
    const options = { mediaTypes: ["images" as const], allowsEditing: true };
    await expect(pickMedia(options, { onPermissionDenied: vi.fn() })).resolves.toBe(result);
    expect(native.permission).toHaveBeenCalledOnce();
    expect(native.launch).toHaveBeenCalledExactlyOnceWith(options);
    expect(native.size).not.toHaveBeenCalled();
  });

  it("calls the existing denial handler and skips selection", async () => {
    const onPermissionDenied = vi.fn();
    await expect(pickMedia({ mediaTypes: ["images"] }, { onPermissionDenied })).resolves.toEqual(canceled);
    expect(onPermissionDenied).toHaveBeenCalledOnce();
    expect(native.launch).not.toHaveBeenCalled();
  });
});
