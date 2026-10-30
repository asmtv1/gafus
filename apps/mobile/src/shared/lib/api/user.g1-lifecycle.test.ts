import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  multipart: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({
  apiClient: mocks.client,
  apiClientMultipart: mocks.multipart,
}));

import { userApi } from "./user";

describe("AG3-AUTH-011 Mobile profile partial PUT contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({
      success: true,
      data: { userId: "USER_A", city: "Самара", about: "unchanged" },
    });
  });

  it("sends only the edited city; omitted profile fields remain absent", async () => {
    await expect(userApi.updateProfile({ city: "Самара" })).resolves.toMatchObject({
      success: true,
      data: { city: "Самара", about: "unchanged" },
    });
    expect(mocks.client).toHaveBeenCalledWith("/api/v1/user/profile", {
      method: "PUT",
      body: { city: "Самара" },
    });
  });

  it("does not overpost extra account, role, and subscription keys at runtime", async () => {
    const runtimeInput = {
      city: "Самара",
      userId: "USER_B",
      role: "ADMIN",
      subscription: { active: true },
    };
    await userApi.updateProfile(runtimeInput as unknown as { city: string });
    expect(mocks.client).toHaveBeenCalledWith("/api/v1/user/profile", {
      method: "PUT",
      body: { city: "Самара" },
    });
  });

  it("preserves an explicitly cleared text field without clearing other fields", async () => {
    await userApi.updateProfile({ about: "" });
    expect(mocks.client).toHaveBeenCalledWith("/api/v1/user/profile", {
      method: "PUT",
      body: { about: "" },
    });
  });

  it("preserves explicit profile birthDate and city without injecting other keys", async () => {
    await userApi.updateProfile({ birthDate: "1998-01-02", city: "Томск" });
    expect(mocks.client).toHaveBeenCalledWith("/api/v1/user/profile", {
      method: "PUT",
      body: { birthDate: "1998-01-02", city: "Томск" },
    });
  });

  it("preserves a 409 failure and does not mutate native credentials", async () => {
    mocks.client.mockResolvedValue({
      success: false,
      code: "CONFLICT",
      error: "Profile update rejected",
    });
    await expect(userApi.updateProfile({ city: "Самара" })).resolves.toEqual({
      success: false,
      code: "CONFLICT",
      error: "Profile update rejected",
    });
    expect(mocks.multipart).not.toHaveBeenCalled();
  });
});
