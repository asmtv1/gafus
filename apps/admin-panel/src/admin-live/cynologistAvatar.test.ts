import { describe, expect, it } from "vitest";
import { cynologistAvatarSrc } from "./Consultations";

describe("admin consultation trainer avatars", () => {
  it("uses the already-resolved CDN URL without changing it", () => {
    expect(cynologistAvatarSrc("https://cdn.example.test/trainer.jpg")).toBe(
      "https://cdn.example.test/trainer.jpg",
    );
  });
  it("supports old relative media keys via the original shared CDN helper", () => {
    expect(cynologistAvatarSrc("/profiles/avatar.jpg")).toBe(
      "https://storage.yandexcloud.net/gafus-media/profiles/avatar.jpg",
    );
  });
  it("renders initials for empty or invalid avatar inputs", () => {
    for (const avatar of [
      null,
      "",
      "  ",
      "javascript:alert(1)",
      "//evil.example/img",
      "https://u:p@example.test/a.png",
      "bad\\\\avatar",
    ])
      expect(cynologistAvatarSrc(avatar)).toBeNull();
  });
});
