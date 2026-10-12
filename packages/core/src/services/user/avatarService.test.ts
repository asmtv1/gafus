import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
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
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
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
