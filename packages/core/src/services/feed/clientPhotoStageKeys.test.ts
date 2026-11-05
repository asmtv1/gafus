import { describe, expect, it } from "vitest";
import { feedClientPhotoStageKeys } from "./clientPhotoStageKeys";

describe("Moments client photo staging is bound to incoming upload ID", () => {
  it("derives three stage keys from a valid owner/post/upload source", () => {
    const base = "posts/user123/post123/incoming/upload123/";
    expect(feedClientPhotoStageKeys(base + "source.webp")).toEqual({
      source: base + "source.webp", small: base + "s.webp", medium: base + "m.webp",
    });
  });
  it.each([
    "posts/user/post/incoming/source.webp", // missing upload ID
    "posts/user/post/incoming/upload/source.jpg", // old/JPEG path
    "posts/user/post/incoming/../../source.webp",
    "posts/user/post/incoming/upload/source.webp?query=1",
    "post/user/post/incoming/upload/source.webp",
  ])("refuses unrelated or legacy source key %s", input => {
    expect(() => feedClientPhotoStageKeys(input)).toThrow("FEED_CLIENT_PHOTO_SOURCE_KEY_INVALID");
  });
});
