import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn(), trace: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({
  apiClient: (...v: unknown[]) => m.api(...v),
  apiClientMultipart: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...v: unknown[]) => m.trace(...v) }));
import { petsApi } from "./pets";
beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  m.api.mockReset().mockResolvedValue({ success: true, data: { id: "X" } });
  m.trace.mockReset();
});
describe("AG3 V96 existing individual pet GET guarded adapter privacy", () => {
  it("guard passes to unchanged GET /api/v1/pets/:id with encoded caller owned ID", async () => {
    const guard = vi.fn(() => true);
    await petsApi.getById("pet-X", guard);
    expect(m.api).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-X", { requestGuard: guard });
  });
  it("old no-guard callers preserve GET path and options", async () => {
    await petsApi.getById("pet-X");
    expect(m.api).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-X", {});
  });
  it("404/500 envelope stays non-success for precise read-only UI handling", async () => {
    for (const response of [
      { success: false, error: "Питомец не найден" },
      { success: false, code: "INTERNAL_SERVER_ERROR", error: "opaque" },
    ]) {
      m.api.mockResolvedValueOnce(response);
      expect(await petsApi.getById("pet-X", () => true)).toEqual(response);
    }
  });
  it("thrown provider/signed URL text is not forwarded to tracer or UI error", async () => {
    const secret = "Bearer TOPSECRET https://storage.example/?X-Amz-Signature=private";
    m.api.mockRejectedValueOnce(new Error(secret));
    await expect(petsApi.getById("pet-X", () => true)).rejects.toThrow("PET_DETAIL_GET_FAILED");
    expect(m.trace).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("TOPSECRET");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("X-Amz-Signature");
  });
});
