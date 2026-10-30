import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transport: vi.fn(), trace: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.transport, apiClientMultipart: vi.fn() }));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.trace(...a) }));
import { petsApi } from "./pets";
beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  m.transport.mockReset().mockResolvedValue({ success: true, data: [] });
  m.trace.mockReset();
});
describe("V93 existing GET pets optional actor requestGuard without transport rewrite", () => {
  it("passes verified requestGuard exactly to GET /api/v1/pets", async () => {
    const guard = vi.fn(() => true);
    await expect(petsApi.getAll(guard)).resolves.toEqual({ success: true, data: [] });
    expect(m.transport).toHaveBeenCalledExactlyOnceWith("/api/v1/pets", { requestGuard: guard });
  });
  it("existing consumer getAll() without guard stays GET same endpoint", async () => {
    await petsApi.getAll();
    expect(m.transport).toHaveBeenCalledExactlyOnceWith("/api/v1/pets", {});
  });
  it("preserves 401/429/500 as non-success to strict read projector", async () => {
    for (const code of ["UNAUTHORIZED", "RATE_LIMITED", "INTERNAL_SERVER_ERROR"]) {
      m.transport.mockResolvedValueOnce({ success: false, code, error: "opaque" });
      const response = await petsApi.getAll(() => true);
      expect(response.success).toBe(false);
      expect(response.code).toBe(code);
    }
    expect(m.transport).toHaveBeenCalledTimes(3);
  });
  it("transport rejection logs static error, never backend token string", async () => {
    m.transport.mockRejectedValueOnce(new Error("Bearer PRIVATE SIGNED_URL"));
    await expect(petsApi.getAll(() => true)).rejects.toThrow("PETS_LIST_GET_FAILED");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE SIGNED_URL");
  });
});
