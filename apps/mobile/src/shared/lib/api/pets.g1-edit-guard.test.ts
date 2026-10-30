import { describe, expect, it, vi, beforeEach } from "vitest";
const transport = vi.hoisted(() => vi.fn());
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({
  apiClient: (...args: unknown[]) => transport(...args),
  apiClientMultipart: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { petsApi } from "./pets";
beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  transport.mockReset().mockResolvedValue({ success: true });
});
describe("existing pet GET/PUT with optional owner guard", () => {
  it("GET exact existing path forwards owner epoch guard", async () => {
    const guard = () => true;
    await petsApi.getById("pet-A", guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-A", {
      requestGuard: guard,
    });
  });
  it("PUT sends only changed partial fields and owner guard", async () => {
    const guard = () => true;
    await petsApi.update("pet-A", { name: "Бимка" }, guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-A", {
      method: "PUT",
      body: { name: "Бимка" },
      requestGuard: guard,
    });
  });
  it("four explicit nulls are sent as nullable measurements, never zero", async () => {
    const guard = () => true;
    const patch = { heightCm: null, neckGirthCm: null, muzzleGirthCm: null, bellyGirthCm: null };
    await petsApi.update("pet-A", patch, guard);
    expect(transport).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-A", {
      method: "PUT",
      body: patch,
      requestGuard: guard,
    });
  });
  it("weightKg number or null blocked before generic PUT", async () => {
    for (const value of [12, null]) {
      const result = await petsApi.update("pet-A", { weightKg: value } as never, () => true);
      expect(result).toMatchObject({
        success: false,
        code: "PET_VALIDATION_ERROR",
        details: { fieldErrors: { weightKg: "UNSUPPORTED_FIELD" } },
      });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("old callers without guard preserve method/path/payload", async () => {
    await petsApi.getById("pet-A");
    await petsApi.update("pet-A", { notes: "" });
    expect(transport.mock.calls[0]).toEqual(["/api/v1/pets/pet-A", {}]);
    expect(transport.mock.calls[1]).toEqual([
      "/api/v1/pets/pet-A",
      { method: "PUT", body: { notes: "" } },
    ]);
  });
});
