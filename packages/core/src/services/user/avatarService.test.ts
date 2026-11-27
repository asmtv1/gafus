import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  events: [] as string[],
  priorKey: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@gafus/cdn-upload", () => ({
  uploadFileToCDN: mocks.upload,
  deleteFileFromCDN: mocks.remove,
  getRelativePathFromCDNUrl: (...args: unknown[]) => mocks.priorKey(...args),
  getUserAvatarPath: () => "users/u1/avatar/new.png",
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: mocks.logInfo, error: mocks.logError }),
}));
vi.mock("./chatDisplayRole", () => ({
  getChatDisplayRole: async () => null,
}));

import { updateAvatar } from "./profileService";
// Bind unchanged identity-write SQL projections against the existing synthetic
// Prisma test rows; production composition runs before Hono routes.

import * as profileSql from "@gafus/identity-write-server/profile-rows";
const fixtureProfileRowsPort = profileSql;


describe("avatar updates never perform CDN I/O under database locks", () => {
  const image = { name: "portrait.png" } as File;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.priorKey.mockReturnValue("users/u1/avatar/old.png");
    mocks.upload.mockImplementation(async () => {
      mocks.events.push("upload");
      return "https://cdn.example/new/avatar.png";
    });
    mocks.lock.mockImplementation(async () => {
      mocks.events.push("lock");
      return [{ id: "u1" }];
    });
    mocks.find.mockResolvedValue({ avatarUrl: "https://cdn.example/old/avatar.png" });
    mocks.upsert.mockImplementation(async () => {
      mocks.events.push("commit");
      return {};
    });
    mocks.remove.mockImplementation(async () => {
      mocks.events.push("remove");
    });
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
      $queryRaw: mocks.lock,
      userProfile: { findUnique: mocks.find, upsert: mocks.upsert },
    }));
  });

  it("does not log newly issued avatar URL with private CDN credentials", async () => {
    const canary = "SYNTHETIC_AVATAR_PRIVATE_CDN_TOKEN_123";
    const signed = `https://cdn.example/new/avatar.png?token=${canary}`;
    mocks.upload.mockResolvedValueOnce(signed);
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).resolves.toBe(signed);
    expect(JSON.stringify(mocks.logInfo.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(canary);
  });

  it("keeps DB failure and compensation while not logging raw cleanup CDN exception", async () => {
    const canary = "SYNTHETIC_PRIVATE_CDN_COMPENSATION_FAILURE";
    mocks.upsert.mockRejectedValueOnce(new Error("SYNTHETIC_DB_WRITE_FAILURE"));
    mocks.remove.mockRejectedValueOnce(new Error(canary));
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).rejects.toThrow("SYNTHETIC_DB_WRITE_FAILURE");
    expect(mocks.remove).toHaveBeenCalledWith("users/u1/avatar/new.png");
    const logged = mocks.logError.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain(canary);
  });

  it("old-avatar CDN delete failure stays best-effort and never logs secret", async () => {
    const canary = "SYNTHETIC_PRIVATE_OLD_AVATAR_CDN_FAILURE";
    mocks.remove.mockRejectedValueOnce(new Error(canary));
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).resolves.toContain("new/avatar.png");
    const logged = mocks.logError.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain(canary);
  });

  it("uploads before DB lock and deletes previous image after DB commit", async () => {
    const url = await updateAvatar("u1", image, fixtureProfileRowsPort);
    expect(url).toBe("https://cdn.example/new/avatar.png");
    expect(mocks.events).toEqual(["upload", "lock", "commit", "remove"]);
    expect(mocks.remove).toHaveBeenCalledWith("users/u1/avatar/old.png");
  });

  it("does not delete a forged old-avatar key belonging to another owner", async () => {
    mocks.priorKey.mockReturnValue("users/foreign/avatar/private.png");
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).resolves.toContain("new/avatar.png");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not delete an untrusted external URL, traversal, or another media category", async () => {
    for (const key of [
      "https://example.invalid/a.jpg", "users/u1/pets/other.png",
      "users/u1/avatar/../pets/other.png", "users/u1/avatar/photo?token=x",
    ]) {
      mocks.priorKey.mockReturnValue(key);
      await updateAvatar("u1", image, fixtureProfileRowsPort);
    }
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes only the isolated local S3 avatar location after a successful commit", async () => {
    const ownKey = "isodev-avatar:documents/uploads/users/u1/avatar/old.png";
    mocks.priorKey.mockReturnValue(ownKey);
    await updateAvatar("u1", image, fixtureProfileRowsPort);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith(ownKey);
  });

  it("cleans up a newly uploaded image when database write fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("DATABASE_FAILURE"));
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).rejects.toThrow("DATABASE_FAILURE");
    expect(mocks.remove).toHaveBeenCalledWith("users/u1/avatar/new.png");
  });

  it("does not fail committed update if obsolete CDN object cannot be removed", async () => {
    mocks.remove.mockRejectedValue(new Error("CDN_DOWN"));
    await expect(updateAvatar("u1", image, fixtureProfileRowsPort)).resolves.toContain("new/avatar.png");
  });

  it("rejects missing user and compensates the uploaded object", async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(updateAvatar("missing", image, fixtureProfileRowsPort)).rejects.toThrow("Пользователь не найден");
    expect(mocks.remove).toHaveBeenCalledWith("users/u1/avatar/new.png");
  });
});
