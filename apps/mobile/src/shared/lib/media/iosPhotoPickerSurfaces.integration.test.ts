import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("iOS photo pickers avoid handing raw HEIC to device optimization", () => {
  it("Questions, Gallery, Moments and Chat2 all use compatible Photos representation", () => {
    for (const path of [
      "../../../features/questions/ui.tsx",
      "../../../features/gallery/uploads.tsx",
      "../../../features/feed/uploads.ts",
      "../../../features/chat2/Chat2RoomScreen.tsx",
      "../../../features/chat2/Chat2ListScreen.tsx",
      "../../../features/chat2/Chat2SettingsSheet.tsx",
    ]) {
      expect(read(path)).toContain("iosCompatiblePhotoPicker()");
    }
  });
  it("video-only Chat2 keeps original selection representation", () => {
    const chat = read("../../../features/chat2/Chat2RoomScreen.tsx");
    expect(chat).toContain('...(kind === "image" ? iosCompatiblePhotoPicker() : {})');
  });
  it("iOS Questions exposes sanitized lifecycle diagnostics instead of a generic on-device error", () => {
    const questions = read("../../../features/questions/ui.tsx");
    const api = read("../api/questions.ts");
    expect(questions).toContain('new PhotoUploadStageError("jpeg", cause)');
    expect(questions).toContain('logPhotoUploadFailure("questions", cause)');
    expect(api).toContain('new PhotoUploadStageError("webp", error)');
    expect(api).toContain('stage = "transfer";');
    expect(api).toContain('stage = "confirm";');
    expect(api).toContain("Promise.allSettled");
  });
});
