import { describe, expect, it, vi } from "vitest";
const signed = "http://127.0.0.1:9000/gafus-refactor-documents-test/" +
  "documents/uploads/users/u1/pets/p1/11111111-1111-4111-8111-111111111111.jpg" +
  "?X-Amz-Signature=private&X-Amz-Expires=300";
const media = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("@gafus/cdn-upload", () => ({
  isIsolatedAvatarLocation: (value: string) => value.startsWith("isodev-avatar:"),
  presentIsolatedAvatarUrl: media.sign,
}));
import { presentOwnedPetPhoto } from "./present-pet-photo";

describe("owner-only HTTP pet photo location projection", () => {
  it("signs only stored isolated pet location after Core owner read", async () => {
    const marker = "isodev-avatar:documents/uploads/users/u1/pets/p1/" +
      "11111111-1111-4111-8111-111111111111.jpg";
    media.sign.mockResolvedValueOnce(signed);
    const original = {id:"p1",ownerId:"u1",photoUrl:marker};
    const result = await presentOwnedPetPhoto(original);
    expect(result).toEqual({...original,photoUrl:signed});
    expect(original.photoUrl).toBe(marker);
    expect(media.sign).toHaveBeenCalledWith(marker,300);
    expect(JSON.stringify(result)).not.toContain("isodev-avatar:");
  });
  it("retains original HTTPS provider and null photo without signer", async () => {
    media.sign.mockClear();
    const old="https://storage.yandexcloud.net/gafus-media/uploads/users/u1/pets/p1/a.jpg";
    expect(await presentOwnedPetPhoto({photoUrl:old})).toEqual({photoUrl:old});
    expect(await presentOwnedPetPhoto({photoUrl:null})).toEqual({photoUrl:null});
    expect(media.sign).not.toHaveBeenCalled();
  });
  it("fails closed instead of revealing private markers when signer fails", async () => {
    media.sign.mockResolvedValueOnce(null);
    await expect(presentOwnedPetPhoto({photoUrl:"isodev-avatar:private"}))
      .rejects.toThrow("PET_IMAGE_SIGNING_UNAVAILABLE");
  });
});
