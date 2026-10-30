/** G1 actual Core vet-visit HTTP dispatcher, isolated from Prisma/Cloud. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  list: vi.fn(), save: vi.fn(), deleteVisit: vi.fn(),
  addAttachment: vi.fn(), deleteAttachment: vi.fn(), media: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
vi.mock("./petVetVisitService", () => ({
  VetVisitError: class extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  listPetVetVisits: m.list,
  savePetVetVisit: m.save,
  deletePetVetVisit: m.deleteVisit,
  addPetVetAttachment: m.addAttachment,
  deletePetVetAttachment: m.deleteAttachment,
  getPetVetMedia: m.media,
}));
import { handlePetVetVisitRequest } from "./petVetVisitHttp";
function call(method = "GET", parts: string[] = [], body?: string, query = "") {
  return handlePetVetVisitRequest(new Request("http://local.test/vet" + query, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body } : {}),
  }), "pet-A", "actor-A", parts);
}
beforeEach(() => {
  vi.clearAllMocks();
  m.list.mockResolvedValue([{ id: "visit-A" }]);
  m.save.mockResolvedValue({ id: "visit-A" });
  m.media.mockResolvedValue({ url: "https://signed.invalid/preview", variant: "preview" });
  m.deleteVisit.mockResolvedValue(undefined);
  m.deleteAttachment.mockResolvedValue(undefined);
});
describe("G1 Core pet vet transport: method/owner/body bounds", () => {
  it("GET list uses petId and actor owner with private no-store", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: [{ id: "visit-A" }] });
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(m.list).toHaveBeenCalledWith("pet-A", "actor-A");
  });
  it("POST passes raw JSON to real Core service with authenticated owner", async () => {
    const input = { visitedOn: "2026-10-15", specialty: "Терапевт", ownerId: "forged" };
    const r = await call("POST", [], JSON.stringify(input));
    expect(r.status).toBe(201);
    expect(m.save).toHaveBeenCalledWith("pet-A", "actor-A", input, undefined);
  });
  it("PUT existing visit forwards visit id and owner; no resource mix-up", async () => {
    const r = await call("PUT", ["visit-B"], '{"clinic":"test"}');
    expect(r.status).toBe(200);
    expect(m.save).toHaveBeenCalledWith("pet-A", "actor-A", { clinic: "test" }, "visit-B");
  });
  it("DELETE visit does not accept different owner from body", async () => {
    const r = await call("DELETE", ["visit-B"]);
    expect(r.status).toBe(200);
    expect(m.deleteVisit).toHaveBeenCalledWith("pet-A", "actor-A", "visit-B");
    expect(await r.json()).toEqual({ success: true });
  });
  it("DELETE attachment scopes pet, visit, attachment and owner", async () => {
    const r = await call("DELETE", ["visit-B", "attachments", "attachment-C"]);
    expect(r.status).toBe(200);
    expect(m.deleteAttachment).toHaveBeenCalledWith("pet-A", "actor-A", "visit-B", "attachment-C");
  });
  it("GET media returns signed URL only from Core-scoped read", async () => {
    const r = await call("GET", ["visit-B", "attachments", "att-C", "media"]);
    expect(r.status).toBe(200);
    expect(m.media).toHaveBeenCalledWith("pet-A", "actor-A", "visit-B", "att-C", "preview");
    expect(await r.json()).toMatchObject({ success: true, data: { variant: "preview" } });
  });
  it("GET media redirects with private no-store and unchanged Core URL", async () => {
    const r = await call("GET", ["visit-B", "attachments", "att-C", "media"], undefined,
      "?variant=full&redirect=1");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://signed.invalid/preview");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(m.media).toHaveBeenCalledWith("pet-A", "actor-A", "visit-B", "att-C", "full");
  });
  it("unsupported action path or method returns 404 before service calls", async () => {
    const r = await call("PATCH", ["visit-B"]);
    expect(r.status).toBe(404);
    const unknown = await call("GET", ["visit-B", "unknown"]);
    expect(unknown.status).toBe(404);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });
  it("malformed JSON is 400 and cannot mutate visit", async () => {
    const r = await call("POST", [], "{" );
    expect(r.status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("body over 150000 bytes is 413 before Core", async () => {
    const r = await call("POST", [], "x".repeat(150001));
    expect(r.status).toBe(413);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("Core failure returns sanitized 500 without internal diagnostic text", async () => {
    m.list.mockRejectedValueOnce(new Error("TEST_INTERNAL_DATABASE_SECRET"));
    const r = await call();
    expect(r.status).toBe(500);
    const body = await r.text();
    expect(body).not.toContain("TEST_INTERNAL_DATABASE_SECRET");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});
