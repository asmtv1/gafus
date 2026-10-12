import { describe, expect, it } from "vitest";
import {
  privateMediaEnabled,
  privateMediaKindForUpload,
  privateMediaLocation,
  parsePrivateMediaLocation,
} from "../../../../cdn-upload/src/privateUserMedia";

describe("provider-qualified private user media", () => {
  it("never activates Cloud.ru implicitly", () => {
    expect(privateMediaEnabled({})).toBe(false);
    expect(privateMediaEnabled({ CLOUDRU_USER_MEDIA_ENABLED: "true" })).toBe(true);
    expect(() => privateMediaEnabled({ CLOUDRU_USER_MEDIA_ENABLED: "sometimes" })).toThrow(
      "PRIVATE_MEDIA_INVALID_FLAG",
    );
  });
  it("preserves ownership in a provider-specific, immutable storage reference", () => {
    const questions = privateMediaLocation("questions", "questions/u/abc.jpg");
    const documents = privateMediaLocation("documents", "users/u/pets/p/documents/abc.pdf");
    expect(parsePrivateMediaLocation(questions)).toEqual({
      kind: "questions",
      key: "questions/uploads/questions/u/abc.jpg",
    });
    expect(parsePrivateMediaLocation(documents)).toEqual({
      kind: "documents",
      key: "documents/uploads/users/u/pets/p/documents/abc.pdf",
    });
    expect(privateMediaKindForUpload("users/u/avatar/abc.png")).toBeNull();
    expect(privateMediaKindForUpload("trainers/t/videocourses/x/playlist.m3u8")).toBeNull();
    expect(() => privateMediaLocation("questions", "users/u/pets/p/documents/abc.pdf")).toThrow();
    expect(
      parsePrivateMediaLocation(
        "https://storage.yandexcloud.net/gafus-media/uploads/questions/u/abc.jpg",
      ),
    ).toBeNull();
  });
  it.each([
    "cloudru:questions:questions/uploads/questions/u/../a.jpg",
    "cloudru:questions:documents/uploads/users/u/pets/p/documents/a.pdf",
    "cloudru:documents:questions/uploads/questions/u/a.jpg",
    "cloudru:documents:documents/uploads/users/u/pets/p/documents/a.pdf?secret=1",
    "cloudru:questions:https://evil.example/file.jpg",
  ])("rejects malformed locations: %s", (value) => {
    expect(() => parsePrivateMediaLocation(value)).toThrow("PRIVATE_MEDIA_INVALID_LOCATION");
  });
});
