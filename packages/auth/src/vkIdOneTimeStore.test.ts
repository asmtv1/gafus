import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    vkLoginGrant: {
      create: (...args: unknown[]) => mockCreate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
  VkLoginGrantPurpose: { LOGIN: "LOGIN", REGISTRATION_CONSENT: "REGISTRATION_CONSENT" },
}));

import { completeVkIdOneTimeConsent, consumeVkIdOneTimeUser, getVkIdUserFromToken, storeVkIdOneTimeUser } from "./vkIdOneTimeStore";

describe("VK login grant store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a digest only for an already completed user and LOGIN purpose", async () => {
    mockUserFindUnique.mockResolvedValue({ registrationPending: false });
    await storeVkIdOneTimeUser("raw-browser-token", { userId: "user-1", username: "vk_user", role: "USER" });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: "user-1", purpose: "LOGIN", tokenHash: expect.not.stringContaining("raw-browser-token"),
    }) }));
  });

  it("rejects a pending user and cannot turn a legacy consent token into login", async () => {
    mockUserFindUnique.mockResolvedValue({ registrationPending: true });
    await expect(storeVkIdOneTimeUser("t", { userId: "user-1", username: "vk_user", role: "USER" })).rejects.toThrow(/not completed/);
    await expect(storeVkIdOneTimeUser("t", { userId: "user-1", username: "vk_user", role: "USER" }, true)).rejects.toThrow(/context required/);
    await expect(getVkIdUserFromToken("legacy")).resolves.toBeNull();
    await expect(completeVkIdOneTimeConsent("legacy")).resolves.toBe("invalid");
  });

  it("consumes LOGIN once and atomically guards the pending flag", async () => {
    mockFindFirst.mockResolvedValue({ id: "grant-1", user: { id: "user-1", username: "vk_user", role: "USER", registrationPending: false } });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(consumeVkIdOneTimeUser("token")).resolves.toEqual({ userId: "user-1", username: "vk_user", role: "USER" });
    await expect(consumeVkIdOneTimeUser("token")).resolves.toBeNull();
    expect(mockUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user: { registrationPending: false } }) }));
  });

  it("does not consume a grant if its user is still pending", async () => {
    mockFindFirst.mockResolvedValue({ id: "grant-1", user: { id: "user-1", username: "vk_user", role: "USER", registrationPending: true } });
    await expect(consumeVkIdOneTimeUser("token")).resolves.toBeNull();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
