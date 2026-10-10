import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  db: null as any,
  uploaded: [] as any[],
  gate: null as null | (() => Promise<void>),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, property) => {
        const value = fixture.db[property];
        return typeof value === "function" ? value.bind(fixture.db) : value;
      },
    },
  ),
}));
vi.mock("@gafus/cdn-upload", async (original) => ({
  ...(await original<object>()),
  uploadVetVisitFile: vi.fn(async (bytes, mime, keys) => {
    fixture.uploaded.push({ bytes, mime, keys });
    await fixture.gate?.();
  }),
  vetVisitMediaUrl: vi.fn(async (key) => `https://private.example/${key}?signed=yes`),
}));
import {
  addPetVetAttachment,
  deletePetVetAttachment,
  deletePetVetVisit,
  enqueuePetVetCleanup,
  getPetVetMedia,
  listPetVetVisits,
  petVetVisitSchema,
  savePetVetVisit,
} from "./petVetVisitService";
import { handlePetVetVisitRequest } from "./petVetVisitHttp";
import { enqueueGalleryAccountCleanup } from "../gallery/accountCleanup";

const url = process.env.VET_VISIT_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.pathname !== "/gafus_vet_visits_test"
  )
    throw new Error("Dedicated local vet visits test database required");
}
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
if (url)
  fixture.db = new (require("@prisma/client").PrismaClient)({ datasources: { db: { url } } });
const input = {
  visitedOn: "2026-10-09",
  specialty: "Терапевт",
  doctorName: "",
  clinic: "",
  diagnosis: "",
  conclusion: "",
  notes: "",
};
const pdf = () =>
  new File(["%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"], "Медкарта.pdf", { type: "application/pdf" });

describe("vet visit validation", () => {
  it("requires a specialty and a real calendar day", () => {
    expect(petVetVisitSchema.safeParse({ ...input, specialty: "   " }).success).toBe(false);
    expect(petVetVisitSchema.safeParse({ ...input, visitedOn: "2026-02-30" }).success).toBe(false);
    expect(petVetVisitSchema.safeParse({ ...input, visitedOn: "2099-01-01" }).success).toBe(false);
    expect(
      petVetVisitSchema.parse({ visitedOn: input.visitedOn, specialty: "  Терапевт  " }),
    ).toEqual(input);
  });
});
(url ? describe : describe.skip)("vet visits / dedicated PostgreSQL", () => {
  let owner: string, other: string, petId: string, visitId: string;
  beforeEach(async () => {
    owner = randomUUID();
    other = randomUUID();
    petId = randomUUID();
    fixture.uploaded = [];
    fixture.gate = null;
    await fixture.db.user.createMany({
      data: [owner, other].map((id) => ({ id, username: `vet-test-${id}`, password: "fixture" })),
    });
    await fixture.db.pet.create({
      data: {
        id: petId,
        ownerId: owner,
        name: "Лада",
        type: "DOG",
        breed: "Метис",
        birthDate: new Date("2020-01-01"),
      },
    });
    visitId = (await savePetVetVisit(petId, owner, input)).id;
  });
  afterEach(async () => {
    await fixture.db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await fixture.db.galleryStorageJob.deleteMany({ where: { ownerId: { in: [owner, other] } } });
  });
  afterAll(async () => {
    await fixture.db?.$disconnect();
  });
  it("sorts by visit date and persists every answer", async () => {
    const saved = await savePetVetVisit(petId, owner, {
      ...input,
      visitedOn: "2026-10-10",
      specialty: "Кардиолог",
      clinic: "Клиника",
      notes: "Контроль через месяц",
    });
    expect((await listPetVetVisits(petId, owner)).map((v) => v.id)).toEqual([saved.id, visitId]);
    await savePetVetVisit(
      petId,
      owner,
      { ...input, diagnosis: "Диагноз", conclusion: "Заключение", doctorName: "Иванова" },
      visitId,
    );
    expect((await listPetVetVisits(petId, owner))[1]).toMatchObject({
      diagnosis: "Диагноз",
      conclusion: "Заключение",
      doctorName: "Иванова",
    });
  });
  it("rejects another owner for list, update, deletion and upload", async () => {
    for (const operation of [
      () => listPetVetVisits(petId, other),
      () => savePetVetVisit(petId, other, input, visitId),
      () => deletePetVetVisit(petId, other, visitId),
      () => addPetVetAttachment(petId, other, visitId, pdf()),
    ])
      await expect(operation()).rejects.toMatchObject({ status: 404 });
    expect(fixture.uploaded).toHaveLength(0);
  });
  it("rejects spoofed and oversized files before storage I/O", async () => {
    await expect(
      addPetVetAttachment(
        petId,
        owner,
        visitId,
        new File(["plain text"], "scan.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      addPetVetAttachment(
        petId,
        owner,
        visitId,
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "scan.pdf"),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(fixture.uploaded).toHaveLength(0);
  });
  it("concurrent uploads cannot publish a sixth attachment; rejected sources retain cleanup", async () => {
    for (let i = 0; i < 4; i++) await addPetVetAttachment(petId, owner, visitId, pdf());
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.gate = async () => {
      if (++arrived === 2) release();
      await barrier;
    };
    const results = await Promise.allSettled([
      addPetVetAttachment(petId, owner, visitId, pdf()),
      addPetVetAttachment(petId, owner, visitId, pdf()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.db.petVetAttachment.count({ where: { visitId } })).toBe(5);
    expect(
      await fixture.db.galleryStorageJob.count({ where: { ownerId: owner, kind: "delete" } }),
    ).toBeGreaterThanOrEqual(1);
  });
  it("only the owner receives media URLs; DTOs never contain storage keys", async () => {
    const attachment = await addPetVetAttachment(petId, owner, visitId, pdf());
    const dto = (await listPetVetVisits(petId, owner))[0]!;
    expect(dto.attachments[0]).toMatchObject({ hasPreview: false, mimeType: "application/pdf" });
    expect(dto.attachments[0]).not.toHaveProperty("originalKey");
    await expect(
      getPetVetMedia(petId, other, visitId, attachment.id, "download"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getPetVetMedia("wrong-pet", owner, visitId, attachment.id, "download"),
    ).rejects.toMatchObject({ status: 404 });
    expect((await getPetVetMedia(petId, owner, visitId, attachment.id, "download")).url).toContain(
      "signed=yes",
    );
  });
  it("attachment and visit deletion atomically retain storage cleanup", async () => {
    const a = await addPetVetAttachment(petId, owner, visitId, pdf());
    await deletePetVetAttachment(petId, owner, visitId, a.id);
    expect(
      await fixture.db.galleryStorageJob.count({ where: { dedupeKey: `vet-attachment:${a.id}` } }),
    ).toBe(1);
    await addPetVetAttachment(petId, owner, visitId, pdf());
    await deletePetVetVisit(petId, owner, visitId);
    expect(await fixture.db.petVetAttachment.count({ where: { visitId } })).toBe(0);
    expect(
      await fixture.db.galleryStorageJob.count({ where: { dedupeKey: `vet-visit:${visitId}` } }),
    ).toBe(1);
  });
  it("pet and account removal snapshot private files before cascade", async () => {
    await addPetVetAttachment(petId, owner, visitId, pdf());
    await fixture.db.$transaction(async (tx: any) => {
      await enqueuePetVetCleanup(tx, petId, owner);
      await tx.pet.delete({ where: { id: petId } });
    });
    expect(await fixture.db.galleryStorageJob.count({ where: { ownerId: owner } })).toBe(1);
    await fixture.db.pet.create({
      data: {
        id: petId,
        ownerId: owner,
        name: "Лада",
        type: "DOG",
        breed: "Метис",
        birthDate: new Date("2020-01-01"),
      },
    });
    visitId = (await savePetVetVisit(petId, owner, input)).id;
    await addPetVetAttachment(petId, owner, visitId, pdf());
    await fixture.db.$transaction(async (tx: any) => {
      await enqueueGalleryAccountCleanup(tx, owner, new Date());
      await tx.user.delete({ where: { id: owner } });
    });
    expect(await fixture.db.petVetVisit.count({ where: { ownerId: owner } })).toBe(0);
    expect(await fixture.db.galleryStorageJob.count({ where: { ownerId: owner } })).toBe(2);
  });
  it("shared HTTP transport bounds bodies and keeps authenticated responses private", async () => {
    const path = `http://local/pets/${petId}/vet-visits`;
    const response = await handlePetVetVisitRequest(new Request(path), petId, owner, []);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const denied = await handlePetVetVisitRequest(new Request(path), petId, other, []);
    expect(denied.status).toBe(404);
    const tooBig = await handlePetVetVisitRequest(
      new Request(path, { method: "POST", body: " ".repeat(150_001) }),
      petId,
      owner,
      [],
    );
    expect(tooBig.status).toBe(413);
    const invalid = await handlePetVetVisitRequest(
      new Request(path, { method: "POST", body: "broken" }),
      petId,
      owner,
      [],
    );
    expect(invalid.status).toBe(400);
  });
});
