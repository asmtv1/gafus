/** Source contract: current Vite client and authenticated Hono Vet visits, not deleted Next. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viteClient = readFileSync(new URL(
  "../../../../../apps/web-vite/src/features/pets/PetVetVisitsConnected.tsx",
  import.meta.url,
), "utf8");
const viteTransport = readFileSync(new URL(
  "../../../../../apps/web-vite/src/features/pets/vetVisitsHonoReadConsumer.ts",
  import.meta.url,
), "utf8");
const hono = readFileSync(new URL("./pet-vet-visits.ts", import.meta.url), "utf8");
const shared = readFileSync(new URL(
  "../../../../../packages/core/src/services/pets/petVetVisitHttp.ts",
  import.meta.url,
), "utf8");

describe("Current Vite/Hono Vet visit source transport contract", () => {
  it("V01 Vite GET uses browser auth and pet-scoped Hono route", () => {
    expect(viteClient).toContain("apiRequest<unknown>(vetReadPath(petId)");
    expect(viteClient).toContain("browserAuth: true, expectedStatus: 200");
    expect(viteClient).toContain("projectHonoVetList");
    expect(viteClient).toContain("projectHonoVetDetail");
    expect(viteTransport).toContain('VET_HONO_LIST="/api/v1/pets/:petId/vet-visits"');
    expect(viteTransport).toContain('VET_HONO_DETAIL="/api/v1/pets/:petId/vet-visits/:visitId"');
  });
  it("V02 Hono passes authenticated actor ID, never a client-supplied owner", () => {
    expect(hono).toContain('c.get("user").id');
    expect(hono).toContain("handlePetVetVisitRequest");
    expect(hono).toContain('petVetVisitRoutes.all("/:petId/vet-visits"');
    expect(hono).toContain('petVetVisitRoutes.all("/:petId/vet-visits/*"');
  });
  it("V03 shared Core handles list/detail GET and private no-store", () => {
    expect(shared).toContain('!parts.length && method === "GET"');
    expect(shared).toContain("listPetVetVisits(petId, ownerId)");
    expect(shared).toContain('parts.length === 1 && method === "GET"');
    expect(shared).toContain("getOwnVetVisitDetail(ownerId, petId, visitId!)");
    expect(shared).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });
});
