/** Actual AG1 production pets READ composition import MUST NOT evaluate write providers. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@gafus/cdn-upload", () => {
  throw new Error("CLOSED_CDN_MODULE_EVALUATED_DURING_PETS_READ_IMPORT");
});
vi.mock("../../../../../../packages/core/src/services/pets/petVetVisitService", () => {
  throw new Error("CLOSED_VET_MODULE_EVALUATED_DURING_PETS_READ_IMPORT");
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

describe("original Hono-bound pets READ production composition module closure", () => {
  it("imports actual readPetsApplication without evaluating forbidden write/media/Vet modules", async () => {
    const module = await import("./read-pets");
    expect(module.readPetsApplication).toBeDefined();
    expect(typeof module.readPetsApplication.list).toBe("function");
    expect(typeof module.readPetsApplication.detail).toBe("function");
  });
});
