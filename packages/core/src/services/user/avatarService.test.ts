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
}));

vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@gafus/cdn-upload", () => ({
  uploadFileToCDN: mocks.upload,
  deleteFileFromCDN: mocks.remove,
  getRelativePathFromCDNUrl: () => "old/avatar.png",
  getUserAvatarPath: () => "new/avatar.png",
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: mocks.logInfo, error: mocks.logError }),
}));
vi.mock("../cynologistChat/authorRole", () => ({
  getChatDisplayRole: async () => null,
}));

import { updateAvatar } from "./profileService";

describe("avatar updates never perform CDN I/O under database locks", () => {
  const image = { name: "portrait.png" } as File;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
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
    await expect(updateAvatar("u1", image)).resolves.toBe(signed);
    expect(JSON.stringify(mocks.logInfo.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(canary);
  });

  it("keeps DB failure and compensation while not logging raw cleanup CDN exception", async () => {
    const canary = "SYNTHETIC_PRIVATE_CDN_COMPENSATION_FAILURE";
    mocks.upsert.mockRejectedValueOnce(new Error("SYNTHETIC_DB_WRITE_FAILURE"));
    mocks.remove.mockRejectedValueOnce(new Error(canary));
    await expect(updateAvatar("u1", image)).rejects.toThrow("SYNTHETIC_DB_WRITE_FAILURE");
    expect(mocks.remove).toHaveBeenCalledWith("new/avatar.png");
    const logged = mocks.logError.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain(canary);
  });

  it("old-avatar CDN delete failure stays best-effort and never logs secret", async () => {
    const canary = "SYNTHETIC_PRIVATE_OLD_AVATAR_CDN_FAILURE";
    mocks.remove.mockRejectedValueOnce(new Error(canary));
    await expect(updateAvatar("u1", image)).resolves.toContain("new/avatar.png");
    const logged = mocks.logError.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(logged).not.toContain(canary);
  });

  it("uploads before DB lock and deletes previous image after DB commit", async () => {
    const url = await updateAvatar("u1", image);
    expect(url).toBe("https://cdn.example/new/avatar.png");
    expect(mocks.events).toEqual(["upload", "lock", "commit", "remove"]);
    expect(mocks.remove).toHaveBeenCalledWith("old/avatar.png");
  });

  it("cleans up a newly uploaded image when database write fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("DATABASE_FAILURE"));
    await expect(updateAvatar("u1", image)).rejects.toThrow("DATABASE_FAILURE");
    expect(mocks.remove).toHaveBeenCalledWith("new/avatar.png");
  });

  it("does not fail committed update if obsolete CDN object cannot be removed", async () => {
    mocks.remove.mockRejectedValue(new Error("CDN_DOWN"));
    await expect(updateAvatar("u1", image)).resolves.toContain("new/avatar.png");
  });

  it("rejects missing user and compensates the uploaded object", async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(updateAvatar("missing", image)).rejects.toThrow("Пользователь не найден");
    expect(mocks.remove).toHaveBeenCalledWith("new/avatar.png");
  });
});
