/** Live Hono route must send the same owner and explicit SQL adapter to Core. */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ port: { marker: "explicit-vet-rows" }, handle: vi.fn(async (..._args: unknown[]) => Response.json({ success: true })) }));
vi.mock("@gafus/core/services/pets", () => ({ handlePetVetVisitRequest: fake.handle }));
vi.mock("../../modules/pets/composition/vet-visit-rows-instance.js", () => ({ vetVisitRows: fake.port }));
vi.mock("../../modules/pets/composition/vet-visit-read.js", () => ({ getOwnVetVisitDetail: vi.fn() }));
import { petVetVisitRoutes } from "./pet-vet-visits";

describe("Hono veterinary owner-scoped SQL port", () => {
  it("passes the injected reader unchanged for both collection and visit paths", async () => {
    fake.handle.mockClear();
    const app = new Hono();
    app.use("*", async (c, next) => { c.set("user", { id: "owner-A", username: "vet-owner", role: "USER" }); await next(); });
    app.route("/pets", petVetVisitRoutes);
    for (const suffix of ["", "/visit-1"]) {
      const result = await app.request("http://localhost/pets/pet-A/vet-visits" + suffix);
      expect(result.status).toBe(200);
    }
    expect(fake.handle).toHaveBeenCalledTimes(2);
    for (const [request, pet, actor, _parts, _detail, reader] of fake.handle.mock.calls) {
      expect(request).toBeInstanceOf(Request);
      expect(pet).toBe("pet-A");
      expect(actor).toBe("owner-A");
      expect(reader).toBe(fake.port);
    }
  });
});
