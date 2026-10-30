import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ wire: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.wire, apiClientMultipart: vi.fn() }));
import { userApi } from "./user";
beforeEach(() => {
  m.wire.mockReset().mockResolvedValue({ success: true, data: { username: "alice" } });
});
describe("public Mobile profile GET remains guest-compatible and optionally guarded", () => {
  it("guest call without guard preserves existing GET URL", async () => {
    await userApi.getPublicProfile("alice");
    expect(m.wire).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/user/profile/public?username=alice",
      {},
    );
  });
  it("owner+epoch guard is forwarded for authorization and 401 refresh", async () => {
    const guard = () => true;
    await userApi.getPublicProfile("alice", guard);
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/user/profile/public?username=alice", {
      requestGuard: guard,
    });
  });
  it("username path escapes URL separators; client cannot append arbitrary query fields", async () => {
    await userApi.getPublicProfile("A/B?x=y");
    expect(m.wire.mock.calls[0][0]).toBe("/api/v1/user/profile/public?username=A%2FB%3Fx%3Dy");
  });
});
