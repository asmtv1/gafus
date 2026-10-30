import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ request: vi.fn(), multipart: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.request, apiClientMultipart: m.multipart }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
import { userApi } from "./user";
beforeEach(() => vi.clearAllMocks());
describe("AG3 V47 existing Hono email request adapter", () => {
  it("one guarded POST /auth/email-change-request with only newEmail", async () => {
    const guard = () => true;
    m.request.mockResolvedValue({ success: true });
    expect(await userApi.requestEmailChange("test@example.com", guard)).toEqual({ success: true });
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/email-change-request", {
      method: "POST",
      body: { newEmail: "test@example.com" },
      requestGuard: guard,
    });
  });
  it("includes current password when present without logging or changing the URL", async () => {
    m.request.mockResolvedValue({ success: true });
    await userApi.requestEmailChange("test@example.com", undefined, "CurrentPass123");
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/email-change-request", {
      method: "POST",
      body: { newEmail: "test@example.com", currentPassword: "CurrentPass123" },
    });
  });
  it("no-guard legacy signature still works, no alternate route", async () => {
    m.request.mockResolvedValue({ success: false, code: "EMAIL_CHANGE_UNAVAILABLE" });
    await userApi.requestEmailChange("test@example.com");
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/auth/email-change-request", {
      method: "POST",
      body: { newEmail: "test@example.com" },
    });
  });
});
