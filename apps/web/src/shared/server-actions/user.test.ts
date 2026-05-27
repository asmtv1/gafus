import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserIdFromAuthMock,
  getCurrentUserIdMock,
  getPublicProfileMock,
  getUserProfileMock,
  updateUserProfileMock,
} = vi.hoisted(() => ({
  getCurrentUserIdFromAuthMock: vi.fn(),
  getCurrentUserIdMock: vi.fn(),
  getPublicProfileMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  updateUserProfileMock: vi.fn(),
}));

vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: getCurrentUserIdMock,
}));

vi.mock("@gafus/auth/server", () => ({
  getCurrentUserId: getCurrentUserIdFromAuthMock,
}));

vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@gafus/core/services/user", () => ({
  getPublicProfile: getPublicProfileMock,
  getUserProfile: getUserProfileMock,
  updateAvatar: vi.fn(),
  updateUserProfile: updateUserProfileMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
  }),
}));

import { getPublicProfileAction, getUserProfileAction, updateUserProfileAction } from "./user";

describe("web user server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserIdMock.mockResolvedValue("user-1");
    getCurrentUserIdFromAuthMock.mockResolvedValue("user-1");
  });

  it("returns null profile for anonymous users", async () => {
    getCurrentUserIdFromAuthMock.mockResolvedValueOnce(null);

    await expect(getUserProfileAction()).resolves.toBeNull();
    expect(getUserProfileMock).not.toHaveBeenCalled();
  });

  it("loads the current user profile", async () => {
    getUserProfileMock.mockResolvedValueOnce({ id: "user-1" });

    await expect(getUserProfileAction()).resolves.toEqual({ id: "user-1" });
    expect(getUserProfileMock).toHaveBeenCalledWith("user-1");
  });

  it("normalizes social fields before updating profile", async () => {
    updateUserProfileMock.mockResolvedValueOnce({ id: "user-1" });

    await expect(
      updateUserProfileAction({
        telegram: "@dogtrainer",
        website: "example.com",
      }),
    ).resolves.toEqual({ id: "user-1" });

    expect(updateUserProfileMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        telegram: "dogtrainer",
        website: "https://example.com/",
      }),
    );
  });

  it("rejects empty public profile usernames before service call", async () => {
    await expect(getPublicProfileAction(" ")).rejects.toThrow();
    expect(getPublicProfileMock).not.toHaveBeenCalled();
  });
});
