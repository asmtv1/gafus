/**
 * G05 registered Hono CREATE producer source contract, reconciled after accepted
 * birthDate/weight boundary guards. Core creation is mocked: no Prisma, Redis,
 * actual auth JWT, HTTP socket or real PostgreSQL are exercised by this fixture.
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const m = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock("@gafus/core/services/pets", () => ({
  createPet: m.create,
  getUserPets: vi.fn(),
  getPetById: vi.fn(),
  updatePet: vi.fn(),
  deletePet: vi.fn(),
  deletePetDocument: vi.fn(),
  listPetDocuments: vi.fn(),
  preparePetDocumentDownload: vi.fn(),
  renamePetDocument: vi.fn(),
  uploadPetDocument: vi.fn(),
  updatePetPhoto: vi.fn(),
  getPetWeightHistory: vi.fn(),
  addPetWeightEntry: vi.fn(),
  deletePetWeightEntry: vi.fn(),
  setPetTargetWeight: vi.fn(),
}));
import { petsRoutes } from "./pets";

const BASE = { name: "Бим", type: "DOG", breed: "метис", birthDate: "2020-02-29" };
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const CAPTURE_DIR = ROOT + "/apps/api/g1-g05-pet-create-source-v1/captures";
const CAPTURE_ON =
  process.env.AG1_G05_CAPTURE_DIR === CAPTURE_DIR &&
  process.env.TMPDIR === ROOT + "/apps/api/g1-g05-pet-create-source-v1/scratch/";
const httpRecords: {
  status: number;
  requestFields: string[];
  actor: string;
  success: boolean | null;
}[] = [];

function app(actorId = "synthetic-A") {
  const router = new Hono();
  router.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", { id: actorId, username: "synthetic", role: "USER" });
    await next();
  });
  router.route("/api/v1/pets", petsRoutes);
  return router;
}
async function post(body: Record<string, unknown>, actor = "synthetic-A") {
  const response = await app(actor).request("http://test.local/api/v1/pets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = (await response.json()) as Record<string, unknown>;
  httpRecords.push({
    status: response.status,
    requestFields: Object.keys(body).sort(),
    actor,
    success: typeof responseBody.success === "boolean" ? responseBody.success : null,
  });
  return { response, body: responseBody };
}
beforeEach(() => {
  httpRecords.length = 0;
  vi.clearAllMocks();
  m.create.mockImplementation(async (ownerId: string, payload: typeof BASE) => ({
    id: "synthetic-pet",
    ownerId,
    ...payload,
  }));
});

afterEach((ctx) => {
  if (!CAPTURE_ON) return;
  const id = ctx.task.name.match(/G05-S\d{2}/)?.[0];
  if (!id) return;
  mkdirSync(CAPTURE_DIR, { recursive: true });
  writeFileSync(
    join(CAPTURE_DIR, id + ".json"),
    JSON.stringify(
      {
        caseId: id,
        scope: "real Hono routing + mock Core; no actual JWT/SQL/Redis/media",
        passed: ctx.task.result?.state === "pass",
        observations: httpRecords,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
});
describe("AG1 G05 current server source contract — NOT frozen producer", () => {
  it("G05-S01 required payload yields 201 nested ACK under synthetic actor A", async () => {
    const x = await post(BASE);
    expect(x.response.status).toBe(201);
    expect(x.body).toMatchObject({
      success: true,
      data: { id: "synthetic-pet", ownerId: "synthetic-A" },
    });
    expect(m.create).toHaveBeenCalledWith("synthetic-A", BASE);
  });
  it("G05-S02 client-supplied ownerId is discarded by Hono schema", async () => {
    const x = await post({ ...BASE, ownerId: "forged-other", userId: "forged-other" });
    expect(x.response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith("synthetic-A", BASE);
  });
  it("G05-S03 synthetic B identity determines owner, not submitted body", async () => {
    const x = await post({ ...BASE, ownerId: "synthetic-A" }, "synthetic-B");
    expect(x.response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith("synthetic-B", BASE);
  });
  it("G05-S04 missing required birthDate fails 400 before Core", async () => {
    const { birthDate: _notSent, ...body } = BASE;
    const x = await post(body);
    expect(x.response.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S05 empty name rejected 400 before Core", async () => {
    const x = await post({ ...BASE, name: "" });
    expect(x.response.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S06 invalid Gregorian leap date is 400 before Core write", async () => {
    const x = await post({ ...BASE, birthDate: "2025-02-29" });
    expect(x.response.status).toBe(400);
    expect(x.body.success).not.toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S07 future date is 400 before Core write", async () => {
    const x = await post({ ...BASE, birthDate: "2099-01-01" });
    expect(x.response.status).toBe(400);
    expect(x.body.success).not.toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S08 random non-date is 400 before Core write", async () => {
    const x = await post({ ...BASE, birthDate: "not-a-date" });
    expect(x.response.status).toBe(400);
    expect(x.body.success).not.toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S09 noncanonical DD.MM.YYYY is rejected before Core write", async () => {
    const x = await post({ ...BASE, birthDate: "29.02.2020" });
    expect(x.response.status).toBe(400);
    expect(x.body.success).not.toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S10 negative weightKg is 400 before Core write", async () => {
    const x = await post({ ...BASE, weightKg: -1 });
    expect(x.response.status).toBe(400);
    expect(x.body.success).not.toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S11 zero and above-200 weightKg are both 400, no Core writes", async () => {
    for (const value of [0, 250]) {
      const x = await post({ ...BASE, weightKg: value });
      expect(x.response.status).toBe(400);
      expect(x.body.success).not.toBe(true);
    }
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S12 current Hono allows arbitrary decimal precision weightKg", async () => {
    const x = await post({ ...BASE, weightKg: 0.123456 });
    expect(x.response.status).toBe(201);
  });
  it("G05-S13 string weightKg rejected, numeric body only", async () => {
    const x = await post({ ...BASE, weightKg: "12.5" });
    expect(x.response.status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("G05-S14 optional weight omitted remains absent in Hono payload", async () => {
    const x = await post(BASE);
    expect(x.response.status).toBe(201);
    expect(m.create.mock.calls[0]?.[1]).not.toHaveProperty("weightKg");
  });
  it("G05-S15 Core error is sanitized as generic 500; unknown commit no idempotency proof", async () => {
    m.create.mockRejectedValueOnce(Error("SYNTHETIC_SQL_SECRET"));
    const x = await post(BASE);
    expect(x.response.status).toBe(500);
    expect(JSON.stringify(x.body)).not.toContain("SYNTHETIC_SQL_SECRET");
  });
  it("G05-S16 duplicate submit calls Core twice; no idempotency key guarantee", async () => {
    await post(BASE);
    await post(BASE);
    expect(m.create).toHaveBeenCalledTimes(2);
  });
});
