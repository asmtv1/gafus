import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ request: vi.fn(), multipart: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.request, apiClientMultipart: m.multipart }));
import { petVetVisitsApi } from "./pet-vet-visits";
beforeEach(() => vi.clearAllMocks());
describe("AG3 V43 actual Hono GET list and detail existing API", () => {
  it("owner-guarded list uses exact encoded pet route and no GET body", async () => {
    const guard = () => true;
    m.request.mockResolvedValue({ success: true, data: [] });
    expect(await petVetVisitsApi.listResponse("pet-A", guard)).toEqual({ success: true, data: [] });
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-A/vet-visits", {
      requestGuard: guard,
    });
  });
  it("detail uses exactly one owner-guarded GET /:visitId, no forged owner/query", async () => {
    const guard = () => false;
    m.request.mockResolvedValue({ success: false, code: "VET_VISIT_NOT_FOUND" });
    expect(await petVetVisitsApi.detailResponse("pet-A", "visit-B", guard)).toEqual({
      success: false,
      code: "VET_VISIT_NOT_FOUND",
    });
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-A/vet-visits/visit-B", {
      requestGuard: guard,
    });
  });
  it("old list and write method compatibility is not silently replaced by a new endpoint", async () => {
    m.request.mockResolvedValue({ success: true, data: [] });
    expect(await petVetVisitsApi.list("pet-A")).toEqual([]);
    expect(m.request.mock.calls[0][0]).toBe("/api/v1/pets/pet-A/vet-visits");
    expect(m.multipart).not.toHaveBeenCalled();
  });
});
