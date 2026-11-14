/**
 * Opt-in Pet persistence integration test against isolated loopback PostgreSQL18.
 * Never runs against shared, staging or production data.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  claimPetCreationReceipt,
  countOwnedPetDocuments,
  createOwnedPetDocument,
  createPetWithAwards,
  deleteOwnedPetRow,
  deletePetDocumentRow,
  existsOwnedPet,
  findCommittedPetReceipt,
  findOwnedPet,
  findOwnedPetDocument,
  findOwnedPetDocumentForDownload,
  findPetDocumentByUrl,
  listOwnedPetDocuments,
  lockPetOwner,
  readOwnedPetDocumentUrls,
  readOwnedPetPhoto,
  renamePetDocumentRow,
  updateOwnedPetPhoto,
  updateOwnedPetWithAwards,
  withPetSqlTx,
} from "./petRows";
const qa = describe.runIf(process.env.GAFUS_PET_ROWS_REAL_PG === "enabled");
const owner = "pet-rows-qa-owner",
  foreign = "pet-rows-qa-foreign";
const uuid = "e1451871-35b4-4b0a-83c5-f2ea453c2501";
const hash = "a".repeat(64);
let petId = "",
  documentId = "",
  ready = false;

qa("Pet SQL row and receipt isolation on PostgreSQL18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_pet_rows_qa");
    const current = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(current[0]?.db).toBe("gafus_pet_rows_qa");
    expect(current[0]?.version).toBeGreaterThanOrEqual(180000);
    ready = true;
    await prisma.user.createMany({
      data: [
        { id: owner, username: owner, password: "synthetic-password", role: "USER" },
        { id: foreign, username: foreign, password: "synthetic-password", role: "USER" },
      ],
    });
  });
  afterAll(async () => {
    if (!ready) return;
    await prisma.pet.deleteMany({ where: { ownerId: { in: [owner, foreign] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    await prisma.$disconnect();
  });

  it("atomically writes one owner profile and replayable PetCreateReceipt", async () => {
    const result = await withPetSqlTx(
      async (tx) => {
        const ownerRows = await lockPetOwner(tx, owner);
        expect(ownerRows).toHaveLength(1);
        const pet = await createPetWithAwards(
          {
            ownerId: owner,
            name: "Local synthetic",
            breed: "Mixed",
            birthDate: new Date("2023-04-01T00:00:00Z"),
            type: "DOG",
          },
          tx,
        );
        const claimed = await claimPetCreationReceipt(tx, {
          ownerId: owner,
          clientRequestId: uuid,
          payloadHash: hash,
          petId: pet.id,
          responseJson: JSON.stringify({ success: true, data: pet }),
        });
        expect(claimed).toHaveLength(1);
        return pet;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    petId = result.id;
    expect((await findOwnedPet(owner, petId))?.id).toBe(petId);
    expect(await existsOwnedPet(foreign, petId)).toBeNull();
    expect((await findCommittedPetReceipt(owner, uuid))[0]?.petId).toBe(petId);
    expect(await findCommittedPetReceipt(foreign, uuid)).toHaveLength(0);
  });
  it("a duplicate owner request key never commits a second Pet row", async () => {
    const before = await prisma.pet.count({ where: { ownerId: owner } });
    await expect(
      withPetSqlTx(async (tx) => {
        const alternative = await createPetWithAwards(
          {
            ownerId: owner,
            name: "Never committed",
            breed: "Mixed",
            birthDate: new Date("2023-04-01T00:00:00Z"),
            type: "DOG",
          },
          tx,
        );
        const rows = await claimPetCreationReceipt(tx, {
          ownerId: owner,
          clientRequestId: uuid,
          payloadHash: hash,
          petId: alternative.id,
          responseJson: JSON.stringify({ success: true, data: alternative }),
        });
        expect(rows).toHaveLength(0);
        throw new Error("DUPLICATE_OWNER_RECEIPT_ROLLBACK");
      }),
    ).rejects.toThrow("DUPLICATE_OWNER_RECEIPT_ROLLBACK");
    expect(await prisma.pet.count({ where: { ownerId: owner } })).toBe(before);
    expect((await findCommittedPetReceipt(owner, uuid))[0]?.petId).toBe(petId);
  });
  it("profile mutation and owner-fenced document writes remain transactional", async () => {
    await withPetSqlTx(async (tx) => {
      await lockPetOwner(tx, owner);
      await updateOwnedPetWithAwards(tx, owner, petId, {
        notes: "Private synthetic notes",
        neckGirthCm: 40,
      });
      await updateOwnedPetPhoto(tx, owner, petId, "private/synthetic-qa.jpg");
      const doc = await createOwnedPetDocument(tx, {
        petId,
        ownerId: owner,
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        url: "private/synthetic-report.pdf",
      });
      documentId = doc.id;
      expect(await countOwnedPetDocuments(tx, owner, petId)).toBe(1);
    });
    expect((await readOwnedPetPhoto(owner, petId))?.photoUrl).toBe("private/synthetic-qa.jpg");
    expect(await readOwnedPetPhoto(foreign, petId)).toBeNull();
    expect(await listOwnedPetDocuments(foreign, petId)).toHaveLength(0);
    expect((await findOwnedPetDocument(owner, documentId, petId))?.ownerId).toBe(owner);
    expect(await findOwnedPetDocument(foreign, documentId, petId)).toBeNull();
    expect((await findPetDocumentByUrl(owner, petId, "private/synthetic-report.pdf"))?.id).toBe(
      documentId,
    );
  });
  it("owner-scoped document rename, download projection and pet cascade remain intact", async () => {
    expect((await findOwnedPetDocumentForDownload(owner, documentId, petId))?.name).toBe(
      "report.pdf",
    );
    await renamePetDocumentRow(documentId, "new-report.pdf");
    expect((await findOwnedPetDocumentForDownload(owner, documentId, petId))?.name).toBe(
      "new-report.pdf",
    );
    expect(await findOwnedPetDocumentForDownload(foreign, documentId, petId)).toBeNull();
    const deleted = await withPetSqlTx(async (tx) => {
      await lockPetOwner(tx, owner);
      const urls = await readOwnedPetDocumentUrls(tx, owner, petId);
      expect(urls).toEqual([{ url: "private/synthetic-report.pdf" }]);
      await deletePetDocumentRow(documentId, tx);
      expect(await countOwnedPetDocuments(tx, owner, petId)).toBe(0);
      return deleteOwnedPetRow(tx, owner, petId);
    });
    expect(deleted.id).toBe(petId);
    expect(await findOwnedPet(owner, petId)).toBeNull();
    expect(await prisma.petDocument.count({ where: { petId } })).toBe(0);
  });
});
