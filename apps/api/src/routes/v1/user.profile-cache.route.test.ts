import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProfile, updateProfile } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("@gafus/core/services/user", async () => {
  const { z } = await import("zod/v3");
  return {
    getUserProfileForApi: getProfile,
    updateUserProfile: updateProfile,
    deleteUserAccountBodySchema: z.object({}),
  };
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { userRoutes } from "./user";
import { getMyProfile, updateMyProfile } from
  "../../../../../apps/web-vite/src/features/profile/profileApi";

const user = { id: "identity-1", username: "tester", role: "USER" } as const;
const profile = {
  id: user.id, username: user.username,
  phone: "+79885554433", email: "private@example.test",
  profile: { fullName: "Тест", city: null, about: null },
};

const api = () => {
  const hono = new Hono();
  hono.use("/api/v1/user/*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  hono.route("/api/v1/user", userRoutes);
  return hono;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Hono own profile and Vite consumer", () => {
  it("prevents caching of the private profile while preserving DTO for Mobile", async () => {
    getProfile.mockResolvedValue(profile);
    const response = await api().request("/api/v1/user/profile");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getProfile).toHaveBeenCalledWith(user.id);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: profile });
  });

  it("Vite's owner-only projection retains the owner's own email but strips phone and tokens", async () => {
    getProfile.mockResolvedValue(profile);
    vi.stubGlobal("fetch", vi.fn((path: string) => {
      expect(path).toBe("/api/v1/user/profile");
      return api().request(path);
    }));
    const result = await getMyProfile();
    expect(result).toEqual({
      id: user.id,
      username: user.username,
      email: "private@example.test",
      profile: { fullName: "Тест", city: null, about: null },
    });
    expect(JSON.stringify(result)).not.toContain("+79885554433");
    expect(result).not.toHaveProperty("phone");
  });

  it("Hono PUT preserves Mobile JSON and enforces no-store for updated profile", async () => {
    updateProfile.mockResolvedValue({ userId: user.id, fullName: "Новое имя" });
    const response = await api().request("/api/v1/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Новое имя", city: "", about: "" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(updateProfile).toHaveBeenCalledWith(user.id, {
      fullName: "Новое имя", city: "", about: "",
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { userId: user.id, fullName: "Новое имя" },
    });
  });

  it("Hono PUT does not synthesize empty social and website updates", async () => {
    updateProfile.mockResolvedValue({ userId: user.id });
    const response = await api().request("/api/v1/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "Казань" }),
    });
    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith(user.id, { city: "Казань" });
  });

  it("Vite PUT uses the existing guarded Hono endpoint without optimistic updates", async () => {
    updateProfile.mockResolvedValue({ userId: user.id, fullName: "Обновлено" });
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) => {
      expect(path).toBe("/api/v1/user/profile");
      expect(options.method).toBe("PUT");
      return api().request(path, {
        method: "PUT", headers: options.headers, body: options.body,
      });
    }));
    await expect(updateMyProfile({
      fullName: "Обновлено", city: "Казань", about: "",
    })).resolves.toBeUndefined();
    expect(updateProfile).toHaveBeenCalledWith(user.id, {
      fullName: "Обновлено", city: "Казань", about: "",
    });
  });

  it("not found returns an error, not a fallback identity", async () => {
    getProfile.mockResolvedValue(null);
    const response = await api().request("/api/v1/user/profile");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
