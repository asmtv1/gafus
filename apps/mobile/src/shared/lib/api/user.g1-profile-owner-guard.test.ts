import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ wire: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.wire, apiClientMultipart: vi.fn() }));
import { userApi } from "./user";
beforeEach(() => {
  m.wire.mockReset().mockResolvedValue({ success: true, data: { userId: "A" } });
});
describe("Native profile GET/PUT existing API with optional principal epoch guard", () => {
  it("guarded GET uses only existing /api/v1/user/profile path", async () => {
    const guard = () => true;
    await userApi.getProfile(guard);
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/user/profile", { requestGuard: guard });
  });
  it("partial PUT preserves only changed field, forwards same verified guard", async () => {
    const guard = () => true;
    await userApi.updateProfile({ city: "Казань" }, guard);
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/user/profile", {
      method: "PUT",
      body: { city: "Казань" },
      requestGuard: guard,
    });
  });
  it("old callers with no actor guard preserve existing call shape", async () => {
    await userApi.getProfile();
    await userApi.updateProfile({ about: "" });
    expect(m.wire.mock.calls[0]).toEqual(["/api/v1/user/profile", {}]);
    expect(m.wire.mock.calls[1]).toEqual([
      "/api/v1/user/profile",
      { method: "PUT", body: { about: "" } },
    ]);
  });
});
