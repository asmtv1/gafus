import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../shared/api/client", () => ({
  apiRequest: mock.request,
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
    }
  },
}));
import { ApiError } from "../../shared/api/client";
import { isChat2RoomAccessDenied, refreshChat2RoomToken } from "./chat2Api";

beforeEach(() => mock.request.mockReset());
describe("Chat2 subscription refresh authorization", () => {
  it("provides a valid refreshed channel token", async () => {
    mock.request.mockResolvedValue({ token: "fresh-signed-token" });
    expect(await refreshChat2RoomToken("room1")).toBe("fresh-signed-token");
    expect(mock.request).toHaveBeenCalledWith(
      "/api/v1/chats/room1/realtime",
      { method: "GET", browserAuth: true },
    );
  });
  it.each([401, 403, 404])("recognizes final HTTP %i denial", (status) => {
    expect(isChat2RoomAccessDenied({ status })).toBe(true);
  });
  it("does not treat a transport problem as revoked access", () => {
    expect(isChat2RoomAccessDenied({ status: 503 })).toBe(false);
    expect(isChat2RoomAccessDenied(new TypeError("network"))).toBe(false);
  });
  it("keeps retrying after transient 503 or network errors", async () => {
    const unavailable = new ApiError(503, "transient");
    mock.request.mockRejectedValueOnce(unavailable);
    await expect(refreshChat2RoomToken("room1")).rejects.toBe(unavailable);
    const networkError = new TypeError("network");
    mock.request.mockRejectedValueOnce(networkError);
    await expect(refreshChat2RoomToken("room1")).rejects.toBe(networkError);
  });
  it("rejects invalid room identifiers before any network access", async () => {
    await expect(refreshChat2RoomToken("../foreign")).rejects.toThrow();
    expect(mock.request).not.toHaveBeenCalled();
  });
});
