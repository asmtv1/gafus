import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ request: vi.fn(), multipart: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.request, apiClientMultipart: m.multipart }));
import { petVetVisitsApi } from "./pet-vet-visits";
beforeEach(() => vi.clearAllMocks());
describe("AG3 V44 existing Hono/Core mutation endpoint", () => {
  it("one guarded POST exactly /pets/:petId/vet-visits, no synthetic receipt/header", async () => {
    const guard = () => true;
    const body = { visitedOn: "2026-10-18", specialty: "Терапевт" };
    m.request.mockResolvedValue({ success: true, data: { id: "visit1" } });
    expect(await petVetVisitsApi.createResponse("pet1", body, guard)).toEqual({
      success: true,
      data: { id: "visit1" },
    });
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet1/vet-visits", {
      method: "POST",
      body,
      requestGuard: guard,
    });
    expect(m.multipart).not.toHaveBeenCalled();
  });
  it("V45 full existing PUT path and actor guard, no invented PATCH/replay", async () => {
    const guard = () => true;
    const full = {
      visitedOn: "2026-10-18",
      specialty: "Врач",
      doctorName: "Имя",
      clinic: "Клиника",
      diagnosis: "Диагноз",
      conclusion: "Вывод",
      notes: "Заметки",
    };
    m.request.mockResolvedValue({ success: true, data: { id: "visit1" } });
    await petVetVisitsApi.editResponse("pet1", "visit1", full, guard);
    expect(m.request).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet1/vet-visits/visit1", {
      method: "PUT",
      body: full,
      requestGuard: guard,
    });
    expect(m.multipart).not.toHaveBeenCalled();
  });
  it("separate existing GET detail preserved; no 2nd POST on readback", async () => {
    const guard = () => true;
    m.request.mockResolvedValue({ success: true, data: { id: "visit1" } });
    await petVetVisitsApi.createResponse(
      "pet1",
      { visitedOn: "2026-10-18", specialty: "Vet" },
      guard,
    );
    await petVetVisitsApi.detailResponse("pet1", "visit1", guard);
    expect(
      m.request.mock.calls.map(
        (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method ?? "GET",
      ),
    ).toEqual(["POST", "GET"]);
    expect(m.request.mock.calls[1][0]).toBe("/api/v1/pets/pet1/vet-visits/visit1");
  });
});
