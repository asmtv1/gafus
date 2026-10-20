import {describe, expect, it, vi} from "vitest";
const m = vi.hoisted(() => ({present: vi.fn()}));
vi.mock("@gafus/cdn-upload", () => ({
  parsePublicQuestionLocation: (value: string) => value.startsWith("cloudru:questions-public:")
    ? value.slice("cloudru:questions-public:".length) : null,
  presentPublicQuestionPhoto: m.present,
}));
import {presentQuestionPhotoUrl} from "./presentPhoto";

describe("Questions only expose public photos", () => {
  it("presents CDN delivery URL for processed public media", async () => {
    m.present.mockReturnValueOnce("https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/u/id/full.webp");
    await expect(presentQuestionPhotoUrl("cloudru:questions-public:questions/uploads/questions/u/id/full.webp"))
      .resolves.toContain("ebiteskukingusk.begetcdn.cloud");
  });
  it("rejects private legacy markers and signed URLs instead of returning them", async () => {
    for (const value of [
      "cloudru:questions:questions/uploads/questions/u/photo.jpg",
      "https://s3.cloud.ru/gafus-documents-private/questions/uploads/questions/u/photo.jpg",
      "cloudru:questions-pending:questions/incoming/questions/u/photo/source.jpg",
    ]) {
      await expect(presentQuestionPhotoUrl(value)).rejects.toThrow("QUESTION_PUBLIC_INVALID_LOCATION");
    }
    expect(m.present).not.toHaveBeenCalledWith(expect.stringContaining("cloudru:questions:"));
  });
});
