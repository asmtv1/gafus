import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
import { iosCompatiblePhotoPicker } from "./iosCompatiblePhotoPicker";

describe("iOS photo-library HEIC compatibility", () => {
  it("asks iOS for a compatible, usually JPEG, representation before encoding", () => {
    expect(iosCompatiblePhotoPicker("ios")).toEqual({
      preferredAssetRepresentationMode: "compatible",
    });
    expect(iosCompatiblePhotoPicker()).toEqual({
      preferredAssetRepresentationMode: "compatible",
    });
  });
  it("does not alter the Android or Web picker", () => {
    expect(iosCompatiblePhotoPicker("android")).toEqual({});
    expect(iosCompatiblePhotoPicker("web")).toEqual({});
  });
});
