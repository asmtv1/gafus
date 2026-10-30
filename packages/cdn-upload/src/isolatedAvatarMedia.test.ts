import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isIsolatedAvatarLocation, isIsolatedAvatarPath,
  isolatedAvatarLocationFromOwnPath, uploadIsolatedAvatar,
  presentIsolatedAvatarUrl, deleteIsolatedAvatarLocation,
} from "./isolatedAvatarMedia";

const good = "users/owner_uuid_123/avatar/11111111-1111-4111-8111-111111111111.png";
const location = "isodev-avatar:documents/uploads/" + good;
afterEach(() => vi.unstubAllEnvs());

describe("default-off exact isolated avatar and production denial", () => {
  it("only allows original user/avatar/UUID key with fixed extension", () => {
    expect(isIsolatedAvatarPath(good)).toBe(true);
    expect(isolatedAvatarLocationFromOwnPath(good)).toBe(location);
    expect(isIsolatedAvatarLocation(location)).toBe(true);
    for (const path of [
      "users/owner/avatar/not-a-uuid.png", "users/../avatar/11111111-1111-4111-8111-111111111111.png",
      "users/owner/avatar/11111111-1111-4111-8111-111111111111.svg",
      "trainers/owner/avatar/11111111-1111-4111-8111-111111111111.png",
      "users/owner/avatar/11111111-1111-4111-8111-111111111111.png?x=1",
    ]) {
      expect(isIsolatedAvatarPath(path)).toBe(false);
      expect(() => isolatedAvatarLocationFromOwnPath(path)).toThrow("ISOLATED_AVATAR_INVALID_KEY");
    }
  });
  it("accepts only the owner-scoped original pet photo key in isolated documents", () => {
    const pet = "users/owner_uuid_123/pets/pet-123/11111111-1111-4111-8111-111111111111.webp";
    const location = "isodev-avatar:documents/uploads/" + pet;
    expect(isIsolatedAvatarPath(pet)).toBe(true);
    expect(isolatedAvatarLocationFromOwnPath(pet)).toBe(location);
    expect(isIsolatedAvatarLocation(location)).toBe(true);
    for (const invalid of [
      "users/owner_uuid_123/pets/../11111111-1111-4111-8111-111111111111.webp",
      "users/owner_uuid_123/pets/pet-123/documents/11111111-1111-4111-8111-111111111111.webp",
      "users/owner_uuid_123/pets/pet-123/11111111-1111-4111-8111-111111111111.svg",
      "users/owner_uuid_123/pets/pet-123/11111111-1111-4111-8111-111111111111.webp?x=1",
      "users/owner_uuid_123/pets/pet-123/bad.webp",
    ]) {
      expect(isIsolatedAvatarPath(invalid)).toBe(false);
      expect(() => isolatedAvatarLocationFromOwnPath(invalid)).toThrow("ISOLATED_AVATAR_INVALID_KEY");
    }
    const malformed = location + "/../../another";
    return expect(presentIsolatedAvatarUrl(malformed)).rejects.toThrow("ISOLATED_AVATAR_INVALID_LOCATION");
  });
  it("does not select an alternate storage provider without explicit dev-only gate", async () => {
    vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3", undefined);
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", undefined);
    const file = new File([new Uint8Array([1,2,3])], "avatar.png", {type:"image/png"});
    await expect(uploadIsolatedAvatar(file, good)).rejects.toThrow("ISOLATED_AVATAR_PROVIDER_DENIED");
    await expect(presentIsolatedAvatarUrl(location)).rejects.toThrow("ISOLATED_AVATAR_PROVIDER_DENIED");
    await expect(deleteIsolatedAvatarLocation(location)).rejects.toThrow("ISOLATED_AVATAR_PROVIDER_DENIED");
  });
  it("rejects invalid production flag, wrong MIME, zero bytes and forged stored key before S3", async () => {
    vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3", "false");
    const goodFile = new File([new Uint8Array([1])], "avatar.png", {type:"image/png"});
    await expect(uploadIsolatedAvatar(goodFile, good)).rejects.toThrow("ISOLATED_S3_INVALID_FLAG");
    const badMime = new File([new Uint8Array([1])], "avatar.png", {type:"image/svg+xml"});
    await expect(uploadIsolatedAvatar(badMime, good)).rejects.toThrow("ISOLATED_AVATAR_INVALID_MIME");
    const empty = new File([],"avatar.png",{type:"image/png"});
    await expect(uploadIsolatedAvatar(empty, good)).rejects.toThrow("ISOLATED_AVATAR_INVALID_SIZE");
    await expect(presentIsolatedAvatarUrl(location+"/../../other")).rejects.toThrow("ISOLATED_AVATAR_INVALID_LOCATION");
    await expect(deleteIsolatedAvatarLocation("isodev-avatar:users/foreign/avatar/11111111-1111-4111-8111-111111111111.png"))
      .rejects.toThrow("ISOLATED_AVATAR_INVALID_LOCATION");
  });
  it("keeps pre-existing HTTPS avatar URLs unchanged by development signer", async () => {
    const original="https://storage.yandexcloud.net/gafus-media/uploads/users/owner/avatar/name.jpg";
    await expect(presentIsolatedAvatarUrl(original)).resolves.toBe(original);
    await expect(presentIsolatedAvatarUrl(null)).resolves.toBeNull();
  });
});
